// レビュー（レビュー期限・レビュー実施のチェック）。スキーマ v5。
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeOwnerIdOf,
  isAwaitingReview,
  isSettled,
  ownerIsReviewer,
  reviewStateOf,
  watchDueOf,
} from '../../shared/types.js';
import type { Task } from '../../shared/types.js';
import { createContext, seed } from './helpers.js';

test('作成時の既定はレビュー期限なし・レビュー前', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  const task = await ctx.post('/api/tasks', { projectId, title: 'レビュー未設定' });
  assert.equal(task.status, 201);
  assert.equal(task.data.reviewDue, null);
  assert.equal(task.data.reviewed, false);
  assert.equal(task.data.reviewedAt, null);
});

test('作成時にレビュー期限とレビュー済みを指定できる', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);

  const task = await ctx.post('/api/tasks', {
    projectId,
    title: '設計書レビュー',
    status: 'review',
    reviewDue: '2026-02-10',
    reviewed: true,
  });
  assert.equal(task.data.reviewDue, '2026-02-10');
  assert.equal(task.data.reviewed, true);
  assert.match(task.data.reviewedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test('レビューのチェックを付けると日時が入り、外すと消える', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  const created = await ctx.post('/api/tasks', { projectId, title: 'レビュー対象', status: 'review' });
  const id = created.data.id;

  const on = await ctx.patch(`/api/tasks/${id}`, { reviewed: true });
  assert.equal(on.data.reviewed, true);
  const firstAt = on.data.reviewedAt;
  assert.match(firstAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);

  // すでに付いているときは最初の日時を残す
  const again = await ctx.patch(`/api/tasks/${id}`, { reviewed: true });
  assert.equal(again.data.reviewedAt, firstAt);

  const off = await ctx.patch(`/api/tasks/${id}`, { reviewed: false });
  assert.equal(off.data.reviewed, false);
  assert.equal(off.data.reviewedAt, null);
});

test('レビュー期限は更新・解除でき、不正な値は 400 になる', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  const created = await ctx.post('/api/tasks', { projectId, title: '期限あり' });
  const id = created.data.id;

  const set = await ctx.patch(`/api/tasks/${id}`, { reviewDue: '2026-03-01' });
  assert.equal(set.data.reviewDue, '2026-03-01');

  const cleared = await ctx.patch(`/api/tasks/${id}`, { reviewDue: null });
  assert.equal(cleared.data.reviewDue, null);

  const bad = await ctx.patch(`/api/tasks/${id}`, { reviewDue: '2026/03/01' });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error.code, 'validation');

  const badBool = await ctx.patch(`/api/tasks/${id}`, { reviewed: 'yes' });
  assert.equal(badBool.status, 400);
});

test('ステータスを変えてもレビューのチェックは保たれる（レビュー修正 → レビュー済）', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  const created = await ctx.post('/api/tasks', { projectId, title: '指摘対応', status: 'review' });
  const id = created.data.id;

  await ctx.patch(`/api/tasks/${id}`, { reviewed: true });
  const fixing = await ctx.get(`/api/tasks/${id}`);
  assert.equal(reviewStateOf(fixing.data as Task), 'fix');

  const done = await ctx.patch(`/api/tasks/${id}`, { status: 'done' });
  assert.equal(done.data.reviewed, true);
  assert.equal(reviewStateOf(done.data as Task), 'done');
});

