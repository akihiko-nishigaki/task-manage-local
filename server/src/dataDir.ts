// データ（SQLite ファイル）の保存先の決定と、旧保存先からの引き継ぎ。
//
// v0.2.0 まではアプリを展開したフォルダ直下の data/ に保存していたため、
// 新しい zip を別フォルダに展開するとデータが「消えた」ように見える事故が起きた。
// v0.2.1 からは OS ごとのユーザーデータ領域を既定にし、旧場所に DB があれば初回起動時にコピーして引き継ぐ。
import { constants, copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const APP_DIR_NAME = 'task-manage-local';
export const DB_FILE = 'tasks.db';
/** SQLite 本体と WAL 関連ファイル。停止直後は -wal / -shm が残っていることがあるので一緒に扱う。 */
export const DB_SUFFIXES = ['', '-wal', '-shm'] as const;
export const MOVED_NOTE = 'MOVED.txt';

export interface PlatformInfo {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  homedir: string;
}

/**
 * OS ごとの既定の保存先。
 * - Windows: %LOCALAPPDATA%\task-manage-local\data
 * - macOS:   ~/Library/Application Support/task-manage-local/data
 * - その他:  $XDG_DATA_HOME/task-manage-local/data（未設定なら ~/.local/share/...）
 */
export function defaultDataDir({ platform, env, homedir }: PlatformInfo): string {
  if (platform === 'win32') {
    const base = env['LOCALAPPDATA'] || env['APPDATA'] || path.join(homedir, 'AppData', 'Local');
    return path.join(base, APP_DIR_NAME, 'data');
  }
  if (platform === 'darwin') {
    return path.join(homedir, 'Library', 'Application Support', APP_DIR_NAME, 'data');
  }
  const base = env['XDG_DATA_HOME'] || path.join(homedir, '.local', 'share');
  return path.join(base, APP_DIR_NAME, 'data');
}

export interface ResolveOptions extends PlatformInfo {
  /** 相対パスの DATA_DIR を解決する基準（通常は process.cwd()） */
  cwd: string;
}

/** DATA_DIR が指定されていればそれを、無ければ OS 既定の保存先を返す。 */
export function resolveDataDir(options: ResolveOptions): string {
  const explicit = options.env['DATA_DIR'];
  if (explicit && explicit.trim() !== '') return path.resolve(options.cwd, explicit);
  return defaultDataDir(options);
}

export interface MigrationResult {
  migrated: boolean;
  from: string;
  to: string;
  /** コピーしたファイル名（tasks.db, tasks.db-wal, ...） */
  files: string[];
}

/**
 * 旧保存先（展開フォルダ直下の data/）に DB があり、新保存先にまだ DB が無ければコピーして引き継ぐ。
 * - 旧ファイルは削除しない（万一に備えて残す）。代わりに旧フォルダへ MOVED.txt を置く。
 * - 途中で失敗しても新保存先に中途半端な tasks.db が残らないよう、一時名でコピーしてから一括で rename する。
 */
export function migrateLegacyData(legacyDir: string, targetDir: string): MigrationResult {
  const result: MigrationResult = { migrated: false, from: legacyDir, to: targetDir, files: [] };
  if (path.resolve(legacyDir) === path.resolve(targetDir)) return result;
  const legacyDb = path.join(legacyDir, DB_FILE);
  if (!existsSync(legacyDb)) return result;
  if (existsSync(path.join(targetDir, DB_FILE))) return result; // 新しい側に既にデータがあれば触らない

  mkdirSync(targetDir, { recursive: true });
  const staged: { tmp: string; final: string; name: string }[] = [];
  try {
    for (const suffix of DB_SUFFIXES) {
      const src = legacyDb + suffix;
      if (!existsSync(src)) continue;
      const name = DB_FILE + suffix;
      const final = path.join(targetDir, name);
      const tmp = `${final}.migrating`;
      copyFileSync(src, tmp, constants.COPYFILE_FICLONE);
      staged.push({ tmp, final, name });
    }
    for (const item of staged) renameSync(item.tmp, item.final);
  } catch (error) {
    for (const item of staged) rmSync(item.tmp, { force: true });
    throw error;
  }
  result.files = staged.map((item) => item.name);

  try {
    writeFileSync(
      path.join(legacyDir, MOVED_NOTE),
      [
        `データの保存先は次の場所に移動しました（${new Date().toISOString()}）:`,
        targetDir,
        '',
        'このフォルダに残っている tasks.db は引き継ぎ時のコピー元です。',
        '新しい保存先で問題なく動作していることを確認できたら削除して構いません。',
        '保存先を変えたい場合は環境変数 DATA_DIR で指定してください。',
        '',
      ].join('\n'),
      'utf8',
    );
  } catch {
    // 案内ファイルが書けなくても引き継ぎ自体は完了している
  }
  result.migrated = true;
  return result;
}
