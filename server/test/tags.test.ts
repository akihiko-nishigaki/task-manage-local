import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext } from './helpers.js';

test('タグの作成・更新・削除', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const created = await ctx.post('/api/tags', { name: '重要' });
  assert.equal(created.status, 201);
  assert.equal(created.data.color, '#64748b');

  const patched = await ctx.patch(`/api/tags/${created.data.id}`, { name: '最重要', color: '#FF0000' });
  assert.equal(patched.data.name, '最重要');
  assert.equal(patched.data.color, '#ff0000');

  assert.equal((await ctx.del(`/api/tags/${created.data.id}`)).status, 204);
  assert.deepEqual((await ctx.get('/api/tags')).data, []);
});

test('同名タグの作成は 409', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  await ctx.post('/api/tags', { name: 'バグ' });
  const dup = await ctx.post('/api/tags', { name: 'バグ' });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error.code, 'conflict');

  const other = await ctx.post('/api/tags', { name: '改善' });
  const renameDup = await ctx.patch(`/api/tags/${other.data.id}`, { name: 'バグ' });
  assert.equal(renameDup.status, 409);
});

test('タグ削除でタスクとの関連も消える', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const project = await ctx.post('/api/projects', { name: 'P' });
  const tag = await ctx.post('/api/tags', { name: 'タグ' });
  const task = await ctx.post('/api/tasks', {
    projectId: project.data.id,
    title: 'タグ付き',
    tagIds: [tag.data.id],
  });
  assert.deepEqual(task.data.tagIds, [tag.data.id]);

  await ctx.del(`/api/tags/${tag.data.id}`);
  const after = await ctx.get(`/api/tasks/${task.data.id}`);
  assert.deepEqual(after.data.tagIds, []);
});
