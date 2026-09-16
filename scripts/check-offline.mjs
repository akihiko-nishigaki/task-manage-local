// ビルド成果物とサーバーコードに外部 URL（http/https）が含まれていないことを確認する。
// 社外への通信が混入していないことを機械的に保証するためのチェック。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const targets = ['client/dist', 'server/dist', 'server/src', 'client/src', 'shared'];
const allow = [
  /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/,
  /https?:\/\/www\.w3\.org\//, // SVG namespace 等
  /https?:\/\/reactjs\.org\//, // React の開発時エラーメッセージ URL（通信は発生しない）
  /https?:\/\/react\.dev\//,
  /https?:\/\/github\.com\//, // ライブラリ内コメント
  /https?:\/\/vitejs\.dev\//,
  /https?:\/\/vite\.dev\//,
  /https?:\/\/expressjs\.com\//,
  /https?:\/\/developer\.mozilla\.org\//,
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs|ts|tsx|css|html|json)$/.test(e)) out.push(p);
  }
  return out;
}

let bad = 0;
for (const t of targets) {
  for (const f of walk(t)) {
    const text = readFileSync(f, 'utf8');
    const re = /https?:\/\/[^\s"'`)<>]+/g;
    let m;
    while ((m = re.exec(text))) {
      if (allow.some((a) => a.test(m[0]))) continue;
      console.error(`外部 URL を検出: ${f}: ${m[0]}`);
      bad++;
    }
  }
}
if (bad) {
  console.error(`\n${bad} 件の外部 URL があります。社外通信の可能性を確認してください。`);
  process.exit(1);
}
console.log('OK: 外部 URL は検出されませんでした。');
