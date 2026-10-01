// Windows 向けインストーラー一式を組み立てる。
// 出力: dist-installer/TaskManage-Setup-v<version>.zip
// サーバーは 1 ファイルにバンドルするため、配布物に node_modules は含まれない。
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { createZip } from './lib/zipwriter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templates = path.join(root, 'installer', 'templates');
const outRoot = path.join(root, 'dist-installer');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const stageName = `TaskManage-Setup-v${version}`;
const stage = path.join(outRoot, stageName);
// アプリ本体は 1 つの zip にまとめる。配布 zip の一番上の階層をフォルダ無しにして、
// エクスプローラーで「インストール」が先頭に並ぶようにするため。
const payloadDir = path.join(outRoot, '.payload');
const appDir = payloadDir;
const PAYLOAD_NAME = '3_program.zip';
const INSTALLER_NAME = '1_インストール.bat';
const READ_ME_NAME = '2_お読みください.txt';

function log(msg) {
  console.log(`▶ ${msg}`);
}

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${label}に失敗しました。`);
    process.exit(1);
  }
}

// ---- テキストの書き出し（Windows 側で文字化けしない符号化に揃える） ----

function toCrlf(text) {
  return text.replace(/\r?\n/g, '\r\n');
}

/** .bat: UTF-8 (BOM なし) + CRLF。BOM を付けると cmd が先頭行を解釈できない。 */
function writeBat(dest, text) {
  writeFileSync(dest, Buffer.from(toCrlf(text), 'utf8'));
}

/** .ps1 / .txt: UTF-8 + BOM。BOM がないと PowerShell 5.1 が日本語を取り違える。 */
function writeUtf8Bom(dest, text) {
  writeFileSync(dest, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(toCrlf(text), 'utf8')]));
}

/** .vbs: UTF-16LE + BOM。Windows Script Host が日本語を正しく読める形式。 */
function writeVbs(dest, text) {
  writeFileSync(dest, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(toCrlf(text), 'utf16le')]));
}

// ---- アイコン生成（外部ライブラリを使わず ICO を組み立てる） ----

const BG = [79, 70, 229]; // #4f46e5
const FG = [255, 255, 255];

/** 線分 (ax,ay)-(bx,by) への距離。 */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** 角丸四角 + チェックマークを描いて RGBA 画素列を返す（3x3 スーパーサンプリング）。 */
function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = 0.22;
  const stroke = 0.1;
  const check = [
    [0.26, 0.52],
    [0.43, 0.69],
    [0.75, 0.32],
  ];

  const inRounded = (x, y) => {
    const m = 0.04;
    const lo = m;
    const hi = 1 - m;
    if (x < lo || x > hi || y < lo || y > hi) return false;
    const cx = Math.min(Math.max(x, lo + radius), hi - radius);
    const cy = Math.min(Math.max(y, lo + radius), hi - radius);
    return Math.hypot(x - cx, y - cy) <= radius;
  };

  const onCheck = (x, y) => {
    for (let i = 0; i < check.length - 1; i += 1) {
      const a = check[i];
      const b = check[i + 1];
      if (distToSegment(x, y, a[0], a[1], b[0], b[1]) <= stroke / 2) return true;
    }
    return false;
  };

  const S = 3;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < S; sy += 1) {
        for (let sx = 0; sx < S; sx += 1) {
          const u = (x + (sx + 0.5) / S) / size;
          const v = (y + (sy + 0.5) / S) / size;
          if (!inRounded(u, v)) continue;
          bg += 1;
          if (onCheck(u, v)) fg += 1;
        }
      }
      const total = S * S;
      const alpha = Math.round((bg / total) * 255);
      const mix = bg === 0 ? 0 : fg / bg;
      const o = (y * size + x) * 4;
      px[o] = Math.round(BG[0] + (FG[0] - BG[0]) * mix);
      px[o + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * mix);
      px[o + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * mix);
      px[o + 3] = alpha;
    }
  }
  return px;
}

/** ICO に収める 32bpp DIB（BITMAPINFOHEADER + 下から上の BGRA + AND マスク）。 */
function toDib(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR と AND の 2 枚ぶん
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);

  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const src = size - 1 - y; // DIB は下から上
    for (let x = 0; x < size; x += 1) {
      const s = (src * size + x) * 4;
      const d = (y * size + x) * 4;
      xor[d] = rgba[s + 2];
      xor[d + 1] = rgba[s + 1];
      xor[d + 2] = rgba[s];
      xor[d + 3] = rgba[s + 3];
    }
  }

  const maskRow = Math.ceil(size / 32) * 4; // 1bpp・4 バイト境界
  const mask = Buffer.alloc(maskRow * size); // すべて 0（= 不透明扱い、実際の透過は alpha が担う）
  return Buffer.concat([header, xor, mask]);
}

function buildIco(sizes) {
  const images = sizes.map((s) => toDib(renderIcon(s), s));
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(sizes.length, 4);

  const entries = [];
  let offset = 6 + 16 * sizes.length;
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0);
    e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    entries.push(e);
  });

  return Buffer.concat([dir, ...entries, ...images]);
}

/** 確認用に PNG も書き出せるようにしておく（ブラウザで見た目を検証するため）。 */
function buildPng(size) {
  const rgba = renderIcon(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- 組み立て ----

log('アプリをビルドしています');
run('npm', ['run', 'build'], 'ビルド');

log('サーバーを 1 ファイルにまとめています');
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
const esbuild = path.join(root, 'node_modules', '.bin', 'esbuild');
if (!existsSync(esbuild)) {
  console.error('esbuild が見つかりません。先に npm install を実行してください。');
  process.exit(1);
}
run(
  esbuild,
  [
    path.join(root, 'server', 'dist', 'server', 'src', 'index.js'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--target=node22',
    '--define:import.meta.url=__import_meta_url',
    "--banner:js=const __import_meta_url = require('url').pathToFileURL(__filename).href;",
    `--outfile=${path.join(appDir, 'server.cjs')}`,
  ],
  'サーバーのバンドル',
);

log('画面ファイルをコピーしています');
cpSync(path.join(root, 'client', 'dist'), path.join(appDir, 'web'), { recursive: true });

log('起動用ファイルを書き出しています');
writeFileSync(path.join(appDir, 'launch.cjs'), readFileSync(path.join(templates, 'launch.cjs')));
writeVbs(path.join(appDir, 'TaskManage.vbs'), readFileSync(path.join(templates, 'TaskManage.vbs'), 'utf8'));
writeUtf8Bom(path.join(appDir, 'setup.ps1'), readFileSync(path.join(templates, 'setup.ps1'), 'utf8'));
writeBat(path.join(appDir, 'stop.bat'), readFileSync(path.join(templates, 'stop.bat'), 'utf8'));
writeBat(path.join(appDir, 'uninstall.bat'), readFileSync(path.join(templates, 'uninstall.bat'), 'utf8'));
writeFileSync(path.join(appDir, 'VERSION'), `${version}\n`);

log('アイコンを生成しています');
writeFileSync(path.join(appDir, 'app.ico'), buildIco([16, 32, 48, 64]));
if (process.env.ICON_PREVIEW) writeFileSync(process.env.ICON_PREVIEW, buildPng(128));

log('アプリ本体を 1 つの zip にまとめています');
mkdirSync(stage, { recursive: true });
const payloadZip = path.join(stage, PAYLOAD_NAME);
const inner = spawnSync('zip', ['-qr', payloadZip, '.'], { cwd: payloadDir, stdio: 'inherit' });
if (inner.status !== 0) {
  console.error('アプリ本体の zip 化に失敗しました（zip コマンドが必要です）。');
  process.exit(1);
}

log('手順ファイルを書き出しています');
writeBat(path.join(stage, INSTALLER_NAME), readFileSync(path.join(templates, 'install.bat'), 'utf8'));
writeUtf8Bom(path.join(stage, READ_ME_NAME), readFileSync(path.join(templates, 'README.txt'), 'utf8'));

log('配布用 zip を書き出しています');
/** stage 以下を再帰的に集める（フォルダが無いので実際は 1 階層）。 */
function collect(dir, prefix, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      out.push({ name: `${rel}/`, directory: true, data: Buffer.alloc(0) });
      collect(full, rel, out);
    } else {
      out.push({ name: rel, data: readFileSync(full) });
    }
  }
  return out;
}

const zipPath = path.join(outRoot, `${stageName}.zip`);
writeFileSync(zipPath, createZip(collect(stage, stageName)));
rmSync(payloadDir, { recursive: true, force: true });

console.log(`\n✔ 完成しました: ${path.relative(root, zipPath)}`);
