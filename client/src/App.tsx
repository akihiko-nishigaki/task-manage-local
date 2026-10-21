import { useEffect, useMemo, useState } from 'react';
import type { Project, Task } from '@shared/types';
import { useStore } from './store';
import { navigate, useRoute } from './router';
import { Sidebar } from './components/Sidebar';
import { TopBar, type ViewMode } from './components/TopBar';
import { Toasts } from './components/Toasts';
import { TaskDrawer } from './components/TaskDrawer';
import { TaskCreateModal } from './components/TaskCreateModal';
import { ProjectModal } from './components/ProjectModal';
import { ConfirmDialog } from './components/Modal';
import { UserScopeHint } from './components/UserScopeHint';
import { Dashboard } from './views/Dashboard';
import { applyTaskFilter, EMPTY_FILTER, TaskFilterBar, type TaskFilter } from './components/TaskFilterBar';
import { ListView } from './views/ListView';
import { KanbanView } from './views/KanbanView';
import { MembersView } from './views/MembersView';
import { TagsView } from './views/TagsView';
import { SettingsView } from './views/SettingsView';
import { ArchiveView } from './views/ArchiveView';
import { IconArchive, IconEdit, IconTrash } from './components/Icons';

const VIEW_KEY = 'taskmanage.viewMode';

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'kanban' ? 'kanban' : 'list';
  } catch {
    return 'list';
  }
}

