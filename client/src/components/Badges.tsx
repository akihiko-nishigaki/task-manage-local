import type { Member, Tag, Task, TaskChannel, TaskPriority, TaskStatus } from '@shared/types';
import {
  CHANNEL_LABELS,
  isSafeLink,
  PRIORITY_LABELS,
  REVIEW_STATE_LABELS,
  reviewStateOf,
  STATUS_LABELS,
} from '@shared/types';
import { IconLink } from './Icons';
import { formatDueShort, isOverdue, isToday } from '../utils/date';

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`badge prio prio-${priority}`}>{PRIORITY_LABELS[priority]}</span>;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge status status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span className="tag-chip" style={{ '--tag-color': tag.color } as React.CSSProperties}>
      <span className="tag-dot" />
      {tag.name}
      {onRemove ? (
        <button type="button" className="tag-x" onClick={onRemove} aria-label={`${tag.name} を外す`}>
          ×
        </button>
      ) : null}
    </span>
  );
}

export function TagList({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) return <span className="muted">—</span>;
  return (
    <span className="tag-list">
      {tags.map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
    </span>
  );
}

export function Assignee({ member }: { member: Member | null }) {
  if (!member) return <span className="muted">未割当</span>;
  return (
    <span className="assignee">
      <span className="avatar" aria-hidden="true">
        {member.name.slice(0, 1)}
      </span>
      <span className="assignee-name">{member.name}</span>
    </span>
  );
}

export function DueDate({ due, done = false }: { due: string | null; done?: boolean }) {
  if (!due) return <span className="muted">—</span>;
  const overdue = !done && isOverdue(due);
  const todayDue = !done && isToday(due);
  return (
    <span className={`due${overdue ? ' due-over' : ''}${todayDue ? ' due-today' : ''}`}>
      {formatDueShort(due)}
    </span>
  );
}

/** レビュー期限。レビュー済みなら警告色を出さない */
export function ReviewDue({ due, reviewed }: { due: string | null; reviewed: boolean }) {
  if (!due) return null;
  const overdue = !reviewed && isOverdue(due);
  const todayDue = !reviewed && isToday(due);
  return (
    <span
      className={`due due-review${overdue ? ' due-over' : ''}${todayDue ? ' due-today' : ''}`}
      title={`レビュー期限 ${due}`}
    >
      R {formatDueShort(due)}
    </span>
  );
}

/**
 * レビューの段階を表すバッジ。レビュー期限もチェックも無いタスクには何も出さない
 * （すべてのタスクに「レビュー前」が並んで読みにくくなるのを避ける）。
 */
export function ReviewBadge({ task, always = false }: { task: Task; always?: boolean }) {
  if (!always && !task.reviewed && task.reviewDue === null) return null;
  const state = reviewStateOf(task);
  return <span className={`badge review review-${state}`}>{REVIEW_STATE_LABELS[state]}</span>;
}

/**
 * レビューのチェックボックス。オン = レビュー実施済み。
 * 一覧やカードでは行の右クリックでも切り替えられる（useToggleReviewed）。
 */
export function ReviewCheck({ task, onToggle }: { task: Task; onToggle: (task: Task) => void }) {
  const state = reviewStateOf(task);
  return (
    <label
      className={`review-check review-${state}`}
      title="レビューが終わったらチェック（行の右クリックでも切り替えられます）"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={task.reviewed}
        onChange={() => onToggle(task)}
        aria-label={`${task.title} のレビュー`}
      />
      <span className="review-check-label">{REVIEW_STATE_LABELS[state]}</span>
    </label>
  );
}

export function ColorDot({ color }: { color: string }) {
  return <span className="color-dot" style={{ background: color }} aria-hidden="true" />;
}

export function ChannelBadge({ channel }: { channel: TaskChannel | null }) {
  if (!channel) return null;
  return <span className={`channel channel-${channel}`}>{CHANNEL_LABELS[channel]}</span>;
}

/**
 * 外部リンク。スキームを許可リストで確認してから <a> にする。
 * 不正な値は見た目だけのテキストにして、クリックできないようにする。
 */
export function TaskLink({
  link,
  label,
  compact = false,
}: {
  link: string | null;
  label?: string;
  compact?: boolean;
}) {
  if (!link) return null;
  if (!isSafeLink(link)) {
    return (
      <span className="task-link task-link-invalid" title="このリンクは開けません">
        リンク不正
      </span>
    );
  }
  return (
    <a
      className={`task-link${compact ? ' task-link-compact' : ''}`}
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title={link}
      onClick={(e) => e.stopPropagation()}
    >
      <IconLink />
      <span>{label ?? (compact ? 'リンク' : '開く')}</span>
    </a>
  );
}
