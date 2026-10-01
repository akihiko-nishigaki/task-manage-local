// 最小限の ZIP 書き出し。
// zip コマンドは UTF-8 フラグ（汎用目的ビット 11）を立てないため、
// 日本語のファイル名が Windows のエクスプローラーで文字化けする。
// ここでは必ずビット 11 を立てて書き出す。
import { deflateRawSync } from 'node:zlib';

let table = null;
function crc32(buf) {
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** JavaScript の Date を MS-DOS の日付・時刻に変換する。 */
function dosDateTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

const FLAG_UTF8 = 0x0800; // ビット 11: ファイル名が UTF-8

/**
 * @param {{ name: string, data: Buffer, directory?: boolean, date?: Date }[]} entries
 *   name はスラッシュ区切り。ディレクトリは末尾にスラッシュを付けて directory: true を指定する。
 * @returns {Buffer} zip 本体
 */
export function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const isDir = Boolean(entry.directory);
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const raw = isDir ? Buffer.alloc(0) : entry.data;
    const crc = crc32(raw);
    // ディレクトリと空ファイルは無圧縮、それ以外は deflate（膨らむ場合は無圧縮にする）
    let method = 0;
    let body = raw;
    if (!isDir && raw.length > 0) {
      const deflated = deflateRawSync(raw, { level: 9 });
      if (deflated.length < raw.length) {
        method = 8;
        body = deflated;
      }
    }
    const { time, day } = dosDateTime(entry.date ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 展開に必要なバージョン
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4); // 作成時のバージョン（UNIX）
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // ディスク番号
    central.writeUInt16LE(0, 36); // 内部属性
    // 外部属性: ディレクトリは 0755 + ディレクトリ属性、ファイルは 0644
    central.writeUInt32LE(isDir ? 0x41ed0010 : 0x81a40000, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}
