// エントリポイント: 環境変数を読み、DB を開いて待ち受ける。
import { mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { BACKUP_DIR_NAME, backupIfDue } from './backup.js';
import { DB_FILE, isSharedMode, migrateLegacyData, resolveDataDir } from './dataDir.js';
import { createDb } from './db.js';

const SCHEME = 'http';

/** ワークスペースのルート（package.json に workspaces がある階層）を探す。 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'package.json');
    if (existsSync(candidate) && existsSync(path.join(dir, 'shared', 'types.ts'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(here);

const host = process.env['HOST'] ?? '127.0.0.1';
const port = Number(process.env['PORT'] ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT が不正です: ${process.env['PORT']}`);
  process.exit(1);
}

// 保存先: DATA_DIR があればそれ、無ければ OS のユーザーデータ領域（展開フォルダの外）。
// 旧バージョン（展開フォルダ直下の data/）に DB が残っていれば初回起動時にコピーして引き継ぐ。
const dataDir = resolveDataDir({
  env: process.env,
  platform: process.platform,
  homedir: os.homedir(),
  cwd: process.cwd(),
});
if (!process.env['DATA_DIR']) {
  const migration = migrateLegacyData(path.join(repoRoot, 'data'), dataDir);
  if (migration.migrated) {
    console.error(
      `[data] 旧保存先 ${migration.from} のデータを ${migration.to} へ引き継ぎました（${migration.files.join(', ')}）`,
    );
  }
}
mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, DB_FILE);
console.error(`[data] ${dbPath}`);

// WEB_DIR: インストール版のように client/dist と別構成で配置する場合に指定する。
const webDir = process.env['WEB_DIR']
  ? path.resolve(process.cwd(), process.env['WEB_DIR'])
  : path.join(repoRoot, 'client', 'dist');

// 共有フォルダ運用: DB_MODE=shared、または保存先がネットワーク共有（\サーバー\共有）のとき。
// マップしたドライブ（Z: など）は見分けられないので、その場合は DB_MODE=shared を指定する。
const sharedMode = isSharedMode(process.env, dataDir);
if (sharedMode) console.error('[data] 共有フォルダ運用モード（通常のジャーナル方式・自動バックアップあり）');

let db: ReturnType<typeof createDb>;
try {
  db = createDb(dbPath, { shared: sharedMode });
  if (sharedMode) {
    const check = db.prepare('PRAGMA quick_check').all();
    const result = check.map((row) => String(Object.values(row)[0])).join(', ');
    if (result !== 'ok') {
      throw new Error(
        `データの整合性検査に失敗しました（${result}）。${path.join(dataDir, BACKUP_DIR_NAME)} の最新のバックアップから戻してください。`,
      );
    }
  }
} catch (error) {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const app = createApp(db, { clientDist: webDir, dataDir, mode: sharedMode ? 'shared' : 'local' });

// 共有フォルダ運用では、起動時と 1 時間ごとに「必要なら」バックアップを作る（12 時間以内にあれば作らない）。
if (sharedMode) {
  const keep = Number(process.env['BACKUP_KEEP'] ?? 30);
  const runBackup = (): void => {
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
  runBackup();
  setInterval(runBackup, 60 * 60 * 1000).unref();
}

const server = app.listen(port, host, () => {
  const address = server.address();
  const shown = typeof address === 'object' && address !== null ? address.port : port;
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  console.log(`${SCHEME}://${displayHost}:${shown}`);
});

server.on('error', (error) => {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

function shutdown(): void {
  server.close(() => {
    try {
      db.close();
    } catch {
      // 既に閉じている場合は無視
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