test('エクスポートとインポートでレビューの内容が往復する', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  await ctx.post('/api/tasks', {
    projectId,
    title: 'レビュー付き',
    status: 'review',
    reviewDue: '2026-04-20',
    reviewed: true,
  });

  const exported = await ctx.get('/api/export');
  const task = exported.data.tasks.find((x: Task) => x.title === 'レビュー付き');
  assert.equal(task.reviewDue, '2026-04-20');
  assert.equal(task.reviewed, true);

  const imported = await ctx.post('/api/import', { mode: 'replace', data: exported.data });
  assert.equal(imported.status, 200);
  const after = await ctx.get('/api/tasks');
  const restored = after.data.find((x: Task) => x.title === 'レビュー付き');
  assert.equal(restored.reviewDue, '2026-04-20');
  assert.equal(restored.reviewed, true);
  assert.match(restored.reviewedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test('レビューの項目が無い古いエクスポートも取り込める', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId } = await seed(ctx);
  const exported = await ctx.get('/api/export');
  const legacy = {
    ...exported.data,
    tasks: [
      {
        id: 9001,
        projectId,
        title: '古い形式のタスク',
        status: 'review',
        priority: 'medium',
        position: 1,
      },
    ],
  };

  const imported = await ctx.post('/api/import', { mode: 'replace', data: legacy });
  assert.equal(imported.status, 200);
  const after = await ctx.get('/api/tasks');
  const task = after.data.find((x: Task) => x.title === '古い形式のタスク');
  assert.equal(task.reviewDue, null);
  assert.equal(task.reviewed, false);
});

test('期限とレビュー期限は同じ扱いで、早いほう・未了のほうを見る', () => {
  const base = { status: 'review' as const, dueDate: null, reviewed: false, reviewDue: null };

  // 期限だけ / レビュー期限だけ
  assert.equal(watchDueOf({ ...base, dueDate: '2026-05-01' }), '2026-05-01');
  assert.equal(watchDueOf({ ...base, reviewDue: '2026-05-02' }), '2026-05-02');
  // 両方あれば早いほう
  assert.equal(watchDueOf({ ...base, dueDate: '2026-05-05', reviewDue: '2026-05-02' }), '2026-05-02');
  assert.equal(watchDueOf({ ...base, dueDate: '2026-05-01', reviewDue: '2026-05-09' }), '2026-05-01');
  // レビュー済みならレビュー期限は数えない
  assert.equal(watchDueOf({ ...base, dueDate: '2026-05-05', reviewDue: '2026-05-02', reviewed: true }), '2026-05-05');
  // 完了ならタスクの期限は数えないが、レビューが残っていればレビュー期限で見る
  assert.equal(
    watchDueOf({ status: 'done', dueDate: '2026-05-05', reviewed: false, reviewDue: '2026-05-02' }),
    '2026-05-02',
  );
  assert.equal(
    watchDueOf({ status: 'done', dueDate: '2026-05-05', reviewed: true, reviewDue: '2026-05-02' }),
    null,
  );
});

test('完了していてもレビューが済んでいなければ片付いていない扱い', () => {
  assert.equal(isSettled({ status: 'done', reviewed: false, reviewDue: null }), true);
  assert.equal(isSettled({ status: 'done', reviewed: false, reviewDue: '2026-05-02' }), false);
  assert.equal(isSettled({ status: 'done', reviewed: true, reviewDue: '2026-05-02' }), true);
  assert.equal(isSettled({ status: 'review', reviewed: true, reviewDue: '2026-05-02' }), false);
});

test('レビュー者を設定・変更・解除でき、存在しないメンバーは 404 になる', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId, memberId } = await seed(ctx);
  const reviewer = await ctx.post('/api/members', { name: 'レビュー担当' });

  const created = await ctx.post('/api/tasks', {
    projectId,
    title: 'レビュー者つき',
    assigneeId: memberId,
    reviewerId: reviewer.data.id,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.assigneeId, memberId);
  assert.equal(created.data.reviewerId, reviewer.data.id);

  const cleared = await ctx.patch(`/api/tasks/${created.data.id}`, { reviewerId: null });
  assert.equal(cleared.data.reviewerId, null);

  const back = await ctx.patch(`/api/tasks/${created.data.id}`, { reviewerId: reviewer.data.id });
  assert.equal(back.data.reviewerId, reviewer.data.id);

  const missing = await ctx.patch(`/api/tasks/${created.data.id}`, { reviewerId: 9999 });
  assert.equal(missing.status, 404);
});

