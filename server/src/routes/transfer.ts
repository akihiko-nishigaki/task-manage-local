// /api/export, /api/import（ローカルファイルへの手動バックアップ用。外部送信は行わない）
import { Router } from 'express';
import type { ExportData } from '../../../shared/types.js';
import type { Db } from '../db.js';
import { tx } from '../db.js';
import { validationError } from '../errors.js';
import { tagIdsByTask } from '../repo.js';
import { nowIso, sqlBool, toComment, toMember, toProject, toTag, toTask } from '../rows.js';
import type { Row } from '../rows.js';
import {
  asObject,
  has,
  isDateString,
  requireColor,
  requireId,
  requireName,
  requireNullableId,
  requireNumber,
  requirePriority,
  requireStatus,
  requireText,
} from '../validate.js';

const EXPORT_VERSION = 1;

function collectExport(db: Db): ExportData {
  const members = (db.prepare('SELECT * FROM members ORDER BY id').all() as Row[]).map(toMember);
  const projects = (db.prepare('SELECT * FROM projects ORDER BY id').all() as Row[]).map((row) =>
    toProject(row),
  );
  const tags = (db.prepare('SELECT * FROM tags ORDER BY id').all() as Row[]).map(toTag);
  const taskRows = db.prepare('SELECT * FROM tasks ORDER BY id').all() as Row[];
  const tagMap = tagIdsByTask(db, taskRows.map((row) => Number(row['id'])));
  const tasks = taskRows.map((row) => toTask(row, tagMap.get(Number(row['id'])) ?? []));
  const comments = (
    db
      .prepare(
        `SELECT c.*, m.name AS author_name
         FROM comments c LEFT JOIN members m ON m.id = c.author_id
         ORDER BY c.id`,
      )
      .all() as Row[]
  ).map(toComment);
  return { version: EXPORT_VERSION, exportedAt: nowIso(), members, projects, tags, tasks, comments };
}

function arrayField(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  if (!has(data, key)) return [];
  const value = data[key];
  if (!Array.isArray(value)) throw validationError(`data.${key} は配列である必要があります`);
  return value.map((item) => asObject(item, `data.${key} の要素`));
}

function optText(record: Record<string, unknown>, key: string, fallback = ''): string {
  return has(record, key) ? requireText(record[key], key) : fallback;
}

function optIso(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function optDue(record: Record<string, unknown>): string | null {
  const value = record['dueDate'];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !isDateString(value)) {
    throw validationError('dueDate は YYYY-MM-DD 形式の日付である必要があります');
  }
  return value;
}

interface ImportCounts {
  members: number;
  projects: number;
  tags: number;
  tasks: number;
  comments: number;
}

