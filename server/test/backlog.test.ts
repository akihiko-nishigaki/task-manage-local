import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createDb } from '../src/db.js';
import { createContext, seed } from './helpers.js';

test('backlog ステータスで作成でき、一覧は backlog → todo → done の順に並ぶ', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  await ctx.post('/api/tasks', { projectId, title: '完了', status: 'done' });
  await ctx.post('/api/tasks', { projectId, title: '未着手', status: 'todo' });
  const backlog = await ctx.post('/api/tasks', { projectId, title: 'バックログ', status: 'backlog' });
  assert.equal(backlog.status, 201);
  assert.equal(backlog.data.status, 'backlog');
  assert.equal(backlog.data.completedAt, null);

  const list = await ctx.get('/api/tasks');
  assert.deepEqual(
    list.data.map((x: { status: string }) => x.status),
    ['backlog', 'todo', 'done'],
  );
});

test('backlog から他のステータスへ、また戻す更新ができる', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  const task = await ctx.post('/api/tasks', { projectId, title: 'x', status: 'backlog' });
  const moved = await ctx.patch(`/api/tasks/${task.data.id}`, { status: 'todo' });
  assert.equal(moved.data.status, 'todo');
  const back = await ctx.patch(`/api/tasks/${task.data.id}`, { status: 'backlog' });
  assert.equal(back.data.status, 'backlog');
});

test('既存 DB（v3）を開くと backlog が使えるようになり、タスク・コメント・タグは残る', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tm-migrate-'));
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows でファイルロックが残っても、一時ディレクトリなのでテスト結果には影響させない
    }
  });
  const file = path.join(dir, 'old.db');

  // 現行の最新 DB を作り、v4 の適用記録を消して「v3 までの DB」に見立てる
  const first = createDb(file);
  first.exec(`
    INSERT INTO projects (id, name, created_at, updated_at) VALUES (1, 'p', 'now', 'now');
    INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (1, 1, 'old', 'review', 'now', 'now');
    INSERT INTO tags (id, name) VALUES (1, 't');
    INSERT INTO task_tags (task_id, tag_id) VALUES (1, 1);
    INSERT INTO comments (task_id, body, created_at) VALUES (1, 'c', 'now');
  `);
  first.close();

  const raw = new DatabaseSync(file);
  raw.exec('DELETE FROM schema_migrations WHERE version = 4');
  // v3 時点の制約（backlog を含まない）に戻す
  raw.exec('PRAGMA foreign_keys = OFF;');
  raw.exec(`
    CREATE TABLE tasks_old AS SELECT * FROM tasks;
    DROP TABLE tasks;
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      due_date TEXT,
      position REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      archived_at TEXT,
      channel TEXT,
      link TEXT
    );
    INSERT INTO tasks SELECT * FROM tasks_old;
    DROP TABLE tasks_old;
  `);
  assert.throws(() => raw.exec(`UPDATE tasks SET status = 'backlog'`));
  raw.close();

  const db = createDb(file);
  t.after(() => db.close());
  db.exec(`UPDATE tasks SET status = 'backlog' WHERE id = 1`);
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = 1').get()?.['status'], 'backlog');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_tags').get()?.['n'], 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comments').get()?.['n'], 1);
  assert.equal(db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys'], 1);
});
