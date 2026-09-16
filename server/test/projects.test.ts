import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext } from './helpers.js';

test('プロジェクトの作成・更新・アーカイブ表示切替', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const created = await ctx.post('/api/projects', { name: '新規案件', description: '説明', color: '#AABBCC' });
  assert.equal(created.status, 201);
  assert.equal(created.data.color, '#aabbcc');
  assert.equal(created.data.archived, false);
  assert.equal(created.data.taskCount, 0);
  assert.equal(created.data.openTaskCount, 0);

  const archived = await ctx.patch(`/api/projects/${created.data.id}`, { archived: true, name: '旧案件' });
  assert.equal(archived.data.archived, true);
  assert.equal(archived.data.name, '旧案件');
  assert.notEqual(archived.data.updatedAt, undefined);

  assert.deepEqual((await ctx.get('/api/projects')).data, []);
  const withArchived = await ctx.get('/api/projects?includeArchived=1');
  assert.equal(withArchived.data.length, 1);
});

test('プロジェクト一覧は taskCount / openTaskCount を含む', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const project = await ctx.post('/api/projects', { name: 'カウント' });
  await ctx.post('/api/tasks', { projectId: project.data.id, title: 'A' });
  const done = await ctx.post('/api/tasks', { projectId: project.data.id, title: 'B' });
  await ctx.patch(`/api/tasks/${done.data.id}`, { status: 'done' });

  const list = await ctx.get('/api/projects');
  assert.equal(list.data[0].taskCount, 2);
  assert.equal(list.data[0].openTaskCount, 1);
});

test('プロジェクト削除で配下のタスク・コメントも消える', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());

  const project = await ctx.post('/api/projects', { name: '削除対象' });
  const task = await ctx.post('/api/tasks', { projectId: project.data.id, title: 'T' });
  await ctx.post(`/api/tasks/${task.data.id}/comments`, { body: 'c' });

  assert.equal((await ctx.del(`/api/projects/${project.data.id}`)).status, 204);
  assert.equal((await ctx.get(`/api/tasks/${task.data.id}`)).status, 404);
  assert.deepEqual((await ctx.get('/api/tasks')).data, []);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM comments').get()?.['n'], 0);
  assert.equal((await ctx.del(`/api/projects/${project.data.id}`)).status, 404);
});
