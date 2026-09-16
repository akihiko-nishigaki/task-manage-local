import { IconBoard, IconList, IconPlus, IconSearch } from './Icons';

export type ViewMode = 'list' | 'kanban';

interface Props {
  title: string;
  subtitle?: string;
  showViewSwitcher: boolean;
  showSearch: boolean;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onCreateTask: () => void;
  canCreateTask: boolean;
}

export function TopBar({
  title,
  subtitle,
  showViewSwitcher,
  showSearch,
  view,
  onViewChange,
  search,
  onSearchChange,
  onCreateTask,
  canCreateTask,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle ? <p className="topbar-sub">{subtitle}</p> : null}
      </div>

      <div className="topbar-actions">
        {showViewSwitcher ? (
          <div className="view-switch" role="group" aria-label="表示切替">
            <button
              type="button"
              className={view === 'list' ? 'active' : ''}
              onClick={() => onViewChange('list')}
            >
              <IconList />
              リスト
            </button>
            <button
              type="button"
              className={view === 'kanban' ? 'active' : ''}
              onClick={() => onViewChange('kanban')}
            >
              <IconBoard />
              カンバン
            </button>
          </div>
        ) : null}

        {showSearch ? (
          <div className="search-box">
            <IconSearch />
            <input
              type="search"
              value={search}
              placeholder="タスクを検索"
              aria-label="タスクを検索"
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          onClick={onCreateTask}
          disabled={!canCreateTask}
          title={canCreateTask ? undefined : 'まずプロジェクトを作成してください'}
        >
          <IconPlus />
          タスク追加
        </button>
      </div>
    </header>
  );
}
