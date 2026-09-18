import { useMemo } from 'react';
import { useStore } from '../store';
import { navigate, sameRoute, type Route } from '../router';
import {
  IconArchive,
  IconHome,
  IconInbox,
  IconPlus,
  IconSettings,
  IconTag,
  IconUser,
  IconUsers,
} from './Icons';
import { ColorDot } from './Badges';

interface Props {
  route: Route;
  onNewProject: () => void;
}

export function Sidebar({ route, onNewProject }: Props) {
  const {
    projects,
    tasks,
    members,
    currentUserId,
    setCurrentUserId,
    includeArchived,
    setIncludeArchived,
  } = useStore();

  const openCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of tasks) {
      if (t.status === 'done') continue;
      map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const openAll = tasks.filter((t) => t.status !== 'done').length;
  const openMine = tasks.filter(
    (t) => t.status !== 'done' && currentUserId !== null && t.assigneeId === currentUserId,
  ).length;

  const visibleProjects = projects.filter((p) => includeArchived || !p.archived);

  const item = (target: Route, icon: React.ReactNode, label: string, count?: number) => (
    <button
      type="button"
      className={`nav-item${sameRoute(route, target) ? ' active' : ''}`}
      onClick={() => navigate(target)}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count !== undefined && count > 0 ? <span className="nav-count">{count}</span> : null}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="22" height="22" role="presentation">
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <path
              d="M9 16.5l4.5 4.5L23 11.5"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="brand-text">タスク管理</span>
      </div>

      <nav className="nav-group">
        {item({ name: 'dashboard' }, <IconHome />, 'ダッシュボード')}
        {item({ name: 'all' }, <IconInbox />, 'すべてのタスク', openAll)}
        {item({ name: 'mine' }, <IconUser />, 'マイタスク', openMine)}
      </nav>

      <div className="current-user">
        <label htmlFor="current-user-select">現在のユーザー</label>
        <select
          id="current-user-select"
          value={currentUserId ?? ''}
          onChange={(e) => setCurrentUserId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">（未選択）</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.active ? '' : '（無効）'}
            </option>
          ))}
        </select>
      </div>

      <div className="nav-section-head">
        <span>プロジェクト</span>
        <button type="button" className="icon-btn" onClick={onNewProject} aria-label="プロジェクトを追加">
          <IconPlus />
        </button>
      </div>

      <nav className="nav-group project-list">
        {visibleProjects.length === 0 ? (
          <p className="empty-hint">プロジェクトがありません</p>
        ) : (
          visibleProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`nav-item${sameRoute(route, { name: 'project', projectId: p.id }) ? ' active' : ''}${p.archived ? ' archived' : ''}`}
              onClick={() => navigate({ name: 'project', projectId: p.id })}
              title={p.description || p.name}
            >
              <span className="nav-icon">
                <ColorDot color={p.color} />
              </span>
              <span className="nav-label">{p.name}</span>
              {openCounts.get(p.id) ? <span className="nav-count">{openCounts.get(p.id)}</span> : null}
            </button>
          ))
        )}
      </nav>

      <label className="check-line archived-toggle">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        アーカイブ済みを表示
      </label>

      <nav className="nav-group sidebar-foot">
        {item({ name: 'members' }, <IconUsers />, 'メンバー')}
        {item({ name: 'tags' }, <IconTag />, 'タグ')}
        {item({ name: 'archive' }, <IconArchive />, 'アーカイブ')}
        {item({ name: 'settings' }, <IconSettings />, '設定')}
      </nav>
    </aside>
  );
}
