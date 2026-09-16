import { useMemo, useState } from 'react';
import type { Task, TaskPriority, TaskStatus } from '@shared/types';
import { PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES } from '@shared/types';
import { useStore } from '../store';
import { Assignee, DueDate, PriorityBadge, TagList } from '../components/Badges';

type SortKey = 'title' | 'status' | 'priority' | 'assignee' | 'dueDate' | 'position';

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, review: 2, done: 3 };

interface Props {
  tasks: Task[];
  onOpenTask: (id: number) => void;
}

export function ListView({ tasks, onOpenTask }: Props) {
  const { members, tags, memberById, tagById, updateTask } = useStore();
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [asc, setAsc] = useState(true);
  const [fStatus, setFStatus] = useState<TaskStatus | ''>('');
  const [fPriority, setFPriority] = useState<TaskPriority | ''>('');
  const [fAssignee, setFAssignee] = useState<string>('');
  const [fTag, setFTag] = useState<string>('');
  const [showDone, setShowDone] = useState(false);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (!showDone && t.status === 'done') return false;
      if (fStatus && t.status !== fStatus) return false;
      if (fPriority && t.priority !== fPriority) return false;
      if (fAssignee === 'none' && t.assigneeId !== null) return false;
      if (fAssignee && fAssignee !== 'none' && t.assigneeId !== Number(fAssignee)) return false;
      if (fTag && !t.tagIds.includes(Number(fTag))) return false;
      return true;
    });
  }, [tasks, showDone, fStatus, fPriority, fAssignee, fTag]);

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    const arr = [...filtered];
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
        default:
          return (a.position - b.position || a.id - b.id) * dir;
      }
    });
    return arr;
  }, [filtered, sortKey, asc, memberById]);

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

  const clearFilters = () => {
    setFStatus('');
    setFPriority('');
    setFAssignee('');
    setFTag('');
  };

  const hasFilter = fStatus || fPriority || fAssignee || fTag;

  return (
    <div className="list-view">
      <div className="filter-bar">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as TaskStatus | '')} aria-label="ステータスで絞り込み">
          <option value="">ステータス: すべて</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={fPriority}
          onChange={(e) => setFPriority(e.target.value as TaskPriority | '')}
          aria-label="優先度で絞り込み"
        >
          <option value="">優先度: すべて</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} aria-label="担当者で絞り込み">
          <option value="">担当: すべて</option>
          <option value="none">未割当</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={fTag} onChange={(e) => setFTag(e.target.value)} aria-label="タグで絞り込み">
          <option value="">タグ: すべて</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="check-line">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          完了を表示
        </label>
        {hasFilter ? (
          <button type="button" className="btn btn-quiet" onClick={clearFilters}>
            絞り込みを解除
          </button>
        ) : null}
        <span className="filter-count">{sorted.length} 件</span>
      </div>

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
                <th>タグ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr
                  key={t.id}
                  className={t.status === 'done' ? 'row-done' : ''}
                  onClick={() => onOpenTask(t.id)}
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
                    <DueDate due={t.dueDate} done={t.status === 'done'} />
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
