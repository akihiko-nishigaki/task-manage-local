// インストール版の起動役。
// 既に起動していればそのブラウザを開くだけ、未起動ならこのプロセスでサーバーを動かす。
// 外部への通信は一切行わない。
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const APP_DIR = __dirname;
const HOST = '127.0.0.1';
const BASE_PORT = Number(process.env.TASKMANAGE_PORT || process.env.PORT || 3000);
const PORT_TRIES = 20;

/** データの保存先。既定は %LOCALAPPDATA%\TaskManage\data（Windows 以外はホーム配下）。 */
function resolveDataDir() {
  if (process.env.TASKMANAGE_DATA_DIR) return path.resolve(process.env.TASKMANAGE_DATA_DIR);
  const base =
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
      : path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'TaskManage', 'data');
}

const DATA_DIR = resolveDataDir();
const PID_FILE = path.join(DATA_DIR, 'app.pid');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** その番号で「このアプリ」が応答しているか。 */
async function isOurApp(port) {
  try {
    const res = await fetch(`http://${HOST}:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const body = await res.json();
    return body && body.ok === true;
  } catch {
    return false;
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, HOST);
  });
}

function openBrowser(url) {
  if (process.env.TASKMANAGE_NO_OPEN === '1') return;
  const cmd =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* ブラウザを開けなくても起動自体は続ける */
  }
}

async function main() {
  // 1. 既に動いているインスタンスがあれば、それを開くだけで終わる
  for (let p = BASE_PORT; p < BASE_PORT + PORT_TRIES; p += 1) {
    if (await isOurApp(p)) {
      openBrowser(`http://${HOST}:${p}`);
      return;
    }
  }

  // 2. 空いているポートを選ぶ
  let port = BASE_PORT;
  let found = false;
  for (let i = 0; i < PORT_TRIES; i += 1) {
    if (await isPortFree(port)) {
      found = true;
      break;
    }
    port += 1;
  }
  if (!found) {
    console.error(`ポート ${BASE_PORT} 〜 ${port} がすべて使用中です。`);
    process.exit(1);
  }

  // 3. サーバーを同じプロセスで起動する
  fs.mkdirSync(DATA_DIR, { recursive: true });
  process.env.HOST = HOST;
  process.env.PORT = String(port);
  process.env.DATA_DIR = DATA_DIR;
  process.env.WEB_DIR = path.join(APP_DIR, 'web');
  require(path.join(APP_DIR, 'server.cjs'));

  try {
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch {
    /* 書けなくても起動は続ける（停止はタスクマネージャーから行える） */
  }
  const cleanup = () => {
    try {
      if (fs.readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) fs.unlinkSync(PID_FILE);
    } catch {
      /* 既に消えている場合は何もしない */
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  // 4. 起動を待ってブラウザを開く
  const url = `http://${HOST}:${port}`;
  for (let i = 0; i < 80; i += 1) {
    if (await isOurApp(port)) {
      openBrowser(url);
      return;
    }
    await sleep(250);
  }
  console.error('サーバーの起動を確認できませんでした。');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
