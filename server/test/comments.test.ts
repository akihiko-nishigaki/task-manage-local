import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, seed } from './helpers.js';

test('コメントの作成・詳細への同梱・削除', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId, memberId } = await seed(ctx);
  const task = await ctx.post('/api/tasks', { projectId, title: 'コメント対象' });

  const created = await ctx.post(`/api/tasks/${task.data.id}/comments`, {
    body: '着手します',
    authorId: memberId,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.taskId, task.data.id);
  assert.equal(created.data.authorId, memberId);
  assert.equal(created.data.authorName, '西垣');

  const anonymous = await ctx.post(`/api/tasks/${task.data.id}/comments`, { body: '匿名メモ' });
  assert.equal(anonymous.data.authorId, null);
  assert.equal(anonymous.data.authorName, null);

  const detail = await ctx.get(`/api/tasks/${task.data.id}`);
  assert.equal(detail.data.comments.length, 2);
  assert.equal(detail.data.comments[0].body, '着手します');

  assert.equal((await ctx.del(`/api/comments/${created.data.id}`)).status, 204);
  assert.equal((await ctx.get(`/api/tasks/${task.data.id}`)).data.comments.length, 1);
  assert.equal((await ctx.del(`/api/comments/${created.data.id}`)).status, 404);
});

test('存在しないタスク・メンバーへのコメントは 404、空文字は 400', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  const task = await ctx.post('/api/tasks', { projectId, title: 'x' });

  assert.equal((await ctx.post('/api/tasks/9999/comments', { body: 'a' })).status, 404);
  assert.equal((await ctx.post(`/api/tasks/${task.data.id}/comments`, { body: 'a', authorId: 999 })).status, 404);
  const empty = await ctx.post(`/api/tasks/${task.data.id}/comments`, { body: '   ' });
  assert.equal(empty.status, 400);
  assert.equal(empty.data.error.code, 'validation');
});
