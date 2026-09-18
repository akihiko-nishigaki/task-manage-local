import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Task } from '@shared/types';
import { ApiError, api } from '../api';
import { useStore } from '../store';
import { Assignee, TagList } from '../components/Badges';
import { ConfirmDialog } from '../components/Modal';
import { IconTrash } from '../components/Icons';
import { formatDateTime } from '../utils/date';

/**
 * アーカイブ済みタスクの一覧。ストアの tasks には含まれないため、この画面で個別に取得する。
 * ここからは「元に戻す」（一覧へ復帰）と「削除」（完全削除）だけを行う。
 */
export function ArchiveView() {
  const { projects, members, projectById, memberById, tagById, unarchiveTasks, deleteTask, pushToast } =
    useStore();
  const [items, setItems] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fProject, setFProject] = useState('');
  const [fAssignee, setFAssignee] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [confirmRestoreAll, setConfirmRestoreAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.listTasks({ archivedOnly: true, includeDone: true });
      // 新しくアーカイブしたものを上に
      list.sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '') || b.id - a.id);
      setItems(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'アーカイブの読み込みに失敗しました。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    return items.filter((t) => {
      if (fProject && t.projectId !== Number(fProject)) return false;
      if (fAssignee === 'none' && t.assigneeId !== null) return false;
      if (fAssignee && fAssignee !== 'none' && t.assigneeId !== Number(fAssignee)) return false;
      if (needle && !t.title.toLowerCase().includes(needle) && !t.description.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [items, fProject, fAssignee, q]);

  const restore = async (ids: number[]) => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    const restored = await unarchiveTasks(ids);
    setBusy(false);
    if (restored) {
      const done = new Set(restored.map((t) => t.id));
      setItems((prev) => (prev ? prev.filter((t) => !done.has(t.id)) : prev));
    }
  };

  const remove = async (task: Task) => {
    setBusy(true);
    await deleteTask(task.id);
    setBusy(false);
    setItems((prev) => (prev ? prev.filter((t) => t.id !== task.id) : prev));
  };

  const hasFilter = fProject || fAssignee || q.trim();

  return (
    <div className="list-view archive-view">
      <p className="note archive-note">
        アーカイブしたタスクは削除されず、ここに保管されます。「元に戻す」で通常の一覧に復帰します（完了のまま）。
        完了以外のステータスに変更した場合も自動的に一覧へ戻ります。
      </p>

      <div className="filter-bar">
        <select value={fProject} onChange={(e) => setFProject(e.target.value)} aria-label="プロジェクトで絞り込み">
          <option value="">プロジェクト: すべて</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.archived ? '（アーカイブ済み）' : ''}
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
        <input
          type="search"
          className="filter-search"
          value={q}
          placeholder="タイトル・説明で検索"
          aria-label="アーカイブを検索"
          onChange={(e) => setQ(e.target.value)}
        />
        {hasFilter ? (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setFProject('');
              setFAssignee('');
              setQ('');
            }}
          >
            絞り込みを解除
          </button>
        ) : null}
        <span className="filter-count">
          {filtered.length} 件{items && hasFilter ? ` / 全 ${items.length} 件` : ''}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy || filtered.length === 0}
          onClick={() => setConfirmRestoreAll(true)}
        >
          表示中をすべて元に戻す
        </button>
      </div>

      {error ? (
        <div className="empty-state error-state">
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            再読み込み
          </button>
        </div>
      ) : items === null ? (
        <p className="empty-state">読み込み中…</p>
      ) : filtered.length === 0 ? (
        <p className="empty-state">
          {items.length === 0
            ? 'アーカイブされたタスクはありません。カンバンの完了列や画面上部の「完了をアーカイブ」から追加できます。'
            : '条件に合うタスクがありません。'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="task-table archive-table">
            <thead>
              <tr>
                <th>タイトル</th>
                <th>プロジェクト</th>
                <th>担当</th>
                <th>タグ</th>
                <th>完了日時</th>
                <th>アーカイブ日時</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const project = projectById(t.projectId);
                return (
                  <tr key={t.id} className="row-done archive-row">
                    <td className="cell-title">
                      {t.title}
                      {t.description ? <span className="cell-desc">{t.description}</span> : null}
                    </td>
                    <td>
                      {project ? (
                        <span className="task-card-project">
                          <span className="color-dot" style={{ background: project.color }} />
                          {project.name}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <Assignee member={memberById(t.assigneeId)} />
                    </td>
                    <td>
                      <TagList
                        tags={t.tagIds
                          .map((id) => tagById(id))
                          .filter((x): x is NonNullable<typeof x> => x !== null)}
                      />
                    </td>
                    <td className="cell-time">{formatDateTime(t.completedAt)}</td>
                    <td className="cell-time">{formatDateTime(t.archivedAt)}</td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => void restore([t.id])}
                      >
                        元に戻す
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        disabled={busy}
                        aria-label={`${t.title} を削除`}
                        title="完全に削除"
                        onClick={() => setToDelete(t)}
                      >
                        <IconTrash width={15} height={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toDelete ? (
        <ConfirmDialog
          title="タスクを削除"
          message={`「${toDelete.title}」をコメントごと完全に削除します。元に戻せません。`}
          confirmLabel="削除"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const t = toDelete;
            setToDelete(null);
            void remove(t);
          }}
        />
      ) : null}

      {confirmRestoreAll ? (
        <ConfirmDialog
          title="アーカイブを解除"
          message={`表示中の ${filtered.length} 件を通常の一覧に戻します。よろしいですか？`}
          confirmLabel="元に戻す"
          onCancel={() => setConfirmRestoreAll(false)}
          onConfirm={() => {
            setConfirmRestoreAll(false);
            if (filtered.length === 0) {
              pushToast('info', '対象がありません。');
              return;
            }
            void restore(filtered.map((t) => t.id));
          }}
        />
      ) : null}
    </div>
  );
}
