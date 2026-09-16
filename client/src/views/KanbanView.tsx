import { useMemo, useRef, useState, type DragEvent } from 'react';
import type { Task, TaskStatus } from '@shared/types';
import { STATUS_LABELS, TASK_STATUSES } from '@shared/types';
import { useStore } from '../store';
import { Assignee, PriorityBadge, TagChip } from '../components/Badges';
import { IconPlus } from '../components/Icons';
import { formatDueShort, isOverdue, isToday } from '../utils/date';

interface Props {
  tasks: Task[];
  onOpenTask: (id: number) => void;
  quickAddProjectId: number | null;
}

interface DropTarget {
  status: TaskStatus;
  index: number;
}

const DRAG_MIME = 'text/plain';

export function KanbanView({ tasks, onOpenTask, quickAddProjectId }: Props) {
  const { memberById, tagById, reorderTasks, createTask, projectById } = useStore();
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [quickAddCol, setQuickAddCol] = useState<TaskStatus | null>(null);
  const [quickAddText, setQuickAddText] = useState('');
  const quickBusy = useRef(false);

  const columns = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const s of TASK_STATUSES) map.set(s, []);
    for (const t of tasks) map.get(t.status)?.push(t);
    for (const s of TASK_STATUSES) {
      map.get(s)!.sort((a, b) => a.position - b.position || a.id - b.id);
    }
    return map;
  }, [tasks]);

  const clearDrag = () => {
    setDragId(null);
    setDropTarget(null);
  };

  const onDragStart = (e: DragEvent<HTMLElement>, task: Task) => {
    setDragId(task.id);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData(DRAG_MIME, String(task.id));
    } catch {
      /* 一部ブラウザで失敗しても state 側で補える */
    }
  };

  const overCard = (e: DragEvent<HTMLElement>, status: TaskStatus, index: number) => {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    setDropTarget({ status, index: after ? index + 1 : index });
  };

  const overColumn = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget((prev) => (prev && prev.status === status ? prev : { status, index: columns.get(status)!.length }));
  };

  const commitDrop = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    e.preventDefault();
    const raw = (() => {
      try {
        return e.dataTransfer.getData(DRAG_MIME);
      } catch {
        return '';
      }
    })();
    const id = dragId ?? (raw ? Number(raw) : NaN);
    const target = dropTarget ?? { status, index: columns.get(status)!.length };
    clearDrag();
    if (!Number.isFinite(id)) return;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const destStatus = target.status;
    const source = columns.get(task.status) ?? [];
    const dest = columns.get(destStatus) ?? [];

    if (task.status === destStatus) {
      const without = dest.filter((t) => t.id !== task.id);
      const currentIndex = dest.findIndex((t) => t.id === task.id);
      let insertAt = target.index;
      if (currentIndex !== -1 && currentIndex < target.index) insertAt -= 1;
      insertAt = Math.max(0, Math.min(insertAt, without.length));
      if (insertAt === currentIndex) return;
      const next = [...without];
      next.splice(insertAt, 0, task);
      void reorderTasks(next.map((t, i) => ({ id: t.id, status: destStatus, position: i })));
      return;
    }

    const nextDest = [...dest];
    const insertAt = Math.max(0, Math.min(target.index, nextDest.length));
    nextDest.splice(insertAt, 0, task);
    const nextSource = source.filter((t) => t.id !== task.id);
    void reorderTasks([
      ...nextDest.map((t, i) => ({ id: t.id, status: destStatus, position: i })),
      ...nextSource.map((t, i) => ({ id: t.id, status: task.status, position: i })),
    ]);
  };

  const submitQuickAdd = async (status: TaskStatus) => {
    const title = quickAddText.trim();
    if (!title || quickAddProjectId === null || quickBusy.current) return;
    quickBusy.current = true;
    await createTask({
      projectId: quickAddProjectId,
      title,
      status,
      priority: 'medium',
      tagIds: [],
    });
    quickBusy.current = false;
    setQuickAddText('');
  };

  return (
    <div className="kanban">
      {TASK_STATUSES.map((status) => {
        const items = columns.get(status) ?? [];
        return (
          <section
            key={status}
            className={`kanban-col${dropTarget?.status === status ? ' drop-active' : ''}`}
            onDragOver={(e) => overColumn(e, status)}
            onDrop={(e) => commitDrop(e, status)}
          >
            <header className="kanban-head">
              <span className={`col-dot col-${status}`} aria-hidden="true" />
              <h2>{STATUS_LABELS[status]}</h2>
              <span className="kanban-count">{items.length}</span>
            </header>

            <div className="kanban-cards">
              {items.map((t, index) => {
                const project = projectById(t.projectId);
                const overdue = t.status !== 'done' && isOverdue(t.dueDate);
                return (
                  <div key={t.id} className="card-slot">
                    {dropTarget && dropTarget.status === status && dropTarget.index === index ? (
                      <div className="drop-line" />
                    ) : null}
                    <article
                      className={`task-card${dragId === t.id ? ' dragging' : ''}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, t)}
                      onDragEnd={clearDrag}
                      onDragOver={(e) => overCard(e, status, index)}
                      onDrop={(e) => {
                        e.stopPropagation();
                        commitDrop(e, status);
                      }}
                      onClick={() => onOpenTask(t.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onOpenTask(t.id);
                      }}
                      role="button"
                      aria-label={t.title}
                    >
                      <p className="task-card-title">{t.title}</p>
                      <div className="task-card-tags">
                        {t.tagIds
                          .map((id) => tagById(id))
                          .filter((x): x is NonNullable<typeof x> => x !== null)
                          .map((tag) => (
                            <TagChip key={tag.id} tag={tag} />
                          ))}
                      </div>
                      <div className="task-card-foot">
                        <PriorityBadge priority={t.priority} />
                        <Assignee member={memberById(t.assigneeId)} />
                        {t.dueDate ? (
                          <span
                            className={`due${overdue ? ' due-over' : ''}${
                              t.status !== 'done' && isToday(t.dueDate) ? ' due-today' : ''
                            }`}
                          >
                            {formatDueShort(t.dueDate)}
                          </span>
                        ) : null}
                      </div>
                      {project ? (
                        <span className="task-card-project">
                          <span className="color-dot" style={{ background: project.color }} />
                          {project.name}
                        </span>
                      ) : null}
                    </article>
                  </div>
                );
              })}
              {dropTarget && dropTarget.status === status && dropTarget.index >= items.length ? (
                <div className="drop-line" />
              ) : null}
              {items.length === 0 && dropTarget?.status !== status ? (
                <p className="kanban-empty">タスクなし</p>
              ) : null}
            </div>

            {quickAddCol === status ? (
              <div className="quick-add">
                <textarea
                  autoFocus
                  rows={2}
                  value={quickAddText}
                  placeholder="タイトルを入力して Enter"
                  onChange={(e) => setQuickAddText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void submitQuickAdd(status);
                    }
                    if (e.key === 'Escape') {
                      setQuickAddCol(null);
                      setQuickAddText('');
                    }
                  }}
                  aria-label={`${STATUS_LABELS[status]} にタスクを追加`}
                />
                <div className="quick-add-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void submitQuickAdd(status)}
                    disabled={!quickAddText.trim()}
                  >
                    追加
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setQuickAddCol(null);
                      setQuickAddText('');
                    }}
                  >
                    閉じる
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="quick-add-btn"
                disabled={quickAddProjectId === null}
                title={quickAddProjectId === null ? 'プロジェクトを選択すると追加できます' : undefined}
                onClick={() => {
                  setQuickAddCol(status);
                  setQuickAddText('');
                }}
              >
                <IconPlus width={14} height={14} />
                追加
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