export function App() {
  const store = useStore();
  const { ready, loadError, projects, tasks, currentUserId, inUserScope, includeArchived } = store;
  const route = useRoute();

  const [view, setViewState] = useState<ViewMode>(() => readViewMode());
  const [search, setSearch] = useState('');
  // 絞り込みはリストとカンバンで共有する（表示を切り替えても条件が消えないように）
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [projectModal, setProjectModal] = useState<{ project: Project | null } | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<number[] | null>(null);

  const setView = (v: ViewMode) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* 保存できなくても動作に影響なし */
    }
  };

  const activeProject =
    route.name === 'project' ? projects.find((p) => p.id === route.projectId) ?? null : null;

  // 存在しないプロジェクト ID のハッシュが来たら一覧に戻す
  useEffect(() => {
    if (ready && route.name === 'project' && !activeProject) navigate({ name: 'all' });
  }, [ready, route, activeProject]);

  // 開いていたタスクが消えたらドロワーを閉じる
  useEffect(() => {
    if (selectedTaskId !== null && !tasks.some((t) => t.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [tasks, selectedTaskId]);

  const scopedTasks: Task[] = useMemo(() => {
    const visibleProjectIds = new Set(
      projects.filter((p) => includeArchived || !p.archived).map((p) => p.id),
    );
    let list = tasks;
    if (route.name === 'project') list = list.filter((t) => t.projectId === route.projectId);
    else if (route.name === 'mine')
      list = list.filter(
        (t) => currentUserId !== null && t.assigneeId === currentUserId && visibleProjectIds.has(t.projectId),
      );
    else list = list.filter((t) => visibleProjectIds.has(t.projectId));

    // 「現在のユーザー」を選んでいる間は、どの画面でもそのユーザーの担当タスク
    // （「未割当」なら誰にも割り当てられていないタスク）だけを見せる。
    // マイタスクは上の分岐で絞り済み。未選択（全員）のときは絞らない。
    if (route.name !== 'mine') {
      list = list.filter((t) => inUserScope(t.assigneeId));
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [tasks, projects, route, currentUserId, inUserScope, includeArchived, search]);

  const isTaskRoute = route.name === 'dashboard' || route.name === 'all' || route.name === 'mine' || route.name === 'project';

  // 「完了をアーカイブ」の対象 = 今の画面に表示されている完了タスク（検索・絞り込みも反映）
  const archivableIds = useMemo(
    () => (isTaskRoute && route.name !== 'dashboard' ? scopedTasks.filter((t) => t.status === 'done').map((t) => t.id) : []),
    [isTaskRoute, route.name, scopedTasks],
  );
  const openArchiveConfirm = () => {
    if (archivableIds.length > 0) setArchiveConfirm(archivableIds);
  };

  const title = (() => {
    switch (route.name) {
      case 'dashboard':
        return 'ダッシュボード';
      case 'all':
        return 'すべてのタスク';
      case 'mine':
        return 'マイタスク';
      case 'project':
        return activeProject?.name ?? 'プロジェクト';
      case 'members':
        return 'メンバー管理';
      case 'tags':
        return 'タグ管理';
      case 'archive':
        return 'アーカイブ';
      case 'settings':
        return '設定';
    }
  })();

  const subtitle =
    route.name === 'project'
      ? activeProject?.description || undefined
      : route.name === 'mine' && !store.currentUser
        ? '左サイドバーで「現在のユーザー」を選択してください'
        : undefined;

  const defaultProjectId =
    route.name === 'project' ? route.projectId : projects.find((p) => !p.archived)?.id ?? null;

  // カンバンは列がステータスなので、ステータスと「完了を表示」は適用しない
  const filteredTasks = useMemo(
    () => applyTaskFilter(scopedTasks, filter, view === 'list'),
    [scopedTasks, filter, view],
  );

  const renderMain = () => {
    if (!ready) return <p className="empty-state">読み込み中…</p>;
    if (loadError)
      return (
        <div className="empty-state error-state">
          <p>{loadError}</p>
          <button type="button" className="btn" onClick={() => void store.refreshAll()}>
            再読み込み
          </button>
        </div>
      );

    switch (route.name) {
      case 'dashboard':
        return <Dashboard tasks={scopedTasks} onOpenTask={setSelectedTaskId} />;
      case 'members':
        return <MembersView />;
      case 'tags':
        return <TagsView />;
      case 'archive':
        return <ArchiveView />;
      case 'settings':
        return <SettingsView />;
      default:
        return (
          <>
            {/* 絞り込みが効いていることが画面から分かるようにする（ダッシュボードと同じ案内） */}
            {route.name !== 'mine' ? <UserScopeHint /> : null}
            <TaskFilterBar
              value={filter}
              onChange={setFilter}
              showStatus={view === 'list'}
              count={filteredTasks.length}
            />
            {view === 'kanban' ? (
              <KanbanView
                tasks={filteredTasks}
                onOpenTask={setSelectedTaskId}
                quickAddProjectId={defaultProjectId}
                onArchiveDone={openArchiveConfirm}
              />
            ) : (
              <ListView tasks={filteredTasks} onOpenTask={setSelectedTaskId} />
            )}
          </>
        );
    }
  };

  return (
    <div className="app">
      <Sidebar route={route} onNewProject={() => setProjectModal({ project: null })} />

      <div className="main">
        <TopBar
          title={title}
          {...(subtitle ? { subtitle } : {})}
          showViewSwitcher={isTaskRoute && route.name !== 'dashboard'}
          showSearch={isTaskRoute}
          view={view}
          onViewChange={setView}
          search={search}
          onSearchChange={setSearch}
          onCreateTask={() => setShowCreateTask(true)}
          canCreateTask={projects.length > 0}
          archivableCount={archivableIds.length}
          onArchiveDone={openArchiveConfirm}
        />

        {activeProject ? (
          <div className="project-toolbar">
            <span className="color-dot" style={{ background: activeProject.color }} />
            <span className="project-stat">
              未完了 {scopedTasks.filter((t) => t.status !== 'done' && t.status !== 'backlog').length} / 全体{' '}
              {
                tasks.filter(
                  (t) =>
                    t.projectId === activeProject.id &&
                    t.status !== 'backlog' &&
                    // 「現在のユーザー」で絞っているときは、表示中の件数と揃える
                    inUserScope(t.assigneeId),
                ).length
              }
            </span>
            {activeProject.archived ? <span className="badge archived-badge">アーカイブ済み</span> : null}
            <span className="spacer" />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setProjectModal({ project: activeProject })}
            >
              <IconEdit />
              編集
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                void store.updateProject(activeProject.id, { archived: !activeProject.archived })
              }
            >
              <IconArchive />
              {activeProject.archived ? 'アーカイブ解除' : 'アーカイブ'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => setProjectToDelete(activeProject)}
            >
              <IconTrash />
              削除
            </button>
          </div>
        ) : null}

        <main className="content">{renderMain()}</main>
      </div>

      {selectedTaskId !== null ? (
        <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      ) : null}

      {showCreateTask ? (
        <TaskCreateModal
          defaultProjectId={defaultProjectId}
          onClose={() => setShowCreateTask(false)}
          onCreated={(id) => setSelectedTaskId(id)}
        />
      ) : null}

      {projectModal ? (
        <ProjectModal project={projectModal.project} onClose={() => setProjectModal(null)} />
      ) : null}

      {archiveConfirm ? (
        <ConfirmDialog
          title="完了タスクをアーカイブ"
          message={`表示中の完了タスク ${archiveConfirm.length} 件をアーカイブして一覧から隠します。削除はされず、サイドバーの「アーカイブ」からいつでも戻せます。`}
          confirmLabel="アーカイブ"
          onCancel={() => setArchiveConfirm(null)}
          onConfirm={() => {
            const ids = archiveConfirm;
            setArchiveConfirm(null);
            void store.archiveTasks({ ids });
          }}
        />
      ) : null}

      {projectToDelete ? (
        <ConfirmDialog
          title="プロジェクトを削除"
          message={`「${projectToDelete.name}」と配下のタスクをすべて削除します。元に戻せません。`}
          confirmLabel="削除"
          danger
          onCancel={() => setProjectToDelete(null)}
          onConfirm={() => {
            const p = projectToDelete;
            setProjectToDelete(null);
            void store.deleteProject(p.id);
            navigate({ name: 'all' });
          }}
        />
      ) : null}

      <Toasts />
    </div>
  );
}
