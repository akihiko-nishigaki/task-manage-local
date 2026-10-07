// 複数のデータ（共有 / 個人など）を切り替えて使うための管理。
//
// 1 つのサーバープロセスが複数の SQLite を持ち、リクエストの X-Workspace ヘッダーで使うデータを選ぶ。
// - 最初に起動したデータ（primary）は DATA_DIR / 既定の保存先から決まる。ヘッダーが無ければこれを使う。
// - 追加したデータは workspaces.json（この PC のユーザーデータ領域）に保存する。共有フォルダには置かない。
// - 削除は「一覧から外す」だけで、データのファイルは消さない。
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Express } from 'express';
import { createApp } from './app.js';
import { BACKUP_DIR_NAME, backupIfDue } from './backup.js';
import { DB_FILE, isSharedMode } from './dataDir.js';
import { createDb } from './db.js';
import type { Db } from './db.js';
import { HttpError, notFoundError, validationError } from './errors.js';

export const PRIMARY_ID = 'main';
export const WORKSPACE_HEADER = 'x-workspace';
const MAX_WORKSPACES = 10;
const MAX_NAME_LENGTH = 40;

export interface WorkspaceInfo {
  id: string;
  name: string;
  dataDir: string;
  mode: 'local' | 'shared';
  primary: boolean;
}

interface StoredWorkspace {
  id: string;
  name: string;
  dataDir: string;
  shared?: boolean;
}

interface ConfigFile {
  primaryName?: string;
  workspaces: StoredWorkspace[];
}

interface Slot {
  info: WorkspaceInfo;
  db?: Db;
  app?: Express;
  timer?: NodeJS.Timeout;
}

/** 起動時と 1 時間ごとに「必要なら」バックアップを作る（12 時間以内にあれば作らない）。 */
export function startBackups(db: Db, dataDir: string): NodeJS.Timeout {
  const keep = Number(process.env['BACKUP_KEEP'] ?? 30);
  const run = (): void => {
    try {
      const made = backupIfDue(db, {
        dir: path.join(dataDir, BACKUP_DIR_NAME),
        keep: Number.isInteger(keep) && keep > 0 ? keep : 30,
        minIntervalMs: 12 * 60 * 60 * 1000,
      });
      if (made) console.error(`[backup] ${made}`);
    } catch (error) {
      console.error('[backup] 失敗しました:', error instanceof Error ? error.message : String(error));
    }
  };
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return timer;
}

/** データを開く。共有フォルダ運用では、整合性も検査する（壊れていれば例外）。 */
export function openWorkspaceDb(dataDir: string, shared: boolean): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = createDb(path.join(dataDir, DB_FILE), { shared });
  if (shared) {
    const check = db.prepare('PRAGMA quick_check').all();
    const result = check.map((row) => String(Object.values(row)[0])).join(', ');
    if (result !== 'ok') {
      db.close();
      throw new Error(
        `データの整合性検査に失敗しました（${result}）。${path.join(dataDir, BACKUP_DIR_NAME)} の最新のバックアップから戻してください。`,
      );
    }
  }
  return db;
}

/** そこにある tasks.db がこのアプリのものか（または空か）を、書き込まずに確かめる。 */
function assertOurDatabase(dataDir: string): void {
  const file = path.join(dataDir, DB_FILE);
  if (!existsSync(file)) return;
  let probe: DatabaseSync | undefined;
  try {
    probe = new DatabaseSync(file);
    const tables = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row['name']));
    if (tables.length > 0 && !tables.includes('schema_migrations')) {
      throw validationError(`${file} は、このアプリのデータではありません`);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw validationError(`${file} を開けませんでした（データではないか、壊れています）`);
  } finally {
    try {
      probe?.close();
    } catch {
      // 閉じられなくても検査結果には影響しない
    }
  }
}

function sameDir(a: string, b: string): boolean {
  const norm = (value: string): string => {
    const resolved = path.resolve(value).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
}

function cleanName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw validationError('名前を入力してください');
  const name = value.trim();
  if (name.length > MAX_NAME_LENGTH) throw validationError(`名前は ${MAX_NAME_LENGTH} 文字以内で入力してください`);
  return name;
}

