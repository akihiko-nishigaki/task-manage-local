import { useState } from 'react';
import type { Tag } from '@shared/types';
import { useStore } from '../store';
import { ConfirmDialog } from '../components/Modal';
import { PRESET_COLORS } from '../components/ProjectModal';
import { IconPlus, IconTrash } from '../components/Icons';

export function TagsView() {
  const { tags, tasks, createTag, updateTag, deleteTag } = useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]!);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [toDelete, setToDelete] = useState<Tag | null>(null);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setName('');
    await createTag({ name: n, color });
  };

  const commitRename = async (t: Tag) => {
    const n = editName.trim();
    setEditingId(null);
    if (n && n !== t.name) await updateTag(t.id, { name: n });
  };

  return (
    <div className="admin-view">
      <section className="panel">
        <h2>タグを追加</h2>
        <div className="inline-form">
          <input
            value={name}
            placeholder="タグ名"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            aria-label="タグ名"
          />
          <div className="color-picker">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch${c === color ? ' selected' : ''}`}
                style={{ background: c }}
                aria-label={`色 ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={add} disabled={!name.trim()}>
            <IconPlus />
            追加
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>タグ一覧（{tags.length}）</h2>
        {tags.length === 0 ? (
          <p className="empty-state">タグが登録されていません。</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>タグ</th>
                <th>色</th>
                <th>使用数</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id}>
                  <td>
                    {editingId === t.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => void commitRename(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename(t);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        aria-label="タグ名を編集"
                      />
                    ) : (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => {
                          setEditingId(t.id);
                          setEditName(t.name);
                        }}
                      >
                        <span className="color-dot" style={{ background: t.color }} />
                        {t.name}
                      </button>
                    )}
                  </td>
                  <td>
                    <div className="color-picker">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`color-swatch${c === t.color ? ' selected' : ''}`}
                          style={{ background: c }}
                          aria-label={`${t.name} の色を ${c} にする`}
                          onClick={() => void updateTag(t.id, { color: c })}
                        />
                      ))}
                    </div>
                  </td>
                  <td>{tasks.filter((x) => x.tagIds.includes(t.id)).length} 件</td>
                  <td className="cell-actions">
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={`${t.name} を削除`}
                      onClick={() => setToDelete(t)}
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {toDelete ? (
        <ConfirmDialog
          title="タグを削除"
          message={`「${toDelete.name}」を削除します。タスクからも外れます。`}
          confirmLabel="削除"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const t = toDelete;
            setToDelete(null);
            void deleteTag(t.id);
          }}
        />
      ) : null}
    </div>
  );
}
