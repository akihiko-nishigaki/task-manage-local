import { useMemo, useState, type DragEvent } from 'react';
import type { Task, TaskStatus } from '@shared/types';
import { STATUS_LABELS, TASK_STATUSES } from '@shared/types';
import { useStore } from '../store';
import { Assignee, PriorityBadge, StatusBadge } from '../components/Badges';
import { IconAlert, IconBoard, IconCalendar, IconUser } from '../components/Icons';
import { describeDue, formatDueShort, isOverdue, isWithinDays } from '../utils/date';

interface Props {
  tasks: Task[];
  onOpenTask: (id: number) => void;
}

const DRAG_MIME = 'text/plain';

/** ステータス別ボードに 1 列あたり表示する最大件数（超過分は件数のみ表示）。 */
const COLUMN_LIMIT = 20;

function MiniList({
  tasks,
  onOpenTask,
  empty,
  onDragStartTask,
  onDragEnd,
  draggingId,
}: {
  tasks: Task[];
  onOpenTask: (id: number) => void;
  empty: string;
  onDragStartTask?: (e: DragEvent<HTMLElement>, task: Task) => void;
  onDragEnd?: () => void;
  draggingId?: number | null;
}) {
  const { memberById, projectById } = useStore();
  if (tasks.length === 0) return <p className="muted card-empty">{empty}</p>;
  return (
    <ul className="mini-list">
      {tasks.map((t) => {
        const project = projectById(t.projectId);
        return (
          <li key={t.id}>
            <button
              type="button"
              className={`mini-row${draggingId === t.id ? ' dragging' : ''}`}
              onClick={() => onOpenTask(t.id)}
              draggable={Boolean(onDragStartTask)}
              onDragStart={onDragStartTask ? (e) => onDragStartTask(e, t) : undefined}
              onDragEnd={onDragEnd}
            >
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
  const { currentUser, memberById, projectById, updateTask } = useStore();
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropStatus, setDropStatus] = useState<TaskStatus | null>(null);

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
    () => (currentUser ? open.filter((t) => t.assigneeId === currentUser.id) : []),
    [open, currentUser],
  );

  // ステータス別の列。並び順はカンバンと揃える。
  const columns = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const s of TASK_STATUSES) map.set(s, []);
    for (const t of tasks) map.get(t.status)?.push(t);
    for (const s of TASK_STATUSES) {
      map.get(s)!.sort((a, b) => a.position - b.position || a.id - b.id);
    }
    return map;
  }, [tasks]);

  const startDrag = (e: DragEvent<HTMLElement>, task: Task) => {
    setDragId(task.id);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData(DRAG_MIME, String(task.id));
    } catch {
      /* 取得できないブラウザでは state 側の dragId で補う */
    }
  };

  const endDrag = () => {
    setDragId(null);
    setDropStatus(null);
  };

  const overColumn = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropStatus(status);
  };

  const dropOnColumn = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    e.preventDefault();
    const raw = (() => {
      try {
        return e.dataTransfer.getData(DRAG_MIME);
      } catch {
        return '';
      }
    })();
    const id = dragId ?? (raw ? Number(raw) : NaN);
    endDrag();
    if (!Number.isFinite(id)) return;
    const task = tasks.find((t) => t.id === id);
    // 同じステータスへのドロップは変更なし（並べ替えはカンバンで行う）
    if (!task || task.status === status) return;
    void updateTask(task.id, { status });
  };

  return (
    <div className="dashboard">
      <div className="dash-summary">
        <section className="card">
          <header className="card-head">
            <span className="card-icon danger">
              <IconAlert />
            </span>
            <h2>期限超過</h2>
            <span className="card-count">{overdue.length}</span>
          </header>
          <MiniList
            tasks={overdue.slice(0, 12)}
            onOpenTask={onOpenTask}
            empty="期限超過のタスクはありません。"
            onDragStartTask={startDrag}
            onDragEnd={endDrag}
            draggingId={dragId}
          />
        </section>

        <section className="card">
          <header className="card-head">
            <span className="card-icon warn">
              <IconCalendar />
            </span>
            <h2>今日・今週の期限</h2>
            <span className="card-count">{upcoming.length}</span>
          </header>
          <MiniList
            tasks={upcoming.slice(0, 12)}
            onOpenTask={onOpenTask}
            empty="直近 7 日に期限のタスクはありません。"
            onDragStartTask={startDrag}
            onDragEnd={endDrag}
            draggingId={dragId}
          />
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
            onDragStartTask={startDrag}
            onDragEnd={endDrag}
            draggingId={dragId}
          />
        </section>
      </div>

      <section className="card dash-status">
        <header className="card-head">
          <span className="card-icon ok">
            <IconBoard />
          </span>
          <h2>ステータス別</h2>
          <span className="muted head-hint">カードをドラッグするとステータスを変更できます</span>
          <span className="card-count">{tasks.length}</span>
        </header>

        <div className="status-board">
          {TASK_STATUSES.map((status) => {
            const list = columns.get(status) ?? [];
            const shown = list.slice(0, COLUMN_LIMIT);
            const rest = list.length - shown.length;
            return (
              <div
                key={status}
                className={`status-col${dropStatus === status && dragId !== null ? ' drop-active' : ''}`}
                onDragOver={(e) => overColumn(e, status)}
                onDragEnter={(e) => overColumn(e, status)}
                onDrop={(e) => dropOnColumn(e, status)}
              >
                <div className="status-col-head">
                  <span className={`col-dot col-${status}`} />
                  <h3>{STATUS_LABELS[status]}</h3>
                  <span className="status-col-count">{list.length}</span>
                </div>

                <ul className="status-cards">
                  {shown.map((t) => {
                    const project = projectById(t.projectId);
                    const member = memberById(t.assigneeId);
                    return (
                      <li key={t.id}>
                        <div
                          className={`status-card${dragId === t.id ? ' dragging' : ''}`}
                          draggable
                          onDragStart={(e) => startDrag(e, t)}
                          onDragEnd={endDrag}
                          role="button"
                          tabIndex={0}
                          onClick={() => onOpenTask(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onOpenTask(t.id);
                            }
                          }}
                        >
                          <span className="status-card-title">{t.title}</span>
                          <span className="status-card-meta">
                            {project ? (
                              <span className="mini-project">
                                <span className="color-dot" style={{ background: project.color }} />
                                {project.name}
                              </span>
                            ) : null}
                            <PriorityBadge priority={t.priority} />
                            {member ? <Assignee member={member} /> : null}
                            {t.dueDate ? (
                              <span
                                className={
                                  isOverdue(t.dueDate) && t.status !== 'done' ? 'due due-over' : 'due'
                                }
                              >
                                {formatDueShort(t.dueDate)}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </li>
                    );
                  })}

                  {shown.length === 0 ? (
                    <li className="status-empty muted">ここにドロップすると「{STATUS_LABELS[status]}」になります</li>
                  ) : null}

                  {rest > 0 ? <li className="status-more muted">他 {rest} 件</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export { MiniList };
