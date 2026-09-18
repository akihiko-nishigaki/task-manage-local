// 共有型定義: サーバー・クライアント双方がこのファイルを正とする。

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '未着手',
  in_progress: '進行中',
  review: 'レビュー',
  done: '完了',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '緊急',
};

export interface Member {
  id: number;
  name: string;
  active: boolean;
  createdAt: string; // ISO 8601
}

export interface Project {
  id: number;
  name: string;
  description: string;
  color: string; // '#RRGGBB'
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  openTaskCount?: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Comment {
  id: number;
  taskId: number;
  authorId: number | null;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface Task {
  id: number;
  projectId: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: number | null;
  dueDate: string | null; // 'YYYY-MM-DD'
  position: number;
  tagIds: number[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null; // アーカイブ済みなら ISO 8601、未アーカイブなら null
}

export interface TaskDetail extends Task {
  comments: Comment[];
}

export interface TaskListQuery {
  projectId?: number;
  status?: TaskStatus;
  assigneeId?: number;
  tagId?: number;
  priority?: TaskPriority;
  q?: string;
  dueBefore?: string;
  dueAfter?: string;
  includeDone?: boolean;
  /** true でアーカイブ済みタスクも含める（既定 false） */
  includeArchived?: boolean;
  /** true でアーカイブ済みタスクのみ返す */
  archivedOnly?: boolean;
}

export interface CreateMemberInput { name: string }
export interface UpdateMemberInput { name?: string; active?: boolean }

export interface CreateProjectInput { name: string; description?: string; color?: string }
export interface UpdateProjectInput { name?: string; description?: string; color?: string; archived?: boolean }

export interface CreateTagInput { name: string; color?: string }
export interface UpdateTagInput { name?: string; color?: string }

export interface CreateTaskInput {
  projectId: number;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: number | null;
  dueDate?: string | null;
  tagIds?: number[];
}

export interface UpdateTaskInput {
  projectId?: number;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: number | null;
  dueDate?: string | null;
  position?: number;
  tagIds?: number[];
}

export interface ReorderInput {
  items: { id: number; status: TaskStatus; position: number }[];
}

/**
 * 完了タスクの一括アーカイブ。
 * - `ids` を指定するとその id のみ（すべて完了済みである必要がある）
 * - 省略時は `projectId` / `completedBefore` に合致する完了タスクすべて
 */
export interface ArchiveTasksInput {
  ids?: number[];
  projectId?: number;
  /** この日時（ISO 8601）以前に完了したものだけ対象にする */
  completedBefore?: string;
}

export interface UnarchiveTasksInput {
  ids: number[];
}

export interface ArchiveResult {
  count: number;
  tasks: Task[];
}

export interface CreateCommentInput { body: string; authorId?: number | null }

export interface ExportData {
  version: 1;
  exportedAt: string;
  members: Member[];
  projects: Project[];
  tags: Tag[];
  tasks: Task[];
  comments: Comment[];
}

export interface ImportInput { mode: 'replace' | 'merge'; data: ExportData }

export interface ApiError {
  error: { code: string; message: string };
}
