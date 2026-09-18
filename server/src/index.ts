// エントリポイント: 環境変数を読み、DB を開いて待ち受ける。
import { mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { DB_FILE, migrateLegacyData, resolveDataDir } from './dataDir.js';
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

const db = createDb(dbPath);
const app = createApp(db, { clientDist: path.join(repoRoot, 'client', 'dist'), dataDir });

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
