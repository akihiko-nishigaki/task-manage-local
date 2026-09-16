import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, seed } from './helpers.js';

test('タスク作成は既定値と position を設定する', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId, memberId, tagId } = await seed(ctx);

  const first = await ctx.post('/api/tasks', { projectId, title: '最初のタスク' });
  assert.equal(first.status, 201);
  assert.equal(first.data.status, 'todo');
  assert.equal(first.data.priority, 'medium');
  assert.equal(first.data.description, '');
  assert.equal(first.data.assigneeId, null);
  assert.equal(first.data.dueDate, null);
  assert.equal(first.data.completedAt, null);
  assert.deepEqual(first.data.tagIds, []);
  assert.equal(first.data.position, 1);

  const second = await ctx.post('/api/tasks', {
    projectId,
    title: '2 番目',
    assigneeId: memberId,
    dueDate: '2026-01-31',
    priority: 'high',
    tagIds: [tagId],
  });
  assert.equal(second.data.position, 2);
  assert.equal(second.data.assigneeId, memberId);
  assert.equal(second.data.dueDate, '2026-01-31');
  assert.deepEqual(second.data.tagIds, [tagId]);

  // 別ステータスは独立した position 採番
  const review = await ctx.post('/api/tasks', { projectId, title: 'レビュー中', status: 'review' });
  assert.equal(review.data.position, 1);
});

test('done で作成すると completedAt が入る', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  const task = await ctx.post('/api/tasks', { projectId, title: '完了済み', status: 'done' });
  assert.equal(task.data.status, 'done');
  assert.match(task.data.completedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test('一覧はステータス順・position 順で並び、フィルタが効く', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId, memberId, tagId } = await seed(ctx);
  const other = await ctx.post('/api/projects', { name: '別プロジェクト' });

  const a = await ctx.post('/api/tasks', { projectId, title: 'API 実装', description: '認証まわり' });
  const b = await ctx.post('/api/tasks', {
    projectId,
    title: '設計レビュー',
    status: 'review',
    assigneeId: memberId,
    tagIds: [tagId],
    priority: 'urgent',
    dueDate: '2026-03-01',
  });
  const c = await ctx.post('/api/tasks', { projectId, title: '完了タスク', status: 'done' });
  await ctx.post('/api/tasks', { projectId: other.data.id, title: '別案件タスク' });

  const all = await ctx.get('/api/tasks');
  assert.deepEqual(
    all.data.map((task: { title: string }) => task.title),
    ['API 実装', '別案件タスク', '設計レビュー', '完了タスク'],
  );

  assert.equal((await ctx.get(`/api/tasks?projectId=${projectId}`)).data.length, 3);
  assert.equal((await ctx.get('/api/tasks?status=review')).data[0].id, b.data.id);
  assert.equal((await ctx.get(`/api/tasks?assigneeId=${memberId}`)).data.length, 1);
  assert.equal((await ctx.get(`/api/tasks?tagId=${tagId}`)).data[0].id, b.data.id);
  assert.equal((await ctx.get('/api/tasks?priority=urgent')).data.length, 1);
  assert.equal((await ctx.get('/api/tasks?q=api')).data[0].id, a.data.id, 'タイトルの大文字小文字を無視');
  assert.equal((await ctx.get('/api/tasks?q=認証')).data[0].id, a.data.id, '説明も検索対象');
  assert.equal((await ctx.get('/api/tasks?q=%25')).data.length, 0, 'LIKE のワイルドカードはエスケープされる');
  assert.equal((await ctx.get('/api/tasks?dueBefore=2026-03-01')).data.length, 1);
  assert.equal((await ctx.get('/api/tasks?dueAfter=2026-03-02')).data.length, 0);

  const includedDone = await ctx.get('/api/tasks');
  assert.ok(includedDone.data.some((task: { id: number }) => task.id === c.data.id), 'includeDone 既定は true');
  assert.equal((await ctx.get('/api/tasks?includeDone=0')).data.length, 3);
  assert.equal((await ctx.get('/api/tasks?includeDone=false')).data.length, 3);
  assert.equal((await ctx.get('/api/tasks?includeDone=1')).data.length, 4);
});

