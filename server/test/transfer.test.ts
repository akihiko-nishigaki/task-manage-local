import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, seed } from './helpers.js';

async function fixture(ctx: Awaited<ReturnType<typeof createContext>>) {
  const { projectId, memberId, tagId } = await seed(ctx);
  const task = await ctx.post('/api/tasks', {
    projectId,
    title: 'エクスポート対象',
    description: '説明文',
    assigneeId: memberId,
    dueDate: '2026-07-07',
    priority: 'high',
    tagIds: [tagId],
  });
  await ctx.post(`/api/tasks/${task.data.id}/comments`, { body: '進捗', authorId: memberId });
  return { projectId, memberId, tagId, taskId: task.data.id as number };
}

test('GET /api/export は全データを返す', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  await fixture(ctx);

  const res = await ctx.get('/api/export');
  assert.equal(res.status, 200);
  assert.equal(res.data.version, 1);
  assert.match(res.data.exportedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  assert.equal(res.data.members.length, 1);
  assert.equal(res.data.projects.length, 1);
  assert.equal(res.data.tags.length, 1);
  assert.equal(res.data.tasks.length, 1);
  assert.equal(res.data.comments.length, 1);
  assert.deepEqual(res.data.tasks[0].tagIds, [res.data.tags[0].id]);
});

test('mode=replace の取り込みは id を保ったまま往復する', async (t) => {
  const source = await createContext();
  t.after(() => source.close());
  await fixture(source);
  const exported = (await source.get('/api/export')).data;

  const target = await createContext();
  t.after(() => target.close());
  // 取り込み前に別データを入れておく（置換で消えること）
  const stale = await target.post('/api/projects', { name: '消えるプロジェクト' });
  await target.post('/api/tasks', { projectId: stale.data.id, title: '消えるタスク' });

  const res = await target.post('/api/import', { mode: 'replace', data: exported });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.imported, { members: 1, projects: 1, tags: 1, tasks: 1, comments: 1 });

  const round = (await target.get('/api/export')).data;
  assert.deepEqual(round.members, exported.members);
  assert.deepEqual(round.projects, exported.projects);
  assert.deepEqual(round.tags, exported.tags);
  assert.deepEqual(round.tasks, exported.tasks);
  assert.deepEqual(round.comments, exported.comments);

  const projects = (await target.get('/api/projects')).data;
  assert.equal(projects.length, 1);
  assert.equal(projects[0].taskCount, 1);
});

test('mode=merge は新しい id を採番して FK を張り替える', async (t) => {
  const source = await createContext();
  t.after(() => source.close());
  await fixture(source);
  const exported = (await source.get('/api/export')).data;

  const target = await createContext();
  t.after(() => target.close());
  const existing = await target.post('/api/projects', { name: '既存プロジェクト' });
  await target.post('/api/tasks', { projectId: existing.data.id, title: '既存タスク' });

  const res = await target.post('/api/import', { mode: 'merge', data: exported });
  assert.equal(res.status, 200);

  const projects = (await target.get('/api/projects')).data;
  assert.equal(projects.length, 2);
  const tasks = (await target.get('/api/tasks')).data;
  assert.equal(tasks.length, 2);

  const imported = tasks.find((task: { title: string }) => task.title === 'エクスポート対象');
  assert.ok(imported);
  assert.notEqual(imported.projectId, exported.tasks[0].projectId);
  const importedProject = projects.find((project: { id: number }) => project.id === imported.projectId);
  assert.equal(importedProject.name, '社内ツール');
  const members = (await target.get('/api/members')).data;
  assert.equal(imported.assigneeId, members[0].id);
  const tags = (await target.get('/api/tags')).data;
  assert.deepEqual(imported.tagIds, [tags[0].id]);
  const detail = (await target.get(`/api/tasks/${imported.id}`)).data;
  assert.equal(detail.comments.length, 1);
  assert.equal(detail.comments[0].authorName, '西垣');
});

test('不正な import は 400 で、DB は変更されない', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  await fixture(ctx);
  const before = (await ctx.get('/api/export')).data;

  assert.equal((await ctx.post('/api/import', { mode: 'unknown', data: {} })).status, 400);
  assert.equal((await ctx.post('/api/import', { mode: 'replace' })).status, 400);
  assert.equal((await ctx.post('/api/import', { mode: 'replace', data: { members: 'no' } })).status, 400);

  const broken = await ctx.post('/api/import', {
    mode: 'replace',
    data: { version: 1, projects: [{ id: 1, name: 'ok' }], tasks: [{ id: 1, projectId: 42, title: 'x' }] },
  });
  assert.equal(broken.status, 400);

  const after = (await ctx.get('/api/export')).data;
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.projects, before.projects);
});
