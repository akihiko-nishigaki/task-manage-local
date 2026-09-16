import { useMemo } from 'react';
import type { Task } from '@shared/types';
import { useStore } from '../store';
import { Assignee, PriorityBadge, StatusBadge } from '../components/Badges';
import { IconAlert, IconCalendar, IconProgress, IconUser } from '../components/Icons';
import { describeDue, isOverdue, isWithinDays } from '../utils/date';

interface Props {
  tasks: Task[];
  onOpenTask: (id: number) => void;
}

function MiniList({
  tasks,
  onOpenTask,
  empty,
}: {
  tasks: Task[];
  onOpenTask: (id: number) => void;
  empty: string;
}) {
  const { memberById, projectById } = useStore();
  if (tasks.length === 0) return <p className="muted card-empty">{empty}</p>;
  return (
    <ul className="mini-list">
      {tasks.map((t) => {
        const project = projectById(t.projectId);
        return (
          <li key={t.id}>
            <button type="button" className="mini-row" onClick={() => onOpenTask(t.id)}>
              <span className="mini-main">
                <span className="mini-title">{t.title}</span>
                <span className="mini-meta">
                  {project ? (
                    <span className="mini-project">
                      <span className="color-dot" style={{ background: project.color }} />
                      {project.name}
                    </span>
                  ) : null}
                  <Assignee member={memberById(t.assigneeId)} />
                </span>
              </span>
              <span className="mini-right">
                <PriorityBadge priority={t.priority} />
                {t.dueDate ? (
                  <span className={isOverdue(t.dueDate) && t.status !== 'done' ? 'due due-over' : 'due'}>
                    {describeDue(t.dueDate)}
                  </span>
                ) : null}
                <StatusBadge status={t.status} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Dashboard({ tasks, onOpenTask }: Props) {
  const { currentUser } = useStore();

  const open = useMemo(() => tasks.filter((t) => t.status !== 'done'), [tasks]);

  const overdue = useMemo(
    () =>
      open
        .filter((t) => isOverdue(t.dueDate))
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')),
    [open],
  );

  const upcoming = useMemo(
    () =>
      open
        .filter((t) => isWithinDays(t.dueDate, 7))
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')),
    [open],
  );

  const mine = useMemo(
    () =>
      currentUser ? open.filter((t) => t.assigneeId === currentUser.id) : [],
    [open, currentUser],
  );

  const inProgress = useMemo(() => open.filter((t) => t.status === 'in_progress'), [open]);

  return (
    <div className="dashboard">
      <section className="card">
        <header className="card-head">
          <span className="card-icon danger">
            <IconAlert />
          </span>
          <h2>期限超過</h2>
          <span className="card-count">{overdue.length}</span>
        </header>
        <MiniList tasks={overdue.slice(0, 12)} onOpenTask={onOpenTask} empty="期限超過のタスクはありません。" />
      </section>

      <section className="card">
        <header className="card-head">
          <span className="card-icon warn">
            <IconCalendar />
          </span>
          <h2>今日・今週の期限</h2>
          <span className="card-count">{upcoming.length}</span>
        </header>
        <MiniList tasks={upcoming.slice(0, 12)} onOpenTask={onOpenTask} empty="直近 7 日に期限のタスクはありません。" />
      </section>

      <section className="card">
        <header className="card-head">
          <span className="card-icon">
            <IconUser />
          </span>
          <h2>担当タスク{currentUser ? `（${currentUser.name}）` : ''}</h2>
          <span className="card-count">{mine.length}</span>
        </header>
        <MiniList
          tasks={mine.slice(0, 12)}
          onOpenTask={onOpenTask}
          empty={
            currentUser
              ? '担当しているタスクはありません。'
              : '左サイドバーで「現在のユーザー」を選択してください。'
          }
        />
      </section>

      <section className="card">
        <header className="card-head">
          <span className="card-icon ok">
            <IconProgress />
          </span>
          <h2>進行中</h2>
          <span className="card-count">{inProgress.length}</span>
        </header>
        <MiniList tasks={inProgress.slice(0, 12)} onOpenTask={onOpenTask} empty="進行中のタスクはありません。" />
      </section>
    </div>
  );
}

export { MiniList };
