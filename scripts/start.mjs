// かんたん起動スクリプト。
// 初回でも npm install → ビルド → サーバー起動 → ブラウザを開く、まで自動で行う。
// 外部への通信は npm install（依存パッケージの取得）のみで、データ送信は一切ない。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

function log(message) {
  console.log(`\n[36m▶ ${message}[0m`);
}

function fail(message) {
  console.error(`\n[31m✖ ${message}[0m`);
  if (isWindows) spawnSync('cmd', ['/c', 'pause'], { stdio: 'inherit' });
  process.exit(1);
}

// Node.js のバージョン確認（node:sqlite が必要なため 22.13 以上）
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  fail(
    `Node.js 22.13 以上が必要です（現在: v${process.versions.node}）。\n` +
      'https://nodejs.org/ja の LTS 版をインストールしてから、もう一度実行してください。',
  );
}

function run(command, args, label) {
  log(label);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) fail(`${label}に失敗しました。`);
}

// 1. 依存パッケージ（初回のみ。インターネット接続が必要）
if (!existsSync(path.join(root, 'node_modules'))) {
  run(npm, ['install'], '初回セットアップ中（依存パッケージの取得。数分かかります）');
}

// 2. ビルド（成果物が無い場合のみ）
const needsBuild =
  !existsSync(path.join(root, 'client', 'dist', 'index.html')) ||
  !existsSync(path.join(root, 'server', 'dist', 'index.js'));
if (needsBuild) {
  run(npm, ['run', 'build'], 'アプリをビルド中（初回のみ。1 分ほどかかります）');
}

// 3. 空いているポートを探す（既定 3000 が使用中なら 3001 以降を試す）
function isPortFree(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

const host = process.env.HOST ?? '127.0.0.1';
const wanted = Number(process.env.PORT ?? 3000);
let port = wanted;
for (let i = 0; i < 20; i += 1) {
  if (await isPortFree(port, host)) break;
  port += 1;
  if (i === 19) fail(`ポート ${wanted}〜${port} がすべて使用中です。`);
}
if (port !== wanted) {
  console.log(`[33mポート ${wanted} は使用中のため ${port} を使います。[0m`);
}

// 4. サーバー起動
const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
const url = `http://${displayHost}:${port}`;

log('サーバーを起動中');
const server = spawn(
  process.execPath,
  ['--no-warnings=ExperimentalWarning', path.join(root, 'server', 'dist', 'index.js')],
  { cwd: root, stdio: 'inherit', env: { ...process.env, HOST: host, PORT: String(port) } },
);

server.on('exit', (code) => process.exit(code ?? 0));
const stop = () => {
  server.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// 5. 起動を待ってブラウザを開く（ローカルのみ）
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      // まだ起動していない
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

if (await waitForServer()) {
  console.log(`\n[32m✔ 起動しました: ${url}[0m`);
  if (host === '0.0.0.0') {
    console.log('  社内 LAN の他の PC からは http://<このPCのIPアドレス>:' + port + ' でアクセスできます。');
  }
  console.log('  終了するには、このウィンドウで Ctrl + C を押すか、ウィンドウを閉じてください。\n');

  if (process.env.NO_OPEN !== '1') {
    const opener = isWindows
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
    spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref();
  }
} else {
  fail('サーバーの起動を確認できませんでした。上のログを確認してください。');
}