export interface ManagerOptions {
  /** 最初に開いたデータ。ヘッダー無しのリクエスト（launch.cjs の疎通確認など）はこれを使う */
  primary: { dataDir: string; shared: boolean; db: Db };
  /** 追加したデータの一覧を保存するファイル。null なら保存しない（テスト用） */
  configFile: string | null;
  /** 保存場所を省略して追加したときに、自動で作る場所の親フォルダ */
  autoDir: string;
}

export class WorkspaceManager {
  private readonly slots = new Map<string, Slot>();
  private readonly configFile: string | null;
  private readonly autoDir: string;
  private primaryName: string | undefined;

  constructor(options: ManagerOptions) {
    this.configFile = options.configFile;
    this.autoDir = options.autoDir;
    const config = this.readConfig();
    this.primaryName = config.primaryName;

    const primary = options.primary;
    this.slots.set(PRIMARY_ID, {
      info: {
        id: PRIMARY_ID,
        name: this.primaryName ?? (primary.shared ? '共有' : 'マイデータ'),
        dataDir: primary.dataDir,
        mode: primary.shared ? 'shared' : 'local',
        primary: true,
      },
      db: primary.db,
      app: createApp(primary.db, {
        dataDir: primary.dataDir,
        mode: primary.shared ? 'shared' : 'local',
      }),
    });

    for (const stored of config.workspaces) {
      // 主データと同じ場所を指している古い設定は読み飛ばす
      if (sameDir(stored.dataDir, primary.dataDir)) continue;
      this.slots.set(stored.id, {
        info: {
          id: stored.id,
          name: stored.name,
          dataDir: stored.dataDir,
          mode: stored.shared ? 'shared' : 'local',
          primary: false,
        },
      });
    }
  }

  list(): WorkspaceInfo[] {
    return [...this.slots.values()].map((slot) => ({ ...slot.info }));
  }

  /** id（省略時は主データ）の db と app を返す。初めて使うときに開く。 */
  get(id: string | undefined): { info: WorkspaceInfo; db: Db; app: Express } {
    const key = id && id !== '' ? id : PRIMARY_ID;
    const slot = this.slots.get(key);
    if (!slot) throw notFoundError(`データ「${key}」は登録されていません`);
    if (!slot.db || !slot.app) {
      try {
        slot.db = openWorkspaceDb(slot.info.dataDir, slot.info.mode === 'shared');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new HttpError(
          503,
          'workspace_unavailable',
          `データ「${slot.info.name}」（${slot.info.dataDir}）を開けませんでした: ${reason}`,
        );
      }
      slot.app = createApp(slot.db, { dataDir: slot.info.dataDir, mode: slot.info.mode });
      if (slot.info.mode === 'shared') slot.timer = startBackups(slot.db, slot.info.dataDir);
    }
    return { info: slot.info, db: slot.db, app: slot.app };
  }

  add(input: { name: unknown; dataDir?: unknown; shared?: unknown }): WorkspaceInfo {
    const name = cleanName(input.name);
    if (this.slots.size >= MAX_WORKSPACES) {
      throw validationError(`データは ${MAX_WORKSPACES} 個までです`);
    }
    this.assertNameFree(name, undefined);

    const id = `w${randomBytes(4).toString('hex')}`;
    let dataDir: string;
    if (typeof input.dataDir === 'string' && input.dataDir.trim() !== '') {
      dataDir = input.dataDir.trim();
      if (!path.isAbsolute(dataDir)) {
        throw validationError('保存場所は、ドライブ名や \\\\サーバー名 から始まる完全なパスで指定してください');
      }
      dataDir = path.resolve(dataDir);
    } else {
      dataDir = path.join(this.autoDir, id);
    }
    for (const slot of this.slots.values()) {
      if (sameDir(slot.info.dataDir, dataDir)) {
        throw validationError(`その保存場所は「${slot.info.name}」で使っています`);
      }
    }
    const shared = typeof input.shared === 'boolean' ? input.shared : isSharedMode({}, dataDir);

    assertOurDatabase(dataDir);
    // 追加する前に実際に開いて、保存場所に書き込めること・データが読めることを確かめる
    let db: Db;
    try {
      db = openWorkspaceDb(dataDir, shared);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw validationError(`その保存場所を使えませんでした: ${reason}`);
    }

    const slot: Slot = {
      info: { id, name, dataDir, mode: shared ? 'shared' : 'local', primary: false },
      db,
      app: createApp(db, { dataDir, mode: shared ? 'shared' : 'local' }),
    };
    if (shared) slot.timer = startBackups(db, dataDir);
    this.slots.set(id, slot);
    this.save();
    return { ...slot.info };
  }

