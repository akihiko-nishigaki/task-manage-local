import type { Member, Tag, TaskChannel, TaskPriority, TaskStatus } from '@shared/types';
import { CHANNEL_LABELS, isSafeLink, PRIORITY_LABELS, STATUS_LABELS } from '@shared/types';
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
