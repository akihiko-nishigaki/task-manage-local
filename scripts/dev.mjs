// 開発用: API サーバー(3000) と Vite 開発サーバー(5173) を同時に起動する。
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', 'server'], { stdio: 'inherit', env: process.env }),
  spawn('npm', ['run', 'dev', '-w', 'client'], { stdio: 'inherit', env: process.env }),
];
const stop = () => { for (const p of procs) p.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code && code !== 0) stop(); });
