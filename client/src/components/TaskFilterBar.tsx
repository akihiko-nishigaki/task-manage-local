// タスクの絞り込みバー。リスト表示とカンバン表示で同じ条件を共有する。
import type { Task, TaskChannel, TaskPriority, TaskStatus } from '@shared/types';
import {
  CHANNEL_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_CHANNELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@shared/types';
import { useStore } from '../store';

export interface TaskFilter {
  status: TaskStatus | '';
  priority: TaskPriority | '';
  /** メンバー ID の文字列。'none' は未割当、'' はすべて */
  assignee: string;
  channel: TaskChannel | '';
  /** タグ ID の文字列。'' はすべて */
  tag: string;
  showDone: boolean;
}

export const EMPTY_FILTER: TaskFilter = {
  status: '',
  priority: '',
  assignee: '',
  channel: '',
  tag: '',
  showDone: false,
};

/** ステータス以外の条件が 1 つでも指定されているか。 */
export function hasActiveFilter(f: TaskFilter): boolean {
  return Boolean(f.status || f.priority || f.assignee || f.channel || f.tag);
}

/**
 * 絞り込みを適用する。
 * カンバンは列がステータスそのものなので、ステータスと「完了を表示」は適用しない
 * （useStatus = false）。
 */
export function applyTaskFilter(tasks: Task[], f: TaskFilter, useStatus = true): Task[] {
  return tasks.filter((t) => {
    if (useStatus) {
      if (!f.showDone && t.status === 'done') return false;
      if (f.status && t.status !== f.status) return false;
    }
    if (f.priority && t.priority !== f.priority) return false;
    if (f.assignee === 'none' && t.assigneeId !== null) return false;
    if (f.assignee && f.assignee !== 'none' && t.assigneeId !== Number(f.assignee)) return false;
    if (f.tag && !t.tagIds.includes(Number(f.tag))) return false;
    if (f.channel && t.channel !== f.channel) return false;
    return true;
  });
}

interface Props {
  value: TaskFilter;
  onChange: (next: TaskFilter) => void;
  /** カンバンでは false。ステータスと「完了を表示」を隠す */
  showStatus?: boolean;
  /** 絞り込み後の件数（表示用） */
  count: number;
}

export function TaskFilterBar({ value, onChange, showStatus = true, count }: Props) {
  const { members, tags } = useStore();
  const set = <K extends keyof TaskFilter>(key: K, v: TaskFilter[K]) => onChange({ ...value, [key]: v });

  // 同姓の人がいても見分けられるよう、名前が重複していたら番号を添える
  const label = (name: string, id: number) =>
    members.filter((m) => m.name === name).length > 1 ? `${name}（#${id}）` : name;

  return (
    <div className="filter-bar">
      {showStatus ? (
        <select
          value={value.status}
          onChange={(e) => set('status', e.target.value as TaskStatus | '')}
          aria-label="ステータスで絞り込み"
        >
          <option value="">ステータス: すべて</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      ) : null}

      <select
        value={value.priority}
        onChange={(e) => set('priority', e.target.value as TaskPriority | '')}
        aria-label="優先度で絞り込み"
      >
        <option value="">優先度: すべて</option>
        {TASK_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </select>

      <select
        value={value.assignee}
        onChange={(e) => set('assignee', e.target.value)}
        aria-label="担当者で絞り込み"
      >
        <option value="">担当: すべて</option>
        <option value="none">未割当</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {label(m.name, m.id)}
            {m.active ? '' : '（無効）'}
          </option>
        ))}
      </select>

      <select
        value={value.channel}
        onChange={(e) => set('channel', e.target.value as TaskChannel | '')}
        aria-label="チャネルで絞り込み"
      >
        <option value="">チャネル: すべて</option>
        {TASK_CHANNELS.map((c) => (
          <option key={c} value={c}>
            {CHANNEL_LABELS[c]}
          </option>
        ))}
      </select>

      <select value={value.tag} onChange={(e) => set('tag', e.target.value)} aria-label="タグで絞り込み">
        <option value="">タグ: すべて</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {showStatus ? (
        <label className="check-line">
          <input
            type="checkbox"
            checked={value.showDone}
            onChange={(e) => set('showDone', e.target.checked)}
          />
          完了を表示
        </label>
      ) : null}

      {hasActiveFilter(value) ? (
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => onChange({ ...EMPTY_FILTER, showDone: value.showDone })}
        >
          条件をクリア
        </button>
      ) : null}

      <span className="filter-count">{count} 件</span>
    </div>
  );
}