test('メンバーを削除するとレビュー者の指定だけが外れる', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId, memberId } = await seed(ctx);
  const reviewer = await ctx.post('/api/members', { name: '辞めるレビュー担当' });
  const created = await ctx.post('/api/tasks', {
    projectId,
    title: 'レビュー者が消える',
    assigneeId: memberId,
    reviewerId: reviewer.data.id,
  });

  await ctx.del(`/api/members/${reviewer.data.id}`);
  const after = await ctx.get(`/api/tasks/${created.data.id}`);
  assert.equal(after.data.reviewerId, null);
  assert.equal(after.data.assigneeId, memberId);
});

test('レビュー者もエクスポート・インポートで往復する', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.close());
  const { projectId, memberId } = await seed(ctx);
  const reviewer = await ctx.post('/api/members', { name: '往復レビュー担当' });
  await ctx.post('/api/tasks', {
    projectId,
    title: 'レビュー者つきの往復',
    status: 'review',
    assigneeId: memberId,
    reviewerId: reviewer.data.id,
  });

  const exported = await ctx.get('/api/export');
  await ctx.post('/api/import', { mode: 'replace', data: exported.data });
  const after = await ctx.get('/api/tasks');
  const task = after.data.find((x: Task) => x.title === 'レビュー者つきの往復');
  assert.equal(task.reviewerId, reviewer.data.id);
  assert.equal(task.assigneeId, memberId);
});

test('実質の担当は、レビュー待ちならレビュー者・それ以外は作業者', () => {
  const base = { assigneeId: 1, reviewerId: 2, reviewed: false };

  // レビュー待ち（ステータスがレビュー・レビュー前）だけレビュー者
  assert.equal(activeOwnerIdOf({ ...base, status: 'review' }), 2);
  assert.equal(ownerIsReviewer({ ...base, status: 'review' }), true);
  assert.equal(isAwaitingReview({ status: 'review', reviewed: false }), true);

  // 未着手・進行中はまだ作業中なので作業者
  assert.equal(activeOwnerIdOf({ ...base, status: 'todo' }), 1);
  assert.equal(activeOwnerIdOf({ ...base, status: 'in_progress' }), 1);
  assert.equal(activeOwnerIdOf({ ...base, status: 'backlog' }), 1);
  assert.equal(ownerIsReviewer({ ...base, status: 'in_progress' }), false);

  // レビュー修正（チェック済みで未完了）は直しの番なので作業者に戻る
  assert.equal(activeOwnerIdOf({ ...base, status: 'review', reviewed: true }), 1);
  assert.equal(isAwaitingReview({ status: 'review', reviewed: true }), false);

  // 完了も作業者
  assert.equal(activeOwnerIdOf({ ...base, status: 'done', reviewed: true }), 1);

  // レビュー者が未設定ならレビュー待ちでも作業者のまま
  assert.equal(activeOwnerIdOf({ assigneeId: 1, reviewerId: null, reviewed: false, status: 'review' }), 1);
  assert.equal(ownerIsReviewer({ reviewerId: null, reviewed: false, status: 'review' }), false);

  // 作業者が未割当でも、レビュー待ちならレビュー者が持つ
  assert.equal(activeOwnerIdOf({ assigneeId: null, reviewerId: 2, reviewed: false, status: 'review' }), 2);
});

test('レビューの段階はチェックと状態の組み合わせで決まる', () => {
  assert.equal(reviewStateOf({ reviewed: false, status: 'review' }), 'before');
  assert.equal(reviewStateOf({ reviewed: false, status: 'done' }), 'before');
  assert.equal(reviewStateOf({ reviewed: true, status: 'review' }), 'fix');
  assert.equal(reviewStateOf({ reviewed: true, status: 'in_progress' }), 'fix');
  assert.equal(reviewStateOf({ reviewed: true, status: 'done' }), 'done');
});