export function transferRouter(db: Db): Router {
  const router = Router();

  router.get('/export', (_req, res) => {
    res.json(collectExport(db));
  });

  router.post('/import', (req, res) => {
    const body = asObject(req.body);
    const mode = body['mode'];
    if (mode !== 'replace' && mode !== 'merge') {
      throw validationError("mode は 'replace' または 'merge' である必要があります");
    }
    const data = asObject(body['data'], 'data');
    if (has(data, 'version') && Number(data['version']) !== EXPORT_VERSION) {
      throw validationError(`data.version は ${EXPORT_VERSION} である必要があります`);
    }

    const members = arrayField(data, 'members');
    const projects = arrayField(data, 'projects');
    const tags = arrayField(data, 'tags');
    const tasks = arrayField(data, 'tasks');
    const comments = arrayField(data, 'comments');
    const now = nowIso();

    const counts = tx(db, (): ImportCounts => {
      // id の対応表（replace は元の id をそのまま使う）
      const memberIds = new Map<number, number>();
      const projectIds = new Map<number, number>();
      const tagIds = new Map<number, number>();
      const taskIds = new Map<number, number>();

      if (mode === 'replace') {
        db.exec('DELETE FROM comments; DELETE FROM task_tags; DELETE FROM tasks; DELETE FROM tags; DELETE FROM projects; DELETE FROM members;');
      }

      const insertMember = db.prepare(
        mode === 'replace'
          ? 'INSERT INTO members (id, name, active, created_at) VALUES (?, ?, ?, ?)'
          : 'INSERT INTO members (name, active, created_at) VALUES (?, ?, ?)',
      );
      for (const record of members) {
        const oldId = requireId(record['id'], 'members[].id');
        const name = requireName(record['name'], 'members[].name');
        const active = sqlBool(record['active'] !== false);
        const createdAt = optIso(record, 'createdAt', now);
        const info =
          mode === 'replace'
            ? insertMember.run(oldId, name, active, createdAt)
            : insertMember.run(name, active, createdAt);
        memberIds.set(oldId, mode === 'replace' ? oldId : Number(info.lastInsertRowid));
      }

      const insertProject = db.prepare(
        mode === 'replace'
          ? `INSERT INTO projects (id, name, description, color, archived, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          : `INSERT INTO projects (name, description, color, archived, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const record of projects) {
        const oldId = requireId(record['id'], 'projects[].id');
        const values = [
          requireName(record['name'], 'projects[].name'),
          optText(record, 'description'),
          has(record, 'color') ? requireColor(record['color']) : '#4f46e5',
          sqlBool(record['archived'] === true),
          optIso(record, 'createdAt', now),
          optIso(record, 'updatedAt', now),
        ] as const;
        const info =
          mode === 'replace' ? insertProject.run(oldId, ...values) : insertProject.run(...values);
        projectIds.set(oldId, mode === 'replace' ? oldId : Number(info.lastInsertRowid));
      }

      const insertTag = db.prepare(
        mode === 'replace'
          ? 'INSERT INTO tags (id, name, color) VALUES (?, ?, ?)'
          : 'INSERT INTO tags (name, color) VALUES (?, ?)',
      );
      const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
      for (const record of tags) {
        const oldId = requireId(record['id'], 'tags[].id');
        const name = requireName(record['name'], 'tags[].name');
        const color = has(record, 'color') ? requireColor(record['color']) : '#64748b';
        if (mode === 'replace') {
          insertTag.run(oldId, name, color);
          tagIds.set(oldId, oldId);
        } else {
          const existing = findTag.get(name) as Row | undefined;
          // merge では同名タグを再利用する
          tagIds.set(oldId, existing ? Number(existing['id']) : Number(insertTag.run(name, color).lastInsertRowid));
        }
      }

      const insertTask = db.prepare(
        mode === 'replace'
          ? `INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id,
               due_date, position, created_at, updated_at, completed_at, archived_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          : `INSERT INTO tasks (project_id, title, description, status, priority, assignee_id,
               due_date, position, created_at, updated_at, completed_at, archived_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertTaskTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
      for (const record of tasks) {
        const oldId = requireId(record['id'], 'tasks[].id');
        const oldProjectId = requireId(record['projectId'], 'tasks[].projectId');
        const projectId = projectIds.get(oldProjectId);
        if (projectId === undefined) {
          throw validationError(`tasks[].projectId=${oldProjectId} に対応するプロジェクトがデータに含まれていません`);
        }
        const oldAssignee = has(record, 'assigneeId')
          ? requireNullableId(record['assigneeId'], 'tasks[].assigneeId')
          : null;
        const assigneeId = oldAssignee === null ? null : memberIds.get(oldAssignee) ?? null;
        const status = has(record, 'status') ? requireStatus(record['status'], 'tasks[].status') : 'todo';
        const completedAtRaw = record['completedAt'];
        const completedAt =
          status === 'done'
            ? typeof completedAtRaw === 'string' && completedAtRaw !== ''
              ? completedAtRaw
              : now
            : null;
        // アーカイブは完了タスクにのみ有効。古いエクスポート（項目なし）は未アーカイブ扱い
        const archivedAtRaw = record['archivedAt'];
        const archivedAt =
          status === 'done' && typeof archivedAtRaw === 'string' && archivedAtRaw !== '' ? archivedAtRaw : null;
        const values = [
          projectId,
          requireName(record['title'], 'tasks[].title'),
          optText(record, 'description'),
          status,
          has(record, 'priority') ? requirePriority(record['priority'], 'tasks[].priority') : 'medium',
          assigneeId,
          optDue(record),
          has(record, 'position') ? requireNumber(record['position'], 'tasks[].position') : 0,
          optIso(record, 'createdAt', now),
          optIso(record, 'updatedAt', now),
          completedAt,
          archivedAt,
        ] as const;
        const info = mode === 'replace' ? insertTask.run(oldId, ...values) : insertTask.run(...values);
        const newTaskId = mode === 'replace' ? oldId : Number(info.lastInsertRowid);
        taskIds.set(oldId, newTaskId);

        const rawTagIds = record['tagIds'];
        if (rawTagIds !== undefined) {
          if (!Array.isArray(rawTagIds)) throw validationError('tasks[].tagIds は配列である必要があります');
          for (const rawTagId of rawTagIds) {
            const mapped = tagIds.get(requireId(rawTagId, 'tasks[].tagIds の要素'));
            if (mapped !== undefined) insertTaskTag.run(newTaskId, mapped);
          }
        }
      }

      const insertComment = db.prepare(
        mode === 'replace'
          ? 'INSERT INTO comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)'
          : 'INSERT INTO comments (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)',
      );
      for (const record of comments) {
        const oldId = requireId(record['id'], 'comments[].id');
        const taskId = taskIds.get(requireId(record['taskId'], 'comments[].taskId'));
        if (taskId === undefined) {
          throw validationError('comments[].taskId に対応するタスクがデータに含まれていません');
        }
        const oldAuthor = has(record, 'authorId')
          ? requireNullableId(record['authorId'], 'comments[].authorId')
          : null;
        const values = [
          taskId,
          oldAuthor === null ? null : memberIds.get(oldAuthor) ?? null,
          requireText(record['body'], 'comments[].body'),
          optIso(record, 'createdAt', now),
        ] as const;
        if (mode === 'replace') insertComment.run(oldId, ...values);
        else insertComment.run(...values);
      }

      return {
        members: members.length,
        projects: projects.length,
        tags: tags.length,
        tasks: tasks.length,
        comments: comments.length,
      };
    });

    res.json({ ok: true, mode, imported: counts });
  });

  return router;
}
