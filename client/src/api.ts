// API クライアント: 同一オリジンの /api のみを呼び出す（外部通信は一切行わない）。
import type {
  ArchiveResult,
  ArchiveTasksInput,
  Comment,
  CreateCommentInput,
  CreateMemberInput,
  CreateProjectInput,
  CreateTagInput,
  CreateTaskInput,
  ExportData,
  Member,
  Project,
  ReorderInput,
  Tag,
  Task,
  TaskDetail,
  TaskListQuery,
  UpdateMemberInput,
  UpdateProjectInput,
  UpdateTagInput,
  UpdateTaskInput,
} from '@shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const BASE = '/api';

function buildQuery(params: Record<string, unknown> | undefined): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') {
      if (value) sp.set(key, '1');
      continue;
    }
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * サーバーが `{ data: ... }` で包んで返す実装であっても動くようにする保険。
 * 素の値を返す実装（PLAN の想定）ではそのまま通過する。
 */
function unwrap(body: unknown): unknown {
  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'data' in (body as Record<string, unknown>) &&
    Object.keys(body as Record<string, unknown>).length === 1
  ) {
    return (body as Record<string, unknown>).data;
  }
  return body;
}

function asList<T>(body: unknown, ...keys: string[]): T[] {
  const v = unwrap(body);
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') {
    for (const key of ['items', ...keys]) {
      const candidate = (v as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate as T[];
    }
  }
  return [];
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Record<string, unknown> } = {},
): Promise<T> {
  const url = `${BASE}${path}${buildQuery(options.query)}`;
  const init: RequestInit = {
    method,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  };
  if (options.body !== undefined) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('サーバーに接続できませんでした。', 0, 'network_error');
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    let message = `エラーが発生しました (HTTP ${res.status})`;
    let code = `http_${res.status}`;
    const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    if (err) {
      if (typeof err.message === 'string' && err.message) message = err.message;
      if (typeof err.code === 'string' && err.code) code = err.code;
    }
    throw new ApiError(message, res.status, code);
  }

  return unwrap(payload) as T;
}

export const api = {
  health: () => request<{ ok: boolean; version: string; dataDir?: string }>('GET', '/health'),

  // --- メンバー ---
  listMembers: async (): Promise<Member[]> =>
    asList<Member>(await request<unknown>('GET', '/members'), 'members'),
  createMember: (input: CreateMemberInput) => request<Member>('POST', '/members', { body: input }),
  updateMember: (id: number, input: UpdateMemberInput) =>
    request<Member>('PATCH', `/members/${id}`, { body: input }),
  deleteMember: (id: number) => request<void>('DELETE', `/members/${id}`),

  // --- プロジェクト ---
  listProjects: async (includeArchived = false): Promise<Project[]> =>
    asList<Project>(
      await request<unknown>('GET', '/projects', {
        query: includeArchived ? { includeArchived: true } : undefined,
      }),
      'projects',
    ),
  createProject: (input: CreateProjectInput) =>
    request<Project>('POST', '/projects', { body: input }),
  updateProject: (id: number, input: UpdateProjectInput) =>
    request<Project>('PATCH', `/projects/${id}`, { body: input }),
  deleteProject: (id: number) => request<void>('DELETE', `/projects/${id}`),

  // --- タグ ---
  listTags: async (): Promise<Tag[]> => asList<Tag>(await request<unknown>('GET', '/tags'), 'tags'),
  createTag: (input: CreateTagInput) => request<Tag>('POST', '/tags', { body: input }),
  updateTag: (id: number, input: UpdateTagInput) =>
    request<Tag>('PATCH', `/tags/${id}`, { body: input }),
  deleteTag: (id: number) => request<void>('DELETE', `/tags/${id}`),

  // --- タスク ---
  listTasks: async (query: TaskListQuery = {}): Promise<Task[]> =>
    asList<Task>(
      await request<unknown>('GET', '/tasks', { query: query as Record<string, unknown> }),
      'tasks',
    ),
  getTask: (id: number) => request<TaskDetail>('GET', `/tasks/${id}`),
  createTask: (input: CreateTaskInput) => request<Task>('POST', '/tasks', { body: input }),
  updateTask: (id: number, input: UpdateTaskInput) =>
    request<Task>('PATCH', `/tasks/${id}`, { body: input }),
  deleteTask: (id: number) => request<void>('DELETE', `/tasks/${id}`),
  reorderTasks: (input: ReorderInput) => request<void>('POST', '/tasks/reorder', { body: input }),
  archiveTasks: (input: ArchiveTasksInput) =>
    request<ArchiveResult>('POST', '/tasks/archive', { body: input }),
  unarchiveTasks: (ids: number[]) =>
    request<ArchiveResult>('POST', '/tasks/unarchive', { body: { ids } }),

  // --- コメント ---
  addComment: (taskId: number, input: CreateCommentInput) =>
    request<Comment>('POST', `/tasks/${taskId}/comments`, { body: input }),
  deleteComment: (id: number) => request<void>('DELETE', `/comments/${id}`),

  // --- エクスポート / インポート ---
  exportAll: () => request<ExportData>('GET', '/export'),
  importAll: (mode: 'replace' | 'merge', data: ExportData) =>
    request<unknown>('POST', '/import', { body: { mode, data } }),
};
