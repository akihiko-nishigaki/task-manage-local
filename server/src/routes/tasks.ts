// /api/tasks
import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import type { ArchiveResult, Task, TaskDetail, TaskStatus } from '../../../shared/types.js';
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
import { nowIso, toComment, toTask } from '../rows.js';
import type { Row } from '../rows.js';
import {
  asObject,
  has,
  parseIdParam,
  queryBoolean,
  queryId,
  queryString,
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
} from '../validate.js';

// ステータスはカンバンの列順（todo → in_progress → review → done）で並べる
const STATUS_ORDER = `CASE status
  WHEN 'todo' THEN 0
  WHEN 'in_progress' THEN 1
  WHEN 'review' THEN 2
  ELSE 3 END`;

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
    const projectId = requireId(body['projectId'], 'projectId');
    ensureProject(db, projectId);
    const title = requireName(body['title'], 'title');
    const description = has(body, 'description') ? requireText(body['description'], 'description') : '';
    const status = has(body, 'status') ? requireStatus(body['status']) : 'todo';
    const priority = has(body, 'priority') ? requirePriority(body['priority']) : 'medium';
    const assigneeId = has(body, 'assigneeId') ? requireNullableId(body['assigneeId'], 'assigneeId') : null;
    ensureMember(db, assigneeId);
    const dueDate = has(body, 'dueDate') ? requireNullableDate(body['dueDate']) : null;
    const tagIds = has(body, 'tagIds') ? requireIdArray(body['tagIds'], 'tagIds') : [];
    ensureTags(db, tagIds);

    const now = nowIso();
    const id = tx(db, () => {
      const info = db
        .prepare(
          `INSERT INTO tasks
             (project_id, title, description, status, priority, assignee_id, due_date, position,
              created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          projectId,
          title,
          description,
          status,
          priority,
          assigneeId,
          dueDate,
          nextPosition(db, projectId, status),
          now,
          now,
          status === 'done' ? now : null,
        );
      const newId = Number(info.lastInsertRowid);
      if (tagIds.length > 0) setTaskTags(db, newId, tagIds);
      return newId;
    });
    res.status(201).json(requireTask(db, id));
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
    if (has(body, 'dueDate')) push('due_date = ?', requireNullableDate(body['dueDate']));
    if (has(body, 'priority')) push('priority = ?', requirePriority(body['priority']));

    const status = has(body, 'status') ? requireStatus(body['status']) : current.status;
    const now = nowIso();
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
