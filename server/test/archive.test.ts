import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, seed } from './helpers.js';

async function fixture(ctx: Awaited<ReturnType<typeof createContext>>) {
  const { projectId } = await seed(ctx);
  const other = await ctx.post('/api/projects', { name: '別プロジェクト' });
  const open = await ctx.post('/api/tasks', { projectId, title: '未着手' });
  const doneA = await ctx.post('/api/tasks', { projectId, title: '完了A', status: 'done' });
  const doneB = await ctx.post('/api/tasks', { projectId, title: '完了B', status: 'done' });
  const doneOther = await ctx.post('/api/tasks', {
    projectId: other.data.id,
    title: '別案件の完了',
    status: 'done',
  });
  return {
    projectId,
    otherProjectId: other.data.id as number,
    openId: open.data.id as number,
    doneAId: doneA.data.id as number,
    doneBId: doneB.data.id as number,
    doneOtherId: doneOther.data.id as number,
  };
}

test('新規タスクは archivedAt が null', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  const task = await ctx.post('/api/tasks', { projectId, title: 'x' });
  assert.equal(task.data.archivedAt, null);
});

test('POST /api/tasks/archive（条件なし）は完了タスクをすべてアーカイブし一覧から消える', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const f = await fixture(ctx);

  const res = await ctx.post('/api/tasks/archive', {});
  assert.equal(res.status, 200);
  assert.equal(res.data.count, 3);
  assert.deepEqual(
    res.data.tasks.map((task: { id: number }) => task.id).sort(),
    [f.doneAId, f.doneBId, f.doneOtherId].sort(),
  );
  for (const task of res.data.tasks) {
    assert.match(task.archivedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.equal(task.status, 'done', 'ステータスは完了のまま');
  }

  // 既定の一覧からは消える（未完了だけ残る）
  const list = await ctx.get('/api/tasks');
  assert.deepEqual(
    list.data.map((task: { id: number }) => task.id),
    [f.openId],
  );

  // archivedOnly / includeArchived で取り出せる
  assert.equal((await ctx.get('/api/tasks?archivedOnly=1')).data.length, 3);
  assert.equal((await ctx.get('/api/tasks?includeArchived=1')).data.length, 4);
  assert.equal((await ctx.get(`/api/tasks?archivedOnly=1&projectId=${f.projectId}`)).data.length, 2);

  // 詳細は引き続き取得できる（削除ではない）
  assert.equal((await ctx.get(`/api/tasks/${f.doneAId}`)).status, 200);

  // 2 回目は対象なし
  assert.equal((await ctx.post('/api/tasks/archive', {})).data.count, 0);
});

test('projectId / completedBefore で対象を絞れる', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const f = await fixture(ctx);

  const byProject = await ctx.post('/api/tasks/archive', { projectId: f.projectId });
  assert.equal(byProject.data.count, 2);
  assert.equal((await ctx.get('/api/tasks?archivedOnly=1')).data.length, 2);

  // 別プロジェクトの完了は残っている。未来日時を境界にすれば対象になる
  const none = await ctx.post('/api/tasks/archive', { completedBefore: '2000-01-01T00:00:00Z' });
  assert.equal(none.data.count, 0);
  const future = await ctx.post('/api/tasks/archive', { completedBefore: '2999-01-01T00:00:00Z' });
  assert.equal(future.data.count, 1);
  assert.equal(future.data.tasks[0].id, f.doneOtherId);

  assert.equal((await ctx.post('/api/tasks/archive', { completedBefore: 'いつか' })).status, 400);
  assert.equal((await ctx.post('/api/tasks/archive', { projectId: 9999 })).status, 404);
});

test('ids 指定は完了タスクのみ受け付け、未完了が混ざれば 400 で何も変えない', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const f = await fixture(ctx);

  const ok = await ctx.post('/api/tasks/archive', { ids: [f.doneAId] });
  assert.equal(ok.data.count, 1);
  assert.equal(ok.data.tasks[0].id, f.doneAId);

  const bad = await ctx.post('/api/tasks/archive', { ids: [f.doneBId, f.openId] });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error.code, 'validation');
  assert.equal((await ctx.get(`/api/tasks/${f.doneBId}`)).data.archivedAt, null, 'ロールバックされる');

  assert.equal((await ctx.post('/api/tasks/archive', { ids: [9999] })).status, 404);
  assert.equal((await ctx.post('/api/tasks/archive', { ids: 'x' })).status, 400);

  // すでにアーカイブ済みの id は重複カウントしない
  const again = await ctx.post('/api/tasks/archive', { ids: [f.doneAId] });
  assert.equal(again.data.count, 0);
});

