import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, seed } from './helpers.js';

async function expect400(promise: Promise<{ status: number; data: any }>, label: string): Promise<void> {
  const res = await promise;
  assert.equal(res.status, 400, `${label}: status`);
  assert.equal(res.data.error.code, 'validation', `${label}: code`);
  assert.equal(typeof res.data.error.message, 'string', `${label}: message`);
}

test('入力検証エラーは 400 validation を返す', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  await expect400(ctx.post('/api/members', { name: '   ' }), '空のメンバー名');
  await expect400(ctx.post('/api/members', {}), 'メンバー名なし');
  await expect400(ctx.post('/api/projects', { name: 'P', color: 'red' }), '不正な色');
  await expect400(ctx.post('/api/projects', { name: 'P', color: '#ABC' }), '短い色');
  await expect400(ctx.post('/api/tags', { name: '' }), '空のタグ名');
  await expect400(ctx.post('/api/tasks', { projectId, title: '' }), '空のタイトル');
  await expect400(ctx.post('/api/tasks', { title: 'タイトル' }), 'projectId なし');
  await expect400(ctx.post('/api/tasks', { projectId, title: 'T', status: 'unknown' }), '不正なステータス');
  await expect400(ctx.post('/api/tasks', { projectId, title: 'T', priority: 'xx' }), '不正な優先度');
  await expect400(ctx.post('/api/tasks', { projectId, title: 'T', dueDate: '2026/01/01' }), '不正な日付形式');
  await expect400(ctx.post('/api/tasks', { projectId, title: 'T', dueDate: '2026-02-30' }), '存在しない日付');
  await expect400(ctx.post('/api/tasks', { projectId, title: 'T', tagIds: [0] }), '不正なタグ id');
  await expect400(ctx.get('/api/tasks?status=nope'), '不正なステータスクエリ');
  await expect400(ctx.get('/api/tasks?projectId=abc'), '不正な projectId クエリ');
  await expect400(ctx.get('/api/tasks?dueBefore=2026-13-01'), '不正な dueBefore');
  await expect400(ctx.post('/api/tasks/reorder', { items: {} }), 'items が配列でない');
  await expect400(ctx.post('/api/tasks/reorder', { items: [{ id: 1, status: 'todo' }] }), 'position なし');
  await expect400(ctx.patch('/api/tasks/abc', { title: 'T' }), '不正なパス id');
  await expect400(ctx.post('/api/tasks', '{ invalid json'), '壊れた JSON');
});

test('存在しない参照先は 404 not_found を返す', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  const noProject = await ctx.post('/api/tasks', { projectId: 9999, title: 'T' });
  assert.equal(noProject.status, 404);
  assert.equal(noProject.data.error.code, 'not_found');
  assert.equal((await ctx.post('/api/tasks', { projectId, title: 'T', assigneeId: 9999 })).status, 404);
  assert.equal((await ctx.post('/api/tasks', { projectId, title: 'T', tagIds: [9999] })).status, 404);
  assert.equal((await ctx.get('/api/tasks/9999')).status, 404);
  assert.equal((await ctx.patch('/api/projects/9999', { name: 'x' })).status, 404);
  assert.equal((await ctx.patch('/api/tags/9999', { name: 'x' })).status, 404);
});

test('エラーレスポンスにスタックトレースは含まれない', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const res = await ctx.get('/api/tasks?projectId=-1');
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys(res.data), ['error']);
  assert.deepEqual(Object.keys(res.data.error).sort(), ['code', 'message']);
  assert.ok(!JSON.stringify(res.data).includes('at '));
});
