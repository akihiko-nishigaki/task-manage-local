// アプリ全体の状態。外部状態管理ライブラリは使わず React context のみ。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Comment,
  CreateCommentInput,
  CreateProjectInput,
  CreateTagInput,
  CreateTaskInput,
  ExportData,
  Member,
  Project,
  Tag,
  Task,
  TaskDetail,
  UpdateMemberInput,
  UpdateProjectInput,
  UpdateTagInput,
  UpdateTaskInput,
} from '@shared/types';
import { ApiError, api } from './api';

export interface Toast {
  id: number;
  kind: 'error' | 'success' | 'info';
  message: string;
}

const CURRENT_USER_KEY = 'taskmanage.currentUserId';

function readStoredUserId(): number | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

interface StoreValue {
  ready: boolean;
  loadError: string | null;
  members: Member[];
  projects: Project[];
  tags: Tag[];
  tasks: Task[];

  currentUserId: number | null;
  setCurrentUserId: (id: number | null) => void;
  currentUser: Member | null;

  includeArchived: boolean;
  setIncludeArchived: (v: boolean) => void;

  toasts: Toast[];
  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: number) => void;

  refreshAll: () => Promise<void>;
  refreshTasks: () => Promise<void>;

  memberById: (id: number | null | undefined) => Member | null;
  projectById: (id: number | null | undefined) => Project | null;
  tagById: (id: number) => Tag | null;

  createMember: (name: string) => Promise<void>;
  updateMember: (id: number, input: UpdateMemberInput) => Promise<void>;
  deleteMember: (id: number) => Promise<void>;

  createProject: (input: CreateProjectInput) => Promise<Project | null>;
  updateProject: (id: number, input: UpdateProjectInput) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;

  createTag: (input: CreateTagInput) => Promise<void>;
  updateTag: (id: number, input: UpdateTagInput) => Promise<void>;
  deleteTag: (id: number) => Promise<void>;

  createTask: (input: CreateTaskInput) => Promise<Task | null>;
  updateTask: (id: number, input: UpdateTaskInput) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
  reorderTasks: (items: { id: number; status: Task['status']; position: number }[]) => Promise<void>;

  loadTaskDetail: (id: number) => Promise<TaskDetail | null>;
  addComment: (taskId: number, input: CreateCommentInput) => Promise<Comment | null>;
  deleteComment: (id: number) => Promise<void>;

  exportData: () => Promise<ExportData | null>;
  importData: (mode: 'replace' | 'merge', data: ExportData) => Promise<boolean>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore は StoreProvider の内側で使用してください。');
  return ctx;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [currentUserId, setCurrentUserIdState] = useState<number | null>(() => readStoredUserId());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = toastSeq.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      window.setTimeout(() => dismissToast(id), kind === 'error' ? 6000 : 3000);
    },
    [dismissToast],
  );

  const reportError = useCallback(
    (err: unknown, fallback: string) => {
      const message = err instanceof ApiError ? err.message : fallback;
      pushToast('error', message);
    },
    [pushToast],
  );

  const setCurrentUserId = useCallback((id: number | null) => {
    setCurrentUserIdState(id);
    try {
      if (id === null) localStorage.removeItem(CURRENT_USER_KEY);
      else localStorage.setItem(CURRENT_USER_KEY, String(id));
    } catch {
      /* localStorage が使えない環境では無視 */
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    const list = await api.listTasks({ includeDone: true });
    setTasks(list);
  }, []);

  const refreshAll = useCallback(async () => {
    const [m, p, g, t] = await Promise.all([
      api.listMembers(),
      api.listProjects(true),
      api.listTags(),
      api.listTasks({ includeDone: true }),
    ]);
    setMembers(m);
    setProjects(p);
    setTags(g);
    setTasks(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshAll();
        if (!cancelled) setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'データの読み込みに失敗しました。');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  // 保存されている現在ユーザーが存在しなければクリアする
  useEffect(() => {
    if (currentUserId === null || members.length === 0) return;
    if (!members.some((m) => m.id === currentUserId)) setCurrentUserId(null);
  }, [members, currentUserId, setCurrentUserId]);

  const memberById = useCallback(
    (id: number | null | undefined) => members.find((m) => m.id === id) ?? null,
    [members],
  );
  const projectById = useCallback(
    (id: number | null | undefined) => projects.find((p) => p.id === id) ?? null,
    [projects],
  );
  const tagById = useCallback((id: number) => tags.find((t) => t.id === id) ?? null, [tags]);

  // --- メンバー ---
  const createMember = useCallback(
    async (name: string) => {
      try {
        const created = await api.createMember({ name });
        setMembers((prev) => [...prev, created]);
        pushToast('success', 'メンバーを追加しました。');
      } catch (err) {
        reportError(err, 'メンバーの追加に失敗しました。');
      }
    },
    [pushToast, reportError],
  );

  const updateMember = useCallback(
    async (id: number, input: UpdateMemberInput) => {
      const before = members;
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...input } : m)));
      try {
        const updated = await api.updateMember(id, input);
        if (updated && typeof updated === 'object' && 'id' in updated) {
          setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)));
        }
      } catch (err) {
        setMembers(before);
        reportError(err, 'メンバーの更新に失敗しました。');
      }
    },
    [members, reportError],
  );

  const deleteMember = useCallback(
    async (id: number) => {
      const before = members;
      setMembers((prev) => prev.filter((m) => m.id !== id));
      try {
        await api.deleteMember(id);
        setTasks((prev) =>
          prev.map((t) => (t.assigneeId === id ? { ...t, assigneeId: null } : t)),
        );
        if (currentUserId === id) setCurrentUserId(null);
        pushToast('success', 'メンバーを削除しました。');
      } catch (err) {
        setMembers(before);
        reportError(err, 'メンバーの削除に失敗しました。');
      }
    },
    [members, currentUserId, setCurrentUserId, pushToast, reportError],
  );

  // --- プロジェクト ---
  const createProject = useCallback(
    async (input: CreateProjectInput) => {
      try {
        const created = await api.createProject(input);
        setProjects((prev) => [...prev, created]);
        pushToast('success', 'プロジェクトを作成しました。');
        return created;
      } catch (err) {
        reportError(err, 'プロジェクトの作成に失敗しました。');
        return null;
      }
    },
    [pushToast, reportError],
  );

  const updateProject = useCallback(
    async (id: number, input: UpdateProjectInput) => {
      const before = projects;
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...input } : p)));
      try {
        const updated = await api.updateProject(id, input);
        if (updated && typeof updated === 'object' && 'id' in updated) {
          setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
        }
      } catch (err) {
        setProjects(before);
        reportError(err, 'プロジェクトの更新に失敗しました。');
      }
    },
    [projects, reportError],
  );

  const deleteProject = useCallback(
    async (id: number) => {
      const beforeProjects = projects;
      const beforeTasks = tasks;
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setTasks((prev) => prev.filter((t) => t.projectId !== id));
      try {
        await api.deleteProject(id);
        pushToast('success', 'プロジェクトを削除しました。');
      } catch (err) {
        setProjects(beforeProjects);
        setTasks(beforeTasks);
        reportError(err, 'プロジェクトの削除に失敗しました。');
      }
    },
    [projects, tasks, pushToast, reportError],
  );

  // --- タグ ---
  const createTag = useCallback(
    async (input: CreateTagInput) => {
      try {
        const created = await api.createTag(input);
        setTags((prev) => [...prev, created]);
        pushToast('success', 'タグを追加しました。');
      } catch (err) {
        reportError(err, 'タグの追加に失敗しました。');
      }
    },
    [pushToast, reportError],
  );

  const updateTag = useCallback(
    async (id: number, input: UpdateTagInput) => {
      const before = tags;
      setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...input } : t)));
      try {
        await api.updateTag(id, input);
      } catch (err) {
        setTags(before);
        reportError(err, 'タグの更新に失敗しました。');
      }
    },
    [tags, reportError],
  );

  const deleteTag = useCallback(
    async (id: number) => {
      const beforeTags = tags;
      const beforeTasks = tasks;
      setTags((prev) => prev.filter((t) => t.id !== id));
      setTasks((prev) => prev.map((t) => ({ ...t, tagIds: t.tagIds.filter((x) => x !== id) })));
      try {
        await api.deleteTag(id);
        pushToast('success', 'タグを削除しました。');
      } catch (err) {
        setTags(beforeTags);
        setTasks(beforeTasks);
        reportError(err, 'タグの削除に失敗しました。');
      }
    },
    [tags, tasks, pushToast, reportError],
  );

  // --- タスク ---
  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      try {
        const created = await api.createTask(input);
        setTasks((prev) => [...prev, created]);
        // プロジェクトの件数表示を追従させる
        void api.listProjects(true).then(setProjects).catch(() => undefined);
        pushToast('success', 'タスクを作成しました。');
        return created;
      } catch (err) {
        reportError(err, 'タスクの作成に失敗しました。');
        return null;
      }
    },
    [pushToast, reportError],
  );

  const updateTask = useCallback(
    async (id: number, input: UpdateTaskInput) => {
      const before = tasks;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...input } : t)));
      try {
        const updated = await api.updateTask(id, input);
        if (updated && typeof updated === 'object' && 'id' in updated) {
          setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
        }
        void api.listProjects(true).then(setProjects).catch(() => undefined);
      } catch (err) {
        setTasks(before);
        reportError(err, 'タスクの更新に失敗しました。');
      }
    },
    [tasks, reportError],
  );

  const deleteTask = useCallback(
    async (id: number) => {
      const before = tasks;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await api.deleteTask(id);
        void api.listProjects(true).then(setProjects).catch(() => undefined);
        pushToast('success', 'タスクを削除しました。');
      } catch (err) {
        setTasks(before);
        reportError(err, 'タスクの削除に失敗しました。');
      }
    },
    [tasks, pushToast, reportError],
  );

  const reorderTasks = useCallback(
    async (items: { id: number; status: Task['status']; position: number }[]) => {
      const before = tasks;
      const byId = new Map(items.map((i) => [i.id, i]));
      setTasks((prev) =>
        prev.map((t) => {
          const next = byId.get(t.id);
          return next ? { ...t, status: next.status, position: next.position } : t;
        }),
      );
      try {
        await api.reorderTasks({ items });
        void api.listProjects(true).then(setProjects).catch(() => undefined);
      } catch (err) {
        setTasks(before);
        reportError(err, '並べ替えに失敗しました。');
      }
    },
    [tasks, reportError],
  );

  const loadTaskDetail = useCallback(
    async (id: number) => {
      try {
        return await api.getTask(id);
      } catch (err) {
        reportError(err, 'タスクの取得に失敗しました。');
        return null;
      }
    },
    [reportError],
  );

  const addComment = useCallback(
    async (taskId: number, input: CreateCommentInput) => {
      try {
        return await api.addComment(taskId, input);
      } catch (err) {
        reportError(err, 'コメントの投稿に失敗しました。');
        return null;
      }
    },
    [reportError],
  );

  const deleteComment = useCallback(
    async (id: number) => {
      try {
        await api.deleteComment(id);
      } catch (err) {
        reportError(err, 'コメントの削除に失敗しました。');
      }
    },
    [reportError],
  );

  const exportData = useCallback(async () => {
    try {
      return await api.exportAll();
    } catch (err) {
      reportError(err, 'エクスポートに失敗しました。');
      return null;
    }
  }, [reportError]);

  const importData = useCallback(
    async (mode: 'replace' | 'merge', data: ExportData) => {
      try {
        await api.importAll(mode, data);
        await refreshAll();
        pushToast('success', 'インポートが完了しました。');
        return true;
      } catch (err) {
        reportError(err, 'インポートに失敗しました。');
        return false;
      }
    },
    [refreshAll, pushToast, reportError],
  );

  const currentUser = useMemo(
    () => members.find((m) => m.id === currentUserId) ?? null,
    [members, currentUserId],
  );

  const value: StoreValue = {
    ready,
    loadError,
    members,
    projects,
    tags,
    tasks,
    currentUserId,
    setCurrentUserId,
    currentUser,
    includeArchived,
    setIncludeArchived,
    toasts,
    pushToast,
    dismissToast,
    refreshAll,
    refreshTasks,
    memberById,
    projectById,
    tagById,
    createMember,
    updateMember,
    deleteMember,
    createProject,
    updateProject,
    deleteProject,
    createTag,
    updateTag,
    deleteTag,
    createTask,
    updateTask,
    deleteTask,
    reorderTasks,
    loadTaskDetail,
    addComment,
    deleteComment,
    exportData,
    importData,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
