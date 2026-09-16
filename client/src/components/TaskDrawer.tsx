import { useCallback, useEffect, useState } from 'react';
import type { Comment, TaskPriority, TaskStatus } from '@shared/types';
import { PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES } from '@shared/types';
import { useStore } from '../store';
import { ConfirmDialog, useEscapeKey } from './Modal';
import { TagSelect } from './TagSelect';
import { IconClose, IconTrash } from './Icons';
import { formatDateTime } from '../utils/date';

interface Props {
  taskId: number;
  onClose: () => void;
}

export function TaskDrawer({ taskId, onClose }: Props) {
  const {
    tasks,
    projects,
    members,
    currentUserId,
    currentUser,
    updateTask,
    deleteTask,
    loadTaskDetail,
    addComment,
    deleteComment,
    pushToast,
  } = useStore();

  const task = tasks.find((t) => t.id === taskId) ?? null;
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);

  const close = useCallback(() => onClose(), [onClose]);
  useEscapeKey(!confirmDelete, close);

  useEffect(() => {
    setTitleDraft(task?.title ?? '');
    setDescDraft(task?.description ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingComments(true);
    void loadTaskDetail(taskId).then((detail) => {
      if (cancelled) return;
      setComments(detail?.comments ?? []);
      setLoadingComments(false);
      if (detail) {
        setTitleDraft((prev) => (prev ? prev : detail.title));
        setDescDraft((prev) => (prev ? prev : detail.description));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, loadTaskDetail]);

  if (!task) {
    return (
      <>
        <div className="drawer-scrim" onMouseDown={close} />
        <aside className="drawer" role="dialog" aria-modal="true" aria-label="タスク詳細">
          <div className="drawer-head">
            <span className="muted">タスクが見つかりません</span>
            <button type="button" className="icon-btn" onClick={close} aria-label="閉じる">
              <IconClose />
            </button>
          </div>
        </aside>
      </>
    );
  }

  const project = projects.find((p) => p.id === task.projectId) ?? null;

  const commitTitle = () => {
    const t = titleDraft.trim();
    if (!t) {
      setTitleDraft(task.title);
      return;
    }
    if (t !== task.title) void updateTask(task.id, { title: t });
  };

  const commitDesc = () => {
    if (descDraft !== task.description) void updateTask(task.id, { description: descDraft });
  };

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body) return;
    if (currentUserId === null) {
      pushToast('info', '左サイドバーで「現在のユーザー」を選択してください。');
      return;
    }
    const created = await addComment(task.id, { body, authorId: currentUserId });
    if (created) {
      setComments((prev) => [
        ...prev,
        {
          ...created,
          authorName: created.authorName ?? currentUser?.name ?? null,
        },
      ]);
      setCommentBody('');
    }
  };

  const removeComment = async (id: number) => {
    const before = comments;
    setComments((prev) => prev.filter((c) => c.id !== id));
    await deleteComment(id);
    // 失敗時はストア側でトーストを出すので、ここでは復元のみ試みる
    void loadTaskDetail(task.id).then((d) => {
      if (d) setComments(d.comments);
      else setComments(before);
    });
  };

  return (
    <>
      <div className="drawer-scrim" onMouseDown={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="タスク詳細">
        <div className="drawer-head">
          <span className="drawer-project">
            {project ? (
              <>
                <span className="color-dot" style={{ background: project.color }} />
                {project.name}
              </>
            ) : (
              '—'
            )}
          </span>
          <div className="drawer-head-actions">
            <button
              type="button"
              className="icon-btn danger"
              onClick={() => setConfirmDelete(true)}
              aria-label="タスクを削除"
              title="タスクを削除"
            >
              <IconTrash />
            </button>
            <button type="button" className="icon-btn" onClick={close} aria-label="閉じる">
              <IconClose />
            </button>
          </div>
        </div>

        <div className="drawer-body">
          <textarea
            className="drawer-title"
            value={titleDraft}
            rows={1}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            aria-label="タイトル"
          />

          <div className="drawer-grid">
            <label htmlFor="d-status">ステータス</label>
            <select
              id="d-status"
              value={task.status}
              onChange={(e) => void updateTask(task.id, { status: e.target.value as TaskStatus })}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <label htmlFor="d-priority">優先度</label>
            <select
              id="d-priority"
              value={task.priority}
              onChange={(e) =>
                void updateTask(task.id, { priority: e.target.value as TaskPriority })
              }
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>

            <label htmlFor="d-assignee">担当者</label>
            <select
              id="d-assignee"
              value={task.assigneeId ?? ''}
              onChange={(e) =>
                void updateTask(task.id, {
                  assigneeId: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">未割当</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.active ? '' : '（無効）'}
                </option>
              ))}
            </select>

            <label htmlFor="d-due">期限</label>
            <input
              id="d-due"
              type="date"
              value={task.dueDate ?? ''}
              onChange={(e) => void updateTask(task.id, { dueDate: e.target.value || null })}
            />

            <label htmlFor="d-project">プロジェクト</label>
            <select
              id="d-project"
              value={task.projectId}
              onChange={(e) => void updateTask(task.id, { projectId: Number(e.target.value) })}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived ? '（アーカイブ）' : ''}
                </option>
              ))}
            </select>

            <span className="grid-label">タグ</span>
            <TagSelect
              value={task.tagIds}
              onChange={(next) => void updateTask(task.id, { tagIds: next })}
            />
          </div>

          <section className="drawer-section">
            <h3>説明</h3>
            <textarea
              className="drawer-desc"
              rows={5}
              value={descDraft}
              placeholder="説明を入力（フォーカスを外すと保存されます）"
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={commitDesc}
              aria-label="説明"
            />
          </section>

          <section className="drawer-section">
            <h3>コメント（{comments.length}）</h3>
            {loadingComments ? (
              <p className="muted">読み込み中…</p>
            ) : comments.length === 0 ? (
              <p className="muted">コメントはまだありません。</p>
            ) : (
              <ul className="comment-list">
                {comments.map((c) => (
                  <li key={c.id} className="comment">
                    <div className="comment-head">
                      <span className="avatar" aria-hidden="true">
                        {(c.authorName ?? '?').slice(0, 1)}
                      </span>
                      <span className="comment-author">{c.authorName ?? '不明'}</span>
                      <span className="comment-time">{formatDateTime(c.createdAt)}</span>
                      <button
                        type="button"
                        className="icon-btn danger comment-del"
                        onClick={() => void removeComment(c.id)}
                        aria-label="コメントを削除"
                      >
                        <IconTrash width={14} height={14} />
                      </button>
                    </div>
                    <p className="comment-body">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}

            <div className="comment-form">
              <textarea
                rows={2}
                value={commentBody}
                placeholder={
                  currentUserId === null
                    ? '現在のユーザーを選択するとコメントできます'
                    : 'コメントを入力（Ctrl+Enter で送信）'
                }
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submitComment();
                }}
                aria-label="コメント本文"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitComment}
                disabled={!commentBody.trim()}
              >
                コメント
              </button>
            </div>
          </section>

          <dl className="timestamps">
            <div>
              <dt>作成</dt>
              <dd>{formatDateTime(task.createdAt)}</dd>
            </div>
            <div>
              <dt>更新</dt>
              <dd>{formatDateTime(task.updatedAt)}</dd>
            </div>
            {task.completedAt ? (
              <div>
                <dt>完了</dt>
                <dd>{formatDateTime(task.completedAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </aside>

      {confirmDelete ? (
        <ConfirmDialog
          title="タスクを削除"
          message={`「${task.title}」を削除します。元に戻せません。`}
          confirmLabel="削除"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteTask(task.id);
            close();
          }}
        />
      ) : null}
    </>
  );
}
