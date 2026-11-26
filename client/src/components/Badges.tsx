import type { Member, Tag, Task, TaskChannel, TaskPriority, TaskStatus } from '@shared/types';
import {
  activeOwnerIdOf,
  CHANNEL_LABELS,
  isSafeLink,
  ownerIsReviewer,
  PRIORITY_LABELS,
  REVIEW_CHECK_LABEL,
  REVIEW_STATE_LABELS,
  reviewStateOf,
  STATUS_LABELS,
} from '@shared/types';
import { useStore } from '../store';
import { IconLink } from './Icons';
import { formatDueShort, isOverdue, isToday } from '../utils/date';

/**
 * 作業者とレビュー者を並べて出す。いまボールを持っている側をはっきり、もう一方を薄く表示する。
 * レビュー中でもタスクが誰の案件か分かるよう、一覧・ダッシュボード・カンバンで同じ出し方にする。
 */
export function TaskOwners({
  task,
  inline = false,
  compact = false,
  hideWhenEmpty = false,
}: {
  task: Pick<Task, 'status' | 'reviewed' | 'assigneeId' | 'reviewerId'>;
  /** カードや行の中に横並びで出す（表のセルでは縦並び） */
  inline?: boolean;
  /** とくに幅の狭い行では両方ともアバターだけにする（名前はマウスを乗せると出る） */
  compact?: boolean;
  /** 作業者もレビュー者もいないときは何も出さない（カードの情報を増やしすぎない） */
  hideWhenEmpty?: boolean;
}) {
  const { memberById } = useStore();
  if (hideWhenEmpty && task.assigneeId === null && task.reviewerId === null) return null;
  const assigneeDim = task.assigneeId !== null && activeOwnerIdOf(task) !== task.assigneeId;
  const reviewerDim = !ownerIsReviewer(task);
  return (
    <span className={`owner-cell${inline ? ' owner-cell-inline' : ''}`}>
      <Assignee
        member={memberById(task.assigneeId)}
        dim={assigneeDim}
        // 幅の狭いカード・行では、持っていない側はアバターだけにしてタイトルを潰さない
        nameHidden={compact || (inline && assigneeDim)}
      />
      {task.reviewerId !== null ? (
        <Assignee
          member={memberById(task.reviewerId)}
          reviewer
          dim={reviewerDim}
          nameHidden={compact || (inline && reviewerDim)}
        />
      ) : null}
    </span>
  );
}

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

/**
 * 担当の表示。reviewer を渡すと「R」の印を付け、いまボールを持っているのが
 * レビュー者であることを示す（レビュー待ちのタスク）。
 */
export function Assignee({
  member,
  reviewer = false,
  dim = false,
  nameHidden = false,
}: {
  member: Member | null;
  reviewer?: boolean;
  /** いまボールを持っていない側（作業者・レビュー者を並べて出すときに控えめにする） */
  dim?: boolean;
  /** 幅が狭いところでは名前を省いてアバターだけにする（名前はマウスを乗せると出る） */
  nameHidden?: boolean;
}) {
  if (!member) {
    if (nameHidden) return null;
    return <span className="muted">{reviewer ? 'レビュー者未定' : '未割当'}</span>;
  }
  const label = reviewer ? `レビュー者: ${member.name}` : `作業者: ${member.name}`;
  return (
    <span
      className={`assignee${reviewer ? ' assignee-reviewer' : ''}${dim ? ' assignee-dim' : ''}`}
      title={nameHidden ? label : undefined}
    >
      {reviewer ? (
        <span className="owner-mark" title={nameHidden ? undefined : 'レビュー者'}>
          R
        </span>
      ) : null}
      <span className="avatar" aria-hidden="true">
        {member.name.slice(0, 1)}
      </span>
      {nameHidden ? <span className="sr-only">{label}</span> : <span className="assignee-name">{member.name}</span>}
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

/** レビュー期限。チェック済みなら警告色を出さない */
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
      title="レビュー後に修正が出たらチェック（行の右クリックでも切り替えられます）"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={task.reviewed}
        onChange={() => onToggle(task)}
        aria-label={`${task.title} の${REVIEW_CHECK_LABEL}`}
      />
      <span className="review-check-label">{REVIEW_CHECK_LABEL}</span>
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
