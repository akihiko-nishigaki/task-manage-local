// 共有フォルダ運用向けの自動バックアップ。
// ネットワーク上の SQLite は万一壊れることがあるので、世代を持って戻せるようにしておく。
// 複数の PC が同じフォルダへ書くため、「直近のバックアップが新しければ何もしない」で重複を避ける。
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Db } from './db.js';

export const BACKUP_DIR_NAME = 'backups';
const NAME_PATTERN = /^tasks-\d{8}-\d{6}\.db$/;

export interface BackupOptions {
  /** バックアップを置くフォルダ */
  dir: string;
  /** 残す世代数 */
  keep: number;
  /** 直近のバックアップがこれより新しければ作らない（ミリ秒） */
  minIntervalMs: number;
  /** テスト用 */
  now?: Date;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** tasks-YYYYMMDD-HHMMSS.db（ローカル時刻。人が見て分かるように） */
export function backupFileName(now: Date): string {
  return (
    `tasks-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.db`
  );
}

export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => NAME_PATTERN.test(name))
    .sort();
}

/**
 * 必要ならバックアップを作り、古い世代を消す。作ったファイルのパスを返す（作らなければ null）。
 * VACUUM INTO は書き込み中でも整合した状態のコピーを作れる。一時名で作ってから rename するので、
 * 途中で止まっても壊れたバックアップが世代に混ざらない。
 */
export function backupIfDue(db: Db, options: BackupOptions): string | null {
  const now = options.now ?? new Date();
  mkdirSync(options.dir, { recursive: true });

  const existing = listBackups(options.dir);
  const newest = existing[existing.length - 1];
  if (newest) {
    const age = now.getTime() - statSync(path.join(options.dir, newest)).mtimeMs;
    if (age >= 0 && age < options.minIntervalMs) return null;
  }

  const finalPath = path.join(options.dir, backupFileName(now));
  if (existsSync(finalPath)) return null; // 同じ秒に別の PC が作成済み
  const tmpPath = `${finalPath}.tmp`;
  rmSync(tmpPath, { force: true });
  try {
    db.prepare('VACUUM INTO ?').run(tmpPath);
    renameSync(tmpPath, finalPath);
  } catch (error) {
    rmSync(tmpPath, { force: true });
    throw error;
  }

  const all = listBackups(options.dir);
  for (const name of all.slice(0, Math.max(0, all.length - options.keep))) {
    rmSync(path.join(options.dir, name), { force: true });
  }
  return finalPath;
}
