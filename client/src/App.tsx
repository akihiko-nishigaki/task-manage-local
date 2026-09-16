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
import { Dashboard } from './views/Dashboard';
import { ListView } from './views/ListView';
import { KanbanView } from './views/KanbanView';
import { MembersView } from './views/MembersView';
import { TagsView } from './views/TagsView';
import { SettingsView } from './views/SettingsView';
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
  const { ready, loadError, projects, tasks, currentUserId, includeArchived } = store;
  const route = useRoute();

  const [view, setViewState] = useState<ViewMode>(() => readViewMode());
  const [search, setSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [projectModal, setProjectModal] = useState<{ project: Project | null } | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

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

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [tasks, projects, route, currentUserId, includeArchived, search]);

  const isTaskRoute = route.name === 'dashboard' || route.name === 'all' || route.name === 'mine' || route.name === 'project';

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
      case 'settings':
        return '設定';
    }
  })();

  const subtitle =
    route.name === 'project'
      ? activeProject?.description || undefined
      : route.name === 'mine' && !store.currentUser
        ? '現在のユーザーが未選択です'
        : undefined;

  const defaultProjectId =
    route.name === 'project' ? route.projectId : projects.find((p) => !p.archived)?.id ?? null;

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
      case 'settings':
        return <SettingsView />;
      default:
        return view === 'kanban' ? (
          <KanbanView
            tasks={scopedTasks}
            onOpenTask={setSelectedTaskId}
            quickAddProjectId={defaultProjectId}
          />
        ) : (
          <ListView tasks={scopedTasks} onOpenTask={setSelectedTaskId} />
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
          view={view}
          onViewChange={setView}
          search={search}
          onSearchChange={setSearch}
          onCreateTask={() => setShowCreateTask(true)}
          canCreateTask={projects.length > 0}
        />

        {activeProject ? (
          <div className="project-toolbar">
            <span className="color-dot" style={{ background: activeProject.color }} />
            <span className="project-stat">
              未完了 {scopedTasks.filter((t) => t.status !== 'done').length} / 全体{' '}
              {tasks.filter((t) => t.projectId === activeProject.id).length}
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
