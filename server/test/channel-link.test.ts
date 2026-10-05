import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, seed } from './helpers.js';

test('チャネルとリンクを作成・更新できる', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  const created = await ctx.post('/api/tasks', { projectId, title: '見積の確認' });
  assert.equal(created.status, 201);
  assert.equal(created.data.channel, null);
  assert.equal(created.data.link, null);

  const withChannel = await ctx.post('/api/tasks', {
    projectId,
    title: '発注メールの返信',
    channel: 'email',
    link: 'https://outlook.office.com/mail/id/AAA',
  });
  assert.equal(withChannel.status, 201);
  assert.equal(withChannel.data.channel, 'email');
  assert.equal(withChannel.data.link, 'https://outlook.office.com/mail/id/AAA');

  const patched = await ctx.patch(`/api/tasks/${created.data.id}`, {
    channel: 'teams',
    link: 'https://teams.microsoft.com/l/message/19:abc/1700000000000',
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.channel, 'teams');
  assert.equal(patched.data.link, 'https://teams.microsoft.com/l/message/19:abc/1700000000000');

  // 口頭はリンク無しで使う
  const verbal = await ctx.patch(`/api/tasks/${created.data.id}`, { channel: 'verbal', link: null });
  assert.equal(verbal.data.channel, 'verbal');
  assert.equal(verbal.data.link, null);

  // 空文字は未設定として扱う
  const cleared = await ctx.patch(`/api/tasks/${created.data.id}`, { channel: '', link: '' });
  assert.equal(cleared.data.channel, null);
  assert.equal(cleared.data.link, null);
});

test('mailto と msteams のリンクを受け付ける', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  const mail = await ctx.post('/api/tasks', {
    projectId,
    title: 'メール',
    channel: 'email',
    link: 'mailto:eigyo@example.co.jp?subject=%E8%A6%8B%E7%A9%8D',
  });
  assert.equal(mail.status, 201);
  assert.equal(mail.data.link, 'mailto:eigyo@example.co.jp?subject=%E8%A6%8B%E7%A9%8D');

  const teams = await ctx.post('/api/tasks', {
    projectId,
    title: 'Teams',
    channel: 'teams',
    link: 'msteams:/l/channel/19:abc/general',
  });
  assert.equal(teams.status, 201);
  assert.equal(teams.data.link, 'msteams:/l/channel/19:abc/general');
});

test('危険なリンクと未知のチャネルは 400 で弾く', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  for (const link of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///C:/Windows/System32',
    'ただのテキスト',
  ]) {
    const res = await ctx.post('/api/tasks', { projectId, title: 'リンク検証', link });
    assert.equal(res.status, 400, `${link} は拒否されるべき`);
    assert.equal(res.data.error.code, 'validation');
  }

  const tooLong = await ctx.post('/api/tasks', {
    projectId,
    title: '長すぎるリンク',
    link: `https://example.com/${'a'.repeat(2100)}`,
  });
  assert.equal(tooLong.status, 400);

  const badChannel = await ctx.post('/api/tasks', { projectId, title: 'チャネル', channel: 'slack' });
  assert.equal(badChannel.status, 400);
  assert.equal(badChannel.data.error.code, 'validation');
});

test('チャネルで絞り込める', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  await ctx.post('/api/tasks', { projectId, title: 'メールの件', channel: 'email' });
  await ctx.post('/api/tasks', { projectId, title: 'Teams の件', channel: 'teams' });
  await ctx.post('/api/tasks', { projectId, title: '口頭の件', channel: 'verbal' });
  await ctx.post('/api/tasks', { projectId, title: '未設定の件' });

  const emails = await ctx.get('/api/tasks?channel=email');
  assert.equal(emails.status, 200);
  assert.deepEqual(
    emails.data.map((t2: { title: string }) => t2.title),
    ['メールの件'],
  );

  const all = await ctx.get('/api/tasks');
  assert.equal(all.data.length, 4);

  const bad = await ctx.get('/api/tasks?channel=line');
  assert.equal(bad.status, 400);
});

test('エクスポートとインポートでチャネルとリンクが残る', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  await ctx.post('/api/tasks', {
    projectId,
    title: '引き継ぎ確認',
    channel: 'teams',
    link: 'https://teams.microsoft.com/l/message/19:xyz/1700000000001',
  });

  const exported = await ctx.get('/api/export');
  assert.equal(exported.status, 200);
  const task = exported.data.tasks.find((x: { title: string }) => x.title === '引き継ぎ確認');
  assert.equal(task.channel, 'teams');
  assert.equal(task.link, 'https://teams.microsoft.com/l/message/19:xyz/1700000000001');

  const imported = await ctx.post('/api/import', { mode: 'replace', data: exported.data });
  assert.equal(imported.status, 200);

  const after = await ctx.get('/api/tasks');
  const restored = after.data.find((x: { title: string }) => x.title === '引き継ぎ確認');
  assert.equal(restored.channel, 'teams');
  assert.equal(restored.link, 'https://teams.microsoft.com/l/message/19:xyz/1700000000001');
});

test('インポート時も危険なリンクは弾く', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  await ctx.post('/api/tasks', { projectId, title: 'もとのタスク' });

  const exported = await ctx.get('/api/export');
  exported.data.tasks[0].link = 'javascript:alert(1)';

  const res = await ctx.post('/api/import', { mode: 'replace', data: exported.data });
  assert.equal(res.status, 400);
  assert.equal(res.data.error.code, 'validation');
});
