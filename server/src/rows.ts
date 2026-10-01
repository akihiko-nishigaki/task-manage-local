// SQLite の行（snake_case）を shared/types.ts の JSON 形（camelCase）へ変換する。
import type { SQLOutputValue } from 'node:sqlite';
import type { Comment, Member, Project, Tag, Task, TaskPriority, TaskStatus } from '../../shared/types.js';

export type Row = Record<string, SQLOutputValue>;

export const nowIso = (): string => new Date().toISOString();

export const sqlBool = (value: boolean): number => (value ? 1 : 0);

export function num(value: SQLOutputValue | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return Number(value ?? 0);
}

export function optNum(value: SQLOutputValue | undefined): number | null {
  if (value === null || value === undefined) return null;
  return num(value);
}

export function str(value: SQLOutputValue | undefined): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

export function optStr(value: SQLOutputValue | undefined): string | null {
  if (value === null || value === undefined) return null;
  return str(value);
}

export function bool(value: SQLOutputValue | undefined): boolean {
  return num(value) !== 0;
}

export function toMember(row: Row): Member {
  return {
    id: num(row['id']),
    name: str(row['name']),
    active: bool(row['active']),
    createdAt: str(row['created_at']),
  };
}

export function toProject(row: Row, withCounts = false): Project {
  const project: Project = {
    id: num(row['id']),
    name: str(row['name']),
    description: str(row['description']),
    color: str(row['color']),
    archived: bool(row['archived']),
    createdAt: str(row['created_at']),
    updatedAt: str(row['updated_at']),
  };
  if (withCounts) {
    project.taskCount = num(row['task_count']);
    project.openTaskCount = num(row['open_task_count']);
  }
  return project;
}

export function toTag(row: Row): Tag {
  return { id: num(row['id']), name: str(row['name']), color: str(row['color']) };
}

export function toComment(row: Row): Comment {
  return {
    id: num(row['id']),
    taskId: num(row['task_id']),
    authorId: optNum(row['author_id']),
    authorName: optStr(row['author_name']),
    body: str(row['body']),
    createdAt: str(row['created_at']),
  };
}

export function toTask(row: Row, tagIds: number[]): Task {
  return {
    id: num(row['id']),
    projectId: num(row['project_id']),
    title: str(row['title']),
    description: str(row['description']),
    status: str(row['status']) as TaskStatus,
    priority: str(row['priority']) as TaskPriority,
    assigneeId: optNum(row['assignee_id']),
    dueDate: optStr(row['due_date']),
    position: num(row['position']),
    tagIds,
    createdAt: str(row['created_at']),
    updatedAt: str(row['updated_at']),
    completedAt: optStr(row['completed_at']),
    archivedAt: optStr(row['archived_at']),
  };
}
