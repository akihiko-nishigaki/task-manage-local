import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { backupIfDue, listBackups } from '../src/backup.js';
import { createDb, LATEST_SCHEMA_VERSION } from '../src/db.js';
import { isSharedMode } from '../src/dataDir.js';

function tempDir(t: test.TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tm-shared-'));
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows でファイルロックが残っても、一時ディレクトリなのでテスト結果には影響させない
    }
  });
  return dir;
}

function pragma(db: DatabaseSync, name: string): unknown {
  return Object.values(db.prepare(`PRAGMA ${name}`).get() ?? {})[0];
}

test('共有モードは WAL を使わず、通常のジャーナルで確実に書く', (t) => {
  const dir = tempDir(t);
  const shared = createDb(path.join(dir, 'shared.db'), { shared: true });
  t.after(() => shared.close());
  assert.equal(String(pragma(shared, 'journal_mode')).toLowerCase(), 'delete');
  assert.equal(Number(pragma(shared, 'synchronous')), 2); // FULL
  assert.equal(Number(pragma(shared, 'busy_timeout')), 15000);

  const local = createDb(path.join(dir, 'local.db'));
  t.after(() => local.close());
  assert.equal(String(pragma(local, 'journal_mode')).toLowerCase(), 'wal');
});

test('WAL で作られた既存 DB も、共有モードで開けば通常のジャーナルに切り替わる', (t) => {
  const file = path.join(tempDir(t), 'tasks.db');
  createDb(file).close();
  const db = createDb(file, { shared: true });
  t.after(() => db.close());
  assert.equal(String(pragma(db, 'journal_mode')).toLowerCase(), 'delete');
});

test('2 つの接続（= 2 台の PC）が同じ DB に交互に書いても、お互いの変更が見える', (t) => {
  const file = path.join(tempDir(t), 'tasks.db');
  const a = createDb(file, { shared: true });
  const b = createDb(file, { shared: true });
  t.after(() => {
    a.close();
    b.close();
  });
  const now = new Date().toISOString();
  a.prepare('INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)').run('from-a', now, now);
  b.prepare('INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)').run('from-b', now, now);
  for (const db of [a, b]) {
    const names = db.prepare('SELECT name FROM projects ORDER BY id').all().map((r) => String(r['name']));
    assert.deepEqual(names, ['from-a', 'from-b']);
  }
});

test('新しいバージョンで更新された DB は、古いアプリでは開かない（壊さない）', (t) => {
  const file = path.join(tempDir(t), 'tasks.db');
  createDb(file, { shared: true }).close();
  const raw = new DatabaseSync(file);
  raw.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
    LATEST_SCHEMA_VERSION + 1,
    new Date().toISOString(),
  );
  raw.close();
  assert.throws(() => createDb(file, { shared: true }), /新しいバージョン/);
});

test('同じバージョンの DB を何度開いても移行は 1 回だけ', (t) => {
  const file = path.join(tempDir(t), 'tasks.db');
  createDb(file, { shared: true }).close();
  createDb(file, { shared: true }).close();
  const db = new DatabaseSync(file);
  t.after(() => db.close());
  const n = Number(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.['n']);
  assert.equal(n, LATEST_SCHEMA_VERSION);
});

test('バックアップ: 作成 → 直近なら作らない → 間隔が空けば作る → 古い世代を消す', (t) => {
  const dir = tempDir(t);
  const db = createDb(path.join(dir, 'tasks.db'), { shared: true });
  t.after(() => db.close());
  const now = new Date().toISOString();
  db.prepare('INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)').run('keep-me', now, now);
  const backups = path.join(dir, 'backups');
  const hour = 60 * 60 * 1000;
  const base = Date.now();

  const first = backupIfDue(db, { dir: backups, keep: 2, minIntervalMs: 12 * hour, now: new Date(base) });
  assert.ok(first && existsSync(first));
  assert.equal(listBackups(backups).length, 1);

  // 直近にあるので作らない
  assert.equal(backupIfDue(db, { dir: backups, keep: 2, minIntervalMs: 12 * hour, now: new Date(base + hour) }), null);
  assert.equal(listBackups(backups).length, 1);

  // バックアップは中身が読める（データが入っている）
  const restored = new DatabaseSync(first!);
  const names = restored.prepare('SELECT name FROM projects').all().map((r) => String(r['name']));
  restored.close();
  assert.deepEqual(names, ['keep-me']);

  // 間隔が空けば作り、keep=2 を超えた古い世代は消える
  backupIfDue(db, { dir: backups, keep: 2, minIntervalMs: 0, now: new Date(base + 2 * 1000) });
  backupIfDue(db, { dir: backups, keep: 2, minIntervalMs: 0, now: new Date(base + 4 * 1000) });
  backupIfDue(db, { dir: backups, keep: 2, minIntervalMs: 0, now: new Date(base + 6 * 1000) });
  const left = listBackups(backups);
  assert.equal(left.length, 2);
  // 一時ファイルが残らない
  assert.ok(readdirSync(backups).every((n) => !n.endsWith('.tmp')));
});

test('共有フォルダ運用の判定: UNC パスと DB_MODE=shared だけが共有、ローカルは通常', () => {
  assert.equal(isSharedMode({}, String.raw`\\fileserver\share\task`), true);
  assert.equal(isSharedMode({}, '//fileserver/share/task'), true);
  assert.equal(isSharedMode({}, String.raw`C:\Users\a\data`), false);
  assert.equal(isSharedMode({}, '/home/a/data'), false);
  assert.equal(isSharedMode({ DB_MODE: 'shared' }, String.raw`Z:\task`), true); // マップしたドライブは明示指定
  assert.equal(isSharedMode({ DB_MODE: 'local' }, String.raw`\\fileserver\share`), false);
});
