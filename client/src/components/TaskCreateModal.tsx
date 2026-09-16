import { useState } from 'react';
import type { CreateTaskInput, TaskPriority, TaskStatus } from '@shared/types';
import { PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES } from '@shared/types';
import { useStore } from '../store';
import { Modal } from './Modal';
import { TagSelect } from './TagSelect';

interface Props {
  defaultProjectId: number | null;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onCreated?: (taskId: number) => void;
}

export function TaskCreateModal({ defaultProjectId, defaultStatus, onClose, onCreated }: Props) {
  const { projects, members, createTask, includeArchived } = useStore();
  const selectable = projects.filter((p) => includeArchived || !p.archived);
  const [projectId, setProjectId] = useState<number | null>(
    defaultProjectId ?? selectable[0]?.id ?? null,
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const t = title.trim();
    if (!t || projectId === null || busy) return;
    setBusy(true);
    const input: CreateTaskInput = {
      projectId,
      title: t,
      description,
      status,
      priority,
      assigneeId,
      dueDate: dueDate || null,
      tagIds,
    };
    const created = await createTask(input);
    setBusy(false);
    if (created) {
      onCreated?.(created.id);
      onClose();
    }
  };

  return (
    <Modal
      title="タスクを追加"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={!title.trim() || projectId === null || busy}
          >
            作成
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="t-title">タイトル</label>
        <input
          id="t-title"
          value={title}
          placeholder="やることを入力"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          }}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="t-project">プロジェクト</label>
          <select
            id="t-project"
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            {selectable.length === 0 ? <option value="">（なし）</option> : null}
            {selectable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-status">ステータス</label>
          <select
            id="t-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="t-priority">優先度</label>
          <select
            id="t-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-assignee">担当者</label>
          <select
            id="t-assignee"
            value={assigneeId ?? ''}
            onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">未割当</option>
            {members
              .filter((m) => m.active)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-due">期限</label>
          <input
            id="t-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <span className="field-label">タグ</span>
        <TagSelect value={tagIds} onChange={setTagIds} />
      </div>

      <div className="field">
        <label htmlFor="t-desc">説明</label>
        <textarea
          id="t-desc"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
}
