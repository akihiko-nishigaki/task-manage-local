// 複数ルートで共有する DB アクセス処理。
import type { Db } from './db.js';
import { notFoundError } from './errors.js';
import type { Row } from './rows.js';

export function rowExists(db: Db, table: 'members' | 'projects' | 'tags' | 'tasks' | 'comments', id: number): boolean {
  const row = db.prepare(`SELECT 1 AS ok FROM ${table} WHERE id = ?`).get(id);
  return row !== undefined;
}

export function ensureProject(db: Db, id: number): void {
  if (!rowExists(db, 'projects', id)) throw notFoundError(`プロジェクト id=${id} が見つかりません`);
}

export function ensureTask(db: Db, id: number): void {
  if (!rowExists(db, 'tasks', id)) throw notFoundError(`タスク id=${id} が見つかりません`);
}

export function ensureMember(db: Db, id: number | null): void {
  if (id === null) return;
  if (!rowExists(db, 'members', id)) throw notFoundError(`メンバー id=${id} が見つかりません`);
}

export function ensureTags(db: Db, ids: number[]): void {
  for (const id of ids) {
    if (!rowExists(db, 'tags', id)) throw notFoundError(`タグ id=${id} が見つかりません`);
  }
}

/** タスク id → タグ id 配列。1 クエリでまとめて取得する。 */
export function tagIdsByTask(db: Db, taskIds: number[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const id of taskIds) map.set(id, []);
  if (taskIds.length === 0) return map;
  const placeholders = taskIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT task_id, tag_id FROM task_tags WHERE task_id IN (${placeholders}) ORDER BY task_id, tag_id`,
    )
    .all(...taskIds) as Row[];
  for (const row of rows) {
    const list = map.get(Number(row['task_id']));
    if (list) list.push(Number(row['tag_id']));
  }
  return map;
}

export function tagIdsForTask(db: Db, taskId: number): number[] {
  return tagIdsByTask(db, [taskId]).get(taskId) ?? [];
}

export function setTaskTags(db: Db, taskId: number, tagIds: number[]): void {
  ensureTags(db, tagIds);
  db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);
  const insert = db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)');
  for (const tagId of tagIds) insert.run(taskId, tagId);
}

/** SQLite の一意制約違反かどうか。 */
export function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
}
