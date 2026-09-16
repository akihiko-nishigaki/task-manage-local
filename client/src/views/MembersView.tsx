import { useState } from 'react';
import type { Member } from '@shared/types';
import { useStore } from '../store';
import { ConfirmDialog } from '../components/Modal';
import { IconPlus, IconTrash } from '../components/Icons';
import { formatDateTime } from '../utils/date';

export function MembersView() {
  const { members, tasks, createMember, updateMember, deleteMember } = useStore();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [toDelete, setToDelete] = useState<Member | null>(null);

  const add = async () => {
    const n = newName.trim();
    if (!n) return;
    setNewName('');
    await createMember(n);
  };

  const commitRename = async (m: Member) => {
    const n = editName.trim();
    setEditingId(null);
    if (n && n !== m.name) await updateMember(m.id, { name: n });
  };

  return (
    <div className="admin-view">
      <section className="panel">
        <h2>メンバーを追加</h2>
        <div className="inline-form">
          <input
            value={newName}
            placeholder="名前"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            aria-label="メンバー名"
          />
          <button type="button" className="btn btn-primary" onClick={add} disabled={!newName.trim()}>
            <IconPlus />
            追加
          </button>
        </div>
        <p className="note">ログイン機能はありません。社内 LAN での利用を前提とした名前のみの管理です。</p>
      </section>

      <section className="panel">
        <h2>メンバー一覧（{members.length}）</h2>
        {members.length === 0 ? (
          <p className="empty-state">メンバーが登録されていません。</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>担当タスク</th>
                <th>状態</th>
                <th>登録日</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const count = tasks.filter((t) => t.assigneeId === m.id && t.status !== 'done').length;
                return (
                  <tr key={m.id} className={m.active ? '' : 'row-muted'}>
                    <td>
                      {editingId === m.id ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => void commitRename(m)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename(m);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          aria-label="名前を編集"
                        />
                      ) : (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setEditingId(m.id);
                            setEditName(m.name);
                          }}
                        >
                          <span className="avatar">{m.name.slice(0, 1)}</span>
                          {m.name}
                        </button>
                      )}
                    </td>
                    <td>{count} 件</td>
                    <td>
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={m.active}
                          onChange={(e) => void updateMember(m.id, { active: e.target.checked })}
                        />
                        有効
                      </label>
                    </td>
                    <td className="muted">{formatDateTime(m.createdAt)}</td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`${m.name} を削除`}
                        onClick={() => setToDelete(m)}
                      >
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {toDelete ? (
        <ConfirmDialog
          title="メンバーを削除"
          message={`「${toDelete.name}」を削除します。担当していたタスクは「未割当」になります。`}
          confirmLabel="削除"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const m = toDelete;
            setToDelete(null);
            void deleteMember(m.id);
          }}
        />
      ) : null}
    </div>
  );
}