test('POST /api/tasks/unarchive で一覧へ戻る（完了のまま）', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const f = await fixture(ctx);
  await ctx.post('/api/tasks/archive', {});

  const res = await ctx.post('/api/tasks/unarchive', { ids: [f.doneAId, f.doneOtherId] });
  assert.equal(res.status, 200);
  assert.equal(res.data.count, 2);
  for (const task of res.data.tasks) {
    assert.equal(task.archivedAt, null);
    assert.equal(task.status, 'done');
    assert.ok(task.completedAt !== null);
  }
  assert.equal((await ctx.get('/api/tasks')).data.length, 3);
  assert.equal((await ctx.get('/api/tasks?archivedOnly=1')).data.length, 1);

  assert.equal((await ctx.post('/api/tasks/unarchive', { ids: [9999] })).status, 404);
  assert.equal((await ctx.post('/api/tasks/unarchive', {})).status, 400);
});

test('アーカイブ済みタスクを未完了へ戻すとアーカイブも解除される', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const f = await fixture(ctx);
  await ctx.post('/api/tasks/archive', {});

  // PATCH で status を戻す
  const reopened = await ctx.patch(`/api/tasks/${f.doneAId}`, { status: 'todo' });
  assert.equal(reopened.data.status, 'todo');
  assert.equal(reopened.data.archivedAt, null);
  assert.equal(reopened.data.completedAt, null);

  // 完了のままタイトルだけ変えてもアーカイブは維持
  const renamed = await ctx.patch(`/api/tasks/${f.doneBId}`, { title: '完了B（改）' });
  assert.ok(renamed.data.archivedAt !== null);

  // reorder で列を移してもアーカイブ解除
  await ctx.post('/api/tasks/reorder', { items: [{ id: f.doneBId, status: 'review', position: 1 }] });
  const moved = await ctx.get(`/api/tasks/${f.doneBId}`);
  assert.equal(moved.data.status, 'review');
  assert.equal(moved.data.archivedAt, null);

  // reorder で done のまま並び替えてもアーカイブ維持
  await ctx.post('/api/tasks/reorder', { items: [{ id: f.doneOtherId, status: 'done', position: 5 }] });
  assert.ok((await ctx.get(`/api/tasks/${f.doneOtherId}`)).data.archivedAt !== null);
});

test('エクスポート / インポートで archivedAt が往復する', async (t) => {
  const source = await createContext();
  t.after(() => source.close());
  const f = await fixture(source);
  await source.post('/api/tasks/archive', { ids: [f.doneAId] });
  const exported = (await source.get('/api/export')).data;
  const exportedA = exported.tasks.find((task: { id: number }) => task.id === f.doneAId);
  assert.ok(exportedA.archivedAt !== null);

  for (const mode of ['replace', 'merge'] as const) {
    const target = await createContext();
    t.after(() => target.close());
    const res = await target.post('/api/import', { mode, data: exported });
    assert.equal(res.status, 200, mode);
    const archived = (await target.get('/api/tasks?archivedOnly=1')).data;
    assert.equal(archived.length, 1, mode);
    assert.equal(archived[0].title, '完了A', mode);
    assert.equal(archived[0].archivedAt, exportedA.archivedAt, mode);
    assert.equal((await target.get('/api/tasks')).data.length, 3, mode);
  }

  // 未完了タスクに archivedAt が付いた不正データは無視される
  const tampered = structuredClone(exported);
  for (const task of tampered.tasks) {
    if (task.id === f.openId) task.archivedAt = '2026-01-01T00:00:00.000Z';
  }
  const target = await createContext();
  t.after(() => target.close());
  await target.post('/api/import', { mode: 'replace', data: tampered });
  assert.equal((await target.get(`/api/tasks/${f.openId}`)).data.archivedAt, null);
});

test('マイグレーション version 2 で archived_at 列が追加される', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const versions = ctx.db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => Number(row['version']));
  assert.deepEqual(versions, [1, 2]);
  const cols = ctx.db.prepare('PRAGMA table_info(tasks)').all().map((row) => String(row['name']));
  assert.ok(cols.includes('archived_at'));
});