  rename(id: string, nameInput: unknown): WorkspaceInfo {
    const slot = this.slots.get(id);
    if (!slot) throw notFoundError(`データ「${id}」は登録されていません`);
    const name = cleanName(nameInput);
    this.assertNameFree(name, id);
    slot.info.name = name;
    if (slot.info.primary) this.primaryName = name;
    this.save();
    return { ...slot.info };
  }

  /** 一覧から外す。データのファイルは消さない。 */
  remove(id: string): void {
    const slot = this.slots.get(id);
    if (!slot) throw notFoundError(`データ「${id}」は登録されていません`);
    if (slot.info.primary) throw validationError('最初のデータは一覧から外せません');
    if (slot.timer) clearInterval(slot.timer);
    try {
      slot.db?.close();
    } catch {
      // 既に閉じている場合は無視
    }
    this.slots.delete(id);
    this.save();
  }

  closeAll(): void {
    for (const slot of this.slots.values()) {
      if (slot.timer) clearInterval(slot.timer);
      try {
        slot.db?.close();
      } catch {
        // 既に閉じている場合は無視
      }
    }
  }

  private assertNameFree(name: string, exceptId: string | undefined): void {
    for (const slot of this.slots.values()) {
      if (slot.info.id !== exceptId && slot.info.name.toLowerCase() === name.toLowerCase()) {
        throw validationError(`「${name}」という名前はすでに使っています`);
      }
    }
  }

  private readConfig(): ConfigFile {
    if (!this.configFile || !existsSync(this.configFile)) return { workspaces: [] };
    try {
      const raw = JSON.parse(readFileSync(this.configFile, 'utf8')) as Partial<ConfigFile>;
      const workspaces = Array.isArray(raw.workspaces)
        ? raw.workspaces.filter(
            (w): w is StoredWorkspace =>
              !!w &&
              typeof w.id === 'string' &&
              /^w[0-9a-f]{8}$/.test(w.id) &&
              typeof w.name === 'string' &&
              typeof w.dataDir === 'string' &&
              path.isAbsolute(w.dataDir),
          )
        : [];
      const config: ConfigFile = { workspaces };
      if (typeof raw.primaryName === 'string' && raw.primaryName.trim() !== '') config.primaryName = raw.primaryName;
      return config;
    } catch (error) {
      console.error('[workspaces] 設定ファイルを読めませんでした（無視します）:', error instanceof Error ? error.message : error);
      return { workspaces: [] };
    }
  }

  /** 一時ファイルに書いてから置き換える（書き込み途中で止まっても設定が壊れないように） */
  private save(): void {
    if (!this.configFile) return;
    const config: ConfigFile = {
      ...(this.primaryName ? { primaryName: this.primaryName } : {}),
      workspaces: [...this.slots.values()]
        .filter((slot) => !slot.info.primary)
        .map((slot) => ({
          id: slot.info.id,
          name: slot.info.name,
          dataDir: slot.info.dataDir,
          shared: slot.info.mode === 'shared',
        })),
    };
    mkdirSync(path.dirname(this.configFile), { recursive: true });
    const tmp = `${this.configFile}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
      renameSync(tmp, this.configFile);
    } catch (error) {
      rmSync(tmp, { force: true });
      throw new HttpError(
        500,
        'internal',
        `設定を保存できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
