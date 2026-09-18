import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDb } from '../src/db.js';
import {
  DB_FILE,
  MOVED_NOTE,
  defaultDataDir,
  migrateLegacyData,
  resolveDataDir,
} from '../src/dataDir.js';

const home = path.join('/home', 'user');

test('defaultDataDir は OS ごとのユーザーデータ領域を返す', () => {
  assert.equal(
    defaultDataDir({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, homedir: 'C:\\Users\\u' }),
    path.join('C:\\Users\\u\\AppData\\Local', 'task-manage-local', 'data'),
  );
  assert.equal(
    defaultDataDir({ platform: 'win32', env: {}, homedir: 'C:\\Users\\u' }),
    path.join('C:\\Users\\u', 'AppData', 'Local', 'task-manage-local', 'data'),
    'LOCALAPPDATA が無ければ homedir から組み立てる',
  );
  assert.equal(
    defaultDataDir({ platform: 'darwin', env: {}, homedir: home }),
    path.join(home, 'Library', 'Application Support', 'task-manage-local', 'data'),
  );
  assert.equal(
    defaultDataDir({ platform: 'linux', env: {}, homedir: home }),
    path.join(home, '.local', 'share', 'task-manage-local', 'data'),
  );
  assert.equal(
    defaultDataDir({ platform: 'linux', env: { XDG_DATA_HOME: '/data/xdg' }, homedir: home }),
    path.join('/data/xdg', 'task-manage-local', 'data'),
  );
});

test('resolveDataDir は DATA_DIR を cwd 基準で優先する', () => {
  const base = { platform: 'linux' as const, homedir: home, cwd: '/work' };
  assert.equal(resolveDataDir({ ...base, env: { DATA_DIR: './mydata' } }), path.resolve('/work', './mydata'));
  assert.equal(resolveDataDir({ ...base, env: { DATA_DIR: '/abs/dir' } }), path.resolve('/abs/dir'));
  assert.equal(
    resolveDataDir({ ...base, env: { DATA_DIR: '   ' } }),
    path.join(home, '.local', 'share', 'task-manage-local', 'data'),
    '空白だけの DATA_DIR は未指定扱い',
  );
});

function tmp(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tm-datadir-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('migrateLegacyData は旧 DB を新保存先へコピーし、旧ファイルは残す', (t) => {
  const root = tmp(t);
  const legacy = path.join(root, 'legacy');
  const target = path.join(root, 'new', 'deeper');
  mkdirSync(legacy, { recursive: true });

  // 旧保存先に実データを作る
  const db = createDb(path.join(legacy, DB_FILE));
  db.prepare("INSERT INTO members (name, active, created_at) VALUES ('西垣', 1, '2026-01-01T00:00:00Z')").run();
  db.close();
  // 停止直後に残ることがある WAL/SHM も模擬
  writeFileSync(path.join(legacy, `${DB_FILE}-wal`), '');

  const result = migrateLegacyData(legacy, target);
  assert.equal(result.migrated, true);
  assert.deepEqual(result.files, [DB_FILE, `${DB_FILE}-wal`]);
  assert.ok(existsSync(path.join(target, DB_FILE)));
  assert.ok(existsSync(path.join(target, `${DB_FILE}-wal`)));
  assert.ok(!existsSync(path.join(target, `${DB_FILE}.migrating`)), '一時ファイルは残らない');

  // コピー先が正常に開け、データが入っている
  const copied = createDb(path.join(target, DB_FILE));
  assert.equal(Number(copied.prepare('SELECT COUNT(*) AS n FROM members').get()?.['n']), 1);
  copied.close();

  // 旧ファイルは残り、案内が置かれる
  assert.ok(existsSync(path.join(legacy, DB_FILE)));
  const note = readFileSync(path.join(legacy, MOVED_NOTE), 'utf8');
  assert.match(note, /移動しました/);
  assert.ok(note.includes(target));

  // 2 回目は新保存先に DB があるので何もしない
  const again = migrateLegacyData(legacy, target);
  assert.equal(again.migrated, false);
  assert.deepEqual(again.files, []);
});

test('migrateLegacyData は旧 DB が無い・同じディレクトリ・新側に DB がある場合は何もしない', (t) => {
  const root = tmp(t);
  const legacy = path.join(root, 'legacy');
  const target = path.join(root, 'target');
  mkdirSync(legacy);
  mkdirSync(target);

  assert.equal(migrateLegacyData(legacy, target).migrated, false, '旧 DB なし');
  assert.ok(!existsSync(path.join(legacy, MOVED_NOTE)));

  writeFileSync(path.join(legacy, DB_FILE), 'old');
  assert.equal(migrateLegacyData(legacy, legacy).migrated, false, '同じディレクトリ');

  writeFileSync(path.join(target, DB_FILE), 'new');
  assert.equal(migrateLegacyData(legacy, target).migrated, false, '新側に DB あり');
  assert.equal(readFileSync(path.join(target, DB_FILE), 'utf8'), 'new', '既存の新 DB は上書きされない');
});
