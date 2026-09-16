import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext } from './helpers.js';

test('メンバーの作成・一覧・更新・削除', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  assert.deepEqual((await ctx.get('/api/members')).data, []);

  const created = await ctx.post('/api/members', { name: '  田中  ' });
  assert.equal(created.status, 201);
  assert.equal(created.data.name, '田中');
  assert.equal(created.data.active, true);
  assert.match(created.data.createdAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);

  const list = await ctx.get('/api/members');
  assert.equal(list.data.length, 1);

  const patched = await ctx.patch(`/api/members/${created.data.id}`, { name: '田中太郎', active: false });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.name, '田中太郎');
  assert.equal(patched.data.active, false);

  const removed = await ctx.del(`/api/members/${created.data.id}`);
  assert.equal(removed.status, 204);
  assert.deepEqual((await ctx.get('/api/members')).data, []);
});

test('存在しないメンバーは 404', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  assert.equal((await ctx.patch('/api/members/999', { name: 'x' })).status, 404);
  const res = await ctx.del('/api/members/999');
  assert.equal(res.status, 404);
  assert.equal(res.data.error.code, 'not_found');
});

test('メンバー削除でタスクの担当とコメント著者が null になる', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const member = await ctx.post('/api/members', { name: '佐藤' });
  const project = await ctx.post('/api/projects', { name: 'P' });
  const task = await ctx.post('/api/tasks', {
    projectId: project.data.id,
    title: '担当付きタスク',
    assigneeId: member.data.id,
  });
  await ctx.post(`/api/tasks/${task.data.id}/comments`, { body: 'コメント', authorId: member.data.id });

  await ctx.del(`/api/members/${member.data.id}`);

  const detail = await ctx.get(`/api/tasks/${task.data.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.assigneeId, null);
  assert.equal(detail.data.comments.length, 1);
  assert.equal(detail.data.comments[0].authorId, null);
  assert.equal(detail.data.comments[0].authorName, null);
});
