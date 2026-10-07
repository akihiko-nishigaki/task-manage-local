// エントリポイント: 環境変数を読み、DB を開いて待ち受ける。
import { mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultDataDir, isSharedMode, migrateLegacyData, resolveDataDir } from './dataDir.js';
import { createServerApp } from './serverApp.js';
import { WorkspaceManager, openWorkspaceDb, startBackups } from './workspaces.js';

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
const platformInfo = {
  env: process.env,
  platform: process.platform,
  homedir: os.homedir(),
  cwd: process.cwd(),
};
const dataDir = resolveDataDir(platformInfo);
if (!process.env['DATA_DIR']) {
  const migration = migrateLegacyData(path.join(repoRoot, 'data'), dataDir);
  if (migration.migrated) {
    console.error(
      `[data] 旧保存先 ${migration.from} のデータを ${migration.to} へ引き継ぎました（${migration.files.join(', ')}）`,
    );
  }
}
mkdirSync(dataDir, { recursive: true });
console.error(`[data] ${path.join(dataDir, 'tasks.db')}`);

// WEB_DIR: インストール版のように client/dist と別構成で配置する場合に指定する。
const webDir = process.env['WEB_DIR']
  ? path.resolve(process.cwd(), process.env['WEB_DIR'])
  : path.join(repoRoot, 'client', 'dist');

// 共有フォルダ運用: DB_MODE=shared、または保存先がネットワーク共有（\\サーバー\共有）のとき。
// マップしたドライブ（Z: など）は見分けられないので、その場合は DB_MODE=shared を指定する。
const sharedMode = isSharedMode(process.env, dataDir);
if (sharedMode) console.error('[data] 共有フォルダ運用モード（通常のジャーナル方式・自動バックアップあり）');

let primaryDb: ReturnType<typeof openWorkspaceDb>;
try {
  primaryDb = openWorkspaceDb(dataDir, sharedMode);
} catch (error) {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
if (sharedMode) startBackups(primaryDb, dataDir);

// 追加したデータ（共有 / 個人の切り替え）の一覧は、この PC のユーザーデータ領域に置く（共有フォルダには置かない）。
// WORKSPACES_FILE で場所を変えられる（検証用）。
const localBase = path.dirname(defaultDataDir(platformInfo));
const manager = new WorkspaceManager({
  primary: { dataDir, shared: sharedMode, db: primaryDb },
  configFile: process.env['WORKSPACES_FILE'] ? path.resolve(process.env['WORKSPACES_FILE']) : path.join(localBase, 'workspaces.json'),
  autoDir: path.join(localBase, 'workspaces'),
});

// データの追加・削除は、この PC の中だけで使っているとき（ループバック待ち受け）に限る。
const loopback = host === '127.0.0.1' || host === '::1' || host === 'localhost';
const app = createServerApp(manager, { clientDist: webDir, allowManage: loopback });

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
    manager.closeAll();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
