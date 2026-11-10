// /api/tasks
import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import type {
  ArchiveResult,
  BulkCreateTasksResult,
  Task,
  TaskChannel,
  TaskDetail,
  TaskPriority,
  TaskStatus,
} from '../../../shared/types.js';
import type { Db } from '../db.js';
import { tx } from '../db.js';
import { notFoundError, validationError } from '../errors.js';
import {
  ensureMember,
  ensureProject,
  ensureTags,
  ensureTask,
  setTaskTags,
  tagIdsByTask,
  tagIdsForTask,
} from '../repo.js';
import { nowIso, sqlBool, toComment, toTask } from '../rows.js';
import type { Row } from '../rows.js';
import {
  asObject,
  has,
  parseIdParam,
  queryBoolean,
  queryId,
  queryString,
  requireBoolean,
  requireDate,
  requireId,
  requireIdArray,
  requireIsoDateTime,
  requireName,
  requireNullableDate,
  requireNullableId,
  requireNumber,
  requirePriority,
  requireStatus,
  requireText,
  requireNullableChannel,
  requireNullableLink,
} from '../validate.js';

// ステータスはカンバンの列順（backlog → todo → in_progress → review → done）で並べる
const STATUS_ORDER = `CASE status
  WHEN 'backlog' THEN 0
  WHEN 'todo' THEN 1
  WHEN 'in_progress' THEN 2
  WHEN 'review' THEN 3
  ELSE 4 END`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function nextPosition(db: Db, projectId: number, status: TaskStatus): number {
  const row = db
    .prepare('SELECT MAX(position) AS max_position FROM tasks WHERE project_id = ? AND status = ?')
    .get(projectId, status) as Row | undefined;
  const max = row?.['max_position'];
  return max === null || max === undefined ? 1 : Number(max) + 1;
}

function loadTask(db: Db, id: number): Task | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined;
  if (!row) return undefined;
  return toTask(row, tagIdsForTask(db, id));
}

function requireTask(db: Db, id: number): Task {
  const task = loadTask(db, id);
  if (!task) throw notFoundError(`タスク id=${id} が見つかりません`);
  return task;
}

/** done への遷移で completedAt を設定し、done から出たらクリアする。 */
function completedAtFor(previous: TaskStatus, next: TaskStatus, current: string | null, now: string): string | null {
  if (next === 'done') return previous === 'done' && current !== null ? current : now;
  return null;
}

/** 行が読み込めたタスク一覧を JSON 形へ変換する（タグはまとめて 1 クエリ）。 */
function toTasks(db: Db, rows: Row[]): Task[] {
  const tagMap = tagIdsByTask(db, rows.map((row) => Number(row['id'])));
  return rows.map((row) => toTask(row, tagMap.get(Number(row['id'])) ?? []));
}

const MAX_BULK_TASKS = 200;

/** タスク作成時のタイトル以外の項目。単体作成と一括作成で共通。 */
interface CreateFields {
  projectId: number;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: number | null;
  dueDate: string | null;
  tagIds: number[];
  channel: TaskChannel | null;
  link: string | null;
  reviewDue: string | null;
  reviewed: boolean;
  reviewerId: number | null;
}

function parseCreateFields(db: Db, body: Record<string, unknown>): CreateFields {
  const projectId = requireId(body['projectId'], 'projectId');
  ensureProject(db, projectId);
  const description = has(body, 'description') ? requireText(body['description'], 'description') : '';
  const status = has(body, 'status') ? requireStatus(body['status']) : 'todo';
  const priority = has(body, 'priority') ? requirePriority(body['priority']) : 'medium';
  const assigneeId = has(body, 'assigneeId') ? requireNullableId(body['assigneeId'], 'assigneeId') : null;
  ensureMember(db, assigneeId);
  const dueDate = has(body, 'dueDate') ? requireNullableDate(body['dueDate']) : null;
  const tagIds = has(body, 'tagIds') ? requireIdArray(body['tagIds'], 'tagIds') : [];
  ensureTags(db, tagIds);
  const channel = has(body, 'channel') ? requireNullableChannel(body['channel']) : null;
  const link = has(body, 'link') ? requireNullableLink(body['link']) : null;
  const reviewDue = has(body, 'reviewDue') ? requireNullableDate(body['reviewDue'], 'reviewDue') : null;
  const reviewed = has(body, 'reviewed') ? requireBoolean(body['reviewed'], 'reviewed') : false;
  const reviewerId = has(body, 'reviewerId') ? requireNullableId(body['reviewerId'], 'reviewerId') : null;
  ensureMember(db, reviewerId);
  return {
    projectId,
    description,
    status,
    priority,
    assigneeId,
    dueDate,
    tagIds,
    channel,
    link,
    reviewDue,
    reviewed,
    reviewerId,
  };
}