test('PATCH で部分更新でき、done 出入りで completedAt が切り替わる', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId, memberId, tagId } = await seed(ctx);

  const task = await ctx.post('/api/tasks', { projectId, title: '対象' });

  const renamed = await ctx.patch(`/api/tasks/${task.data.id}`, {
    title: '対象（改）',
    description: 'メモ',
    assigneeId: memberId,
    dueDate: '2026-05-05',
    priority: 'low',
    tagIds: [tagId],
  });
  assert.equal(renamed.data.title, '対象（改）');
  assert.equal(renamed.data.description, 'メモ');
  assert.equal(renamed.data.assigneeId, memberId);
  assert.equal(renamed.data.dueDate, '2026-05-05');
  assert.equal(renamed.data.priority, 'low');
  assert.deepEqual(renamed.data.tagIds, [tagId]);
  assert.equal(renamed.data.completedAt, null);

  const done = await ctx.patch(`/api/tasks/${task.data.id}`, { status: 'done' });
  assert.equal(done.data.status, 'done');
  assert.ok(done.data.completedAt !== null);

  const reopened = await ctx.patch(`/api/tasks/${task.data.id}`, { status: 'todo' });
  assert.equal(reopened.data.completedAt, null);

  const cleared = await ctx.patch(`/api/tasks/${task.data.id}`, { assigneeId: null, dueDate: null, tagIds: [] });
  assert.equal(cleared.data.assigneeId, null);
  assert.equal(cleared.data.dueDate, null);
  assert.deepEqual(cleared.data.tagIds, []);

  assert.equal((await ctx.patch('/api/tasks/9999', { title: 'x' })).status, 404);
});

test('POST /api/tasks/reorder はステータスと position をまとめて更新する', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  const a = await ctx.post('/api/tasks', { projectId, title: 'A' });
  const b = await ctx.post('/api/tasks', { projectId, title: 'B' });
  const c = await ctx.post('/api/tasks', { projectId, title: 'C' });

  const res = await ctx.post('/api/tasks/reorder', {
    items: [
      { id: c.data.id, status: 'todo', position: 1 },
      { id: a.data.id, status: 'todo', position: 2 },
      { id: b.data.id, status: 'done', position: 1 },
    ],
  });
  assert.equal(res.status, 200);

  const list = await ctx.get(`/api/tasks?projectId=${projectId}`);
  assert.deepEqual(
    list.data.map((task: { title: string }) => task.title),
    ['C', 'A', 'B'],
  );
  const doneTask = list.data.find((task: { title: string }) => task.title === 'B');
  assert.equal(doneTask.status, 'done');
  assert.ok(doneTask.completedAt !== null);

  // 1 件でも失敗したら全体がロールバックされる
  const failed = await ctx.post('/api/tasks/reorder', {
    items: [
      { id: a.data.id, status: 'review', position: 9 },
      { id: 9999, status: 'todo', position: 1 },
    ],
  });
  assert.equal(failed.status, 404);
  const afterFail = await ctx.get(`/api/tasks/${a.data.id}`);
  assert.equal(afterFail.data.status, 'todo');
  assert.equal(afterFail.data.position, 2);
});

test('タスク削除でタグ関連とコメントも消える', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId, tagId } = await seed(ctx);

  const task = await ctx.post('/api/tasks', { projectId, title: '削除対象', tagIds: [tagId] });
  await ctx.post(`/api/tasks/${task.data.id}/comments`, { body: 'メモ' });

  assert.equal((await ctx.del(`/api/tasks/${task.data.id}`)).status, 204);
  assert.equal((await ctx.get(`/api/tasks/${task.data.id}`)).status, 404);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM task_tags').get()?.['n'], 0);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM comments').get()?.['n'], 0);
  assert.equal((await ctx.del(`/api/tasks/${task.data.id}`)).status, 404);
});
