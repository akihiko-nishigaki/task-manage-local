import { useMemo, useState } from 'react';
import type { Task, TaskPriority, TaskStatus } from '@shared/types';
import { STATUS_LABELS, TASK_STATUSES } from '@shared/types';
import { useStore } from '../store';
import {
  Assignee,
  ChannelBadge,
  DueDate,
  PriorityBadge,
  ReviewCheck,
  TagList,
  TaskLink,
} from '../components/Badges';
import { useToggleReviewed } from '../utils/review';

type SortKey = 'title' | 'status' | 'priority' | 'assignee' | 'dueDate' | 'reviewDue' | 'position';

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<TaskStatus, number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  review: 3,
  done: 4,
};

interface Props {
  tasks: Task[];
  onOpenTask: (id: number) => void;
}

export function ListView({ tasks, onOpenTask }: Props) {
  const { memberById, tagById, updateTask } = useStore();
  const toggleReviewed = useToggleReviewed();
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [asc, setAsc] = useState(true);
  // 絞り込みは App 側（TaskFilterBar）で済ませてから渡される
  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    const arr = [...tasks];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title, 'ja') * dir;
        case 'status':
          return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir;
        case 'priority':
          return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) * dir;
        case 'assignee': {
          const an = memberById(a.assigneeId)?.name ?? '';
          const bn = memberById(b.assigneeId)?.name ?? '';
          return an.localeCompare(bn, 'ja') * dir;
        }
        case 'dueDate': {
          const ad = a.dueDate ?? '9999-99-99';
          const bd = b.dueDate ?? '9999-99-99';
          return ad.localeCompare(bd) * dir;
        }
        case 'reviewDue': {
          const ad = a.reviewDue ?? '9999-99-99';
          const bd = b.reviewDue ?? '9999-99-99';
          return ad.localeCompare(bd) * dir;
        }
        default:
          return (a.position - b.position || a.id - b.id) * dir;
      }
    });
    return arr;
  }, [tasks, sortKey, asc, memberById]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const header = (key: SortKey, label: string) => (
    <th>
      <button type="button" className="th-sort" onClick={() => toggleSort(key)}>
        {label}
        <span className="sort-arrow">{sortKey === key ? (asc ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );

  return (
    <div className="list-view">
      {sorted.length === 0 ? (
        <p className="empty-state">条件に合うタスクがありません。</p>
      ) : (
        <div className="table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                {header('title', 'タイトル')}
                {header('status', 'ステータス')}
                {header('priority', '優先度')}
                {header('assignee', '担当')}
                {header('dueDate', '期限')}
                {header('reviewDue', 'レビュー期限')}
                <th title="レビューが終わったらチェック（行の右クリックでも切り替えられます）">レビュー</th>
                <th>チャネル</th>
                <th>タグ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr
                  key={t.id}
                  className={t.status === 'done' ? 'row-done' : ''}
                  onClick={() => onOpenTask(t.id)}
                  onContextMenu={(e) => toggleReviewed(t, e)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onOpenTask(t.id);
                  }}
                >
                  <td className="cell-title">{t.title}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      className="inline-status"
                      value={t.status}
                      aria-label={`${t.title} のステータス`}
                      onChange={(e) =>
                        void updateTask(t.id, { status: e.target.value as TaskStatus })
                      }
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td>
                    <Assignee member={memberById(t.assigneeId)} />
                  </td>
                  <td>
                    <DueDate due={t.dueDate} done={t.status === 'done' || t.status === 'backlog'} />
                  </td>
                  <td>
                    <DueDate due={t.reviewDue} done={t.reviewed} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <ReviewCheck task={t} onToggle={toggleReviewed} />
                  </td>
                  <td>
                    <span className="cell-channel">
                      <ChannelBadge channel={t.channel} />
                      <TaskLink link={t.link} compact />
                      {!t.channel && !t.link ? <span className="muted">—</span> : null}
                    </span>
                  </td>
                  <td>
                    <TagList
                      tags={t.tagIds
                        .map((id) => tagById(id))
                        .filter((x): x is NonNullable<typeof x> => x !== null)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