/** 1 件挿入して id を返す。トランザクション内で呼ぶこと。 */
function insertTask(db: Db, f: CreateFields, title: string, now: string): number {
  const info = db
    .prepare(
      `INSERT INTO tasks
         (project_id, title, description, status, priority, assignee_id, due_date, position,
          created_at, updated_at, completed_at, channel, link, review_due, reviewed, reviewed_at, reviewer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      f.projectId,
      title,
      f.description,
      f.status,
      f.priority,
      f.assigneeId,
      f.dueDate,
      nextPosition(db, f.projectId, f.status),
      now,
      now,
      f.status === 'done' ? now : null,
      f.channel,
      f.link,
      f.reviewDue,
      sqlBool(f.reviewed),
      f.reviewed ? now : null,
      f.reviewerId,
    );
  const newId = Number(info.lastInsertRowid);
  if (f.tagIds.length > 0) setTaskTags(db, newId, f.tagIds);
  return newId;
}

export function tasksRouter(db: Db): Router {
  const router = Router();

  router.get('/tasks', (req, res) => {
    const where: string[] = [];
    const params: SQLInputValue[] = [];

    const projectId = queryId(req.query['projectId'], 'projectId');
    if (projectId !== undefined) {
      where.push('project_id = ?');
      params.push(projectId);
    }
    const statusRaw = queryString(req.query['status']);
    if (statusRaw !== undefined && statusRaw !== '') {
      where.push('status = ?');
      params.push(requireStatus(statusRaw));
    }
    const assigneeId = queryId(req.query['assigneeId'], 'assigneeId');
    if (assigneeId !== undefined) {
      where.push('assignee_id = ?');
      params.push(assigneeId);
    }
    const tagId = queryId(req.query['tagId'], 'tagId');
    if (tagId !== undefined) {
      where.push('EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tasks.id AND tt.tag_id = ?)');
      params.push(tagId);
    }
    const priorityRaw = queryString(req.query['priority']);
    if (priorityRaw !== undefined && priorityRaw !== '') {
      where.push('priority = ?');
      params.push(requirePriority(priorityRaw));
    }
    const channelRaw = queryString(req.query['channel']);
    if (channelRaw !== undefined && channelRaw !== '') {
      where.push('channel = ?');
      params.push(requireNullableChannel(channelRaw));
    }
    const q = queryString(req.query['q']);
    if (q !== undefined && q.trim() !== '') {
      const pattern = `%${escapeLike(q.trim().toLowerCase())}%`;
      where.push(`(LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\')`);
      params.push(pattern, pattern);
    }
    const dueBefore = queryString(req.query['dueBefore']);
    if (dueBefore !== undefined && dueBefore !== '') {
      where.push('due_date IS NOT NULL AND due_date <= ?');
      params.push(requireDate(dueBefore, 'dueBefore'));
    }
    const dueAfter = queryString(req.query['dueAfter']);
    if (dueAfter !== undefined && dueAfter !== '') {
      where.push('due_date IS NOT NULL AND due_date >= ?');
      params.push(requireDate(dueAfter, 'dueAfter'));
    }
    if (!queryBoolean(req.query['includeDone'], true)) {
      where.push(`status <> 'done'`);
    }
    // アーカイブ済みは既定で除外。archivedOnly=1 でアーカイブ済みのみ、includeArchived=1 で両方
    if (queryBoolean(req.query['archivedOnly'], false)) {
      where.push('archived_at IS NOT NULL');
    } else if (!queryBoolean(req.query['includeArchived'], false)) {
      where.push('archived_at IS NULL');
    }

    const sql = `SELECT * FROM tasks
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${STATUS_ORDER}, position, id`;
    const rows = db.prepare(sql).all(...params) as Row[];
    res.json(toTasks(db, rows));
  });

  // 完了タスクの一括アーカイブ。削除はせず archived_at を付けて一覧から隠す。
  router.post('/tasks/archive', (req, res) => {
    const body = asObject(req.body);
    const now = nowIso();

    const result = tx(db, (): ArchiveResult => {
      let targets: Row[];
      if (has(body, 'ids')) {
        const ids = requireIdArray(body['ids'], 'ids');
        targets = [];
        for (const id of ids) {
          const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined;
          if (!row) throw notFoundError(`タスク id=${id} が見つかりません`);
          if (String(row['status']) !== 'done') {
            throw validationError(`タスク id=${id} は完了していないためアーカイブできません`);
          }
          if (row['archived_at'] === null || row['archived_at'] === undefined) targets.push(row);
        }
      } else {
        const where = [`status = 'done'`, 'archived_at IS NULL'];
        const params: SQLInputValue[] = [];
        if (has(body, 'projectId')) {
          const projectId = requireId(body['projectId'], 'projectId');
          ensureProject(db, projectId);
          where.push('project_id = ?');
          params.push(projectId);
        }
        if (has(body, 'completedBefore')) {
          where.push('completed_at IS NOT NULL AND completed_at <= ?');
          params.push(requireIsoDateTime(body['completedBefore'], 'completedBefore'));
        }
        targets = db
          .prepare(`SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY id`)
          .all(...params) as Row[];
      }

      const update = db.prepare('UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id = ?');
      for (const row of targets) update.run(now, now, Number(row['id']));
      const ids = targets.map((row) => Number(row['id']));
      const tasks = ids.map((id) => requireTask(db, id));
      return { count: tasks.length, tasks };
    });
    res.json(result);
  });

  // アーカイブ解除。ステータスは変えない（完了のまま一覧へ戻る）。
  router.post('/tasks/unarchive', (req, res) => {
    const body = asObject(req.body);
    const ids = requireIdArray(body['ids'], 'ids');
    const now = nowIso();
    const result = tx(db, (): ArchiveResult => {
      const update = db.prepare('UPDATE tasks SET archived_at = NULL, updated_at = ? WHERE id = ?');
      for (const id of ids) {
        ensureTask(db, id);
        update.run(now, id);
      }
      const tasks = ids.map((id) => requireTask(db, id));
      return { count: tasks.length, tasks };
    });
    res.json(result);
  });

  router.post('/tasks/reorder', (req, res) => {
    const body = asObject(req.body);
    const rawItems = body['items'];
    if (!Array.isArray(rawItems)) throw validationError('items は配列である必要があります');
    const items = rawItems.map((raw) => {
      const item = asObject(raw, 'items の要素');
      return {
        id: requireId(item['id'], 'items[].id'),
        status: requireStatus(item['status'], 'items[].status'),
        position: requireNumber(item['position'], 'items[].position'),
      };
    });

    const now = nowIso();
    const updated = tx(db, () => {
      const out: Task[] = [];
      for (const item of items) {
        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(item.id) as Row | undefined;
        if (!row) throw notFoundError(`タスク id=${item.id} が見つかりません`);
        const previous = String(row['status']) as TaskStatus;
        const completedAt = completedAtFor(
          previous,
          item.status,
          row['completed_at'] === null || row['completed_at'] === undefined ? null : String(row['completed_at']),
          now,
        );
        // アーカイブ済みのタスクが完了以外へ戻されたらアーカイブも解除する
        const archivedAt = item.status === 'done' ? row['archived_at'] ?? null : null;
        db.prepare(
          'UPDATE tasks SET status = ?, position = ?, completed_at = ?, archived_at = ?, updated_at = ? WHERE id = ?',
        ).run(item.status, item.position, completedAt, archivedAt, now, item.id);
        out.push(requireTask(db, item.id));
      }
      return out;
    });
    res.json(updated);
  });

  router.post('/tasks', (req, res) => {
    const body = asObject(req.body);
    const fields = parseCreateFields(db, body);
    const title = requireName(body['title'], 'title');
    const id = tx(db, () => insertTask(db, fields, title, nowIso()));
    res.status(201).json(requireTask(db, id));
  });

  // タイトルだけ複数指定して、ほかの項目は共通の値でまとめて作成する。1 件でも不正なら全件作成しない。
  router.post('/tasks/bulk', (req, res) => {
    const body = asObject(req.body);
    const fields = parseCreateFields(db, body);
    const rawTitles = body['titles'];
    if (!Array.isArray(rawTitles) || rawTitles.length === 0) {
      throw validationError('titles は 1 件以上の配列である必要があります');
    }
    if (rawTitles.length > MAX_BULK_TASKS) {
      throw validationError(`一度に作成できるタスクは ${MAX_BULK_TASKS} 件までです`);
    }
    const titles = rawTitles.map((raw, i) => requireName(raw, `titles[${i}]`));

    const now = nowIso();
    const ids = tx(db, () => titles.map((title) => insertTask(db, fields, title, now)));
    const tasks = ids.map((id) => requireTask(db, id));
    const result: BulkCreateTasksResult = { count: tasks.length, tasks };
    res.status(201).json(result);
  });

  router.get('/tasks/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'task id');
    const task = requireTask(db, id);
    const commentRows = db
      .prepare(
        `SELECT c.*, m.name AS author_name
         FROM comments c LEFT JOIN members m ON m.id = c.author_id
         WHERE c.task_id = ? ORDER BY c.id`,
      )
      .all(id) as Row[];
    const detail: TaskDetail = { ...task, comments: commentRows.map(toComment) };
    res.json(detail);
  });

  router.patch('/tasks/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'task id');
    const body = asObject(req.body);
    const current = requireTask(db, id);

    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    const push = (fragment: string, value: SQLInputValue): void => {
      sets.push(fragment);
      params.push(value);
    };

    const projectId = has(body, 'projectId') ? requireId(body['projectId'], 'projectId') : current.projectId;
    if (projectId !== current.projectId) {
      ensureProject(db, projectId);
      push('project_id = ?', projectId);
    }
    if (has(body, 'title')) push('title = ?', requireName(body['title'], 'title'));
    if (has(body, 'description')) push('description = ?', requireText(body['description'], 'description'));
    if (has(body, 'assigneeId')) {
      const assigneeId = requireNullableId(body['assigneeId'], 'assigneeId');
      ensureMember(db, assigneeId);
      push('assignee_id = ?', assigneeId);
    }
    if (has(body, 'reviewerId')) {
      const reviewerId = requireNullableId(body['reviewerId'], 'reviewerId');
      ensureMember(db, reviewerId);
      push('reviewer_id = ?', reviewerId);
    }
    if (has(body, 'dueDate')) push('due_date = ?', requireNullableDate(body['dueDate']));
    if (has(body, 'channel')) push('channel = ?', requireNullableChannel(body['channel']));
    if (has(body, 'link')) push('link = ?', requireNullableLink(body['link']));
    if (has(body, 'priority')) push('priority = ?', requirePriority(body['priority']));
    if (has(body, 'reviewDue')) push('review_due = ?', requireNullableDate(body['reviewDue'], 'reviewDue'));

    const status = has(body, 'status') ? requireStatus(body['status']) : current.status;
    const now = nowIso();
    // レビューのチェック。付けたときだけ日時を記録し、すでに付いていれば最初の日時を残す
    if (has(body, 'reviewed')) {
      const reviewed = requireBoolean(body['reviewed'], 'reviewed');
      push('reviewed = ?', sqlBool(reviewed));
      push('reviewed_at = ?', reviewed ? (current.reviewed ? current.reviewedAt : now) : null);
    }
    if (status !== current.status) {
      push('status = ?', status);
      push('completed_at = ?', completedAtFor(current.status, status, current.completedAt, now));
      // 完了以外へ戻したらアーカイブも解除する（一覧に再表示される）
      if (status !== 'done' && current.archivedAt !== null) push('archived_at = ?', null);
    }
    if (has(body, 'position')) {
      push('position = ?', requireNumber(body['position'], 'position'));
    } else if (status !== current.status || projectId !== current.projectId) {
      // 列やプロジェクトが変わったら移動先の末尾に置く
      push('position = ?', nextPosition(db, projectId, status));
    }

    const tagIds = has(body, 'tagIds') ? requireIdArray(body['tagIds'], 'tagIds') : undefined;
    if (tagIds) ensureTags(db, tagIds);

    tx(db, () => {
      if (sets.length > 0) {
        push('updated_at = ?', now);
        db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
      } else if (tagIds) {
        db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(now, id);
      }
      if (tagIds) setTaskTags(db, id, tagIds);
    });
    res.json(requireTask(db, id));
  });

  router.delete('/tasks/:id', (req, res) => {
    const id = parseIdParam(req.params.id, 'task id');
    // task_tags / comments は ON DELETE CASCADE で削除される
    const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    if (Number(info.changes) === 0) throw notFoundError(`タスク id=${id} が見つかりません`);
    res.status(204).end();
  });

  return router;
}
