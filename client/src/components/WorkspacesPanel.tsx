import { useState } from 'react';
import type { WorkspaceInfo } from '@shared/types';
import { api, ApiError } from '../api';
import { useStore } from '../store';
import { ConfirmDialog } from './Modal';
import { IconPlus } from './Icons';

/** 設定画面の「データの切り替え」。共有 / 個人など、使うデータを追加・名前変更・一覧から外す。 */
export function WorkspacesPanel() {
  const { workspaces, activeWorkspaceId, canManageWorkspaces, switchWorkspace, refreshWorkspaces, pushToast } =
    useStore();
  const [name, setName] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [asShared, setAsShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [removing, setRemoving] = useState<WorkspaceInfo | null>(null);

  const message = (err: unknown, fallback: string): string => (err instanceof ApiError ? err.message : fallback);

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const created = await api.createWorkspace({
        name: name.trim(),
        ...(dataDir.trim() ? { dataDir: dataDir.trim() } : {}),
        ...(dataDir.trim() && asShared ? { shared: true } : {}),
      });
      await refreshWorkspaces();
      setName('');
      setDataDir('');
      setAsShared(false);
      pushToast('success', `「${created.name}」を追加しました。「切り替え」で使えます。`);
    } catch (err) {
      pushToast('error', message(err, 'データを追加できませんでした。'));
    } finally {
      setBusy(false);
    }
  };

  const saveName = async (id: string) => {
    if (!editName.trim() || busy) return;
    setBusy(true);
    try {
      await api.renameWorkspace(id, editName.trim());
      await refreshWorkspaces();
      setEditingId(null);
    } catch (err) {
      pushToast('error', message(err, '名前を変更できませんでした。'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (target: WorkspaceInfo) => {
    setRemoving(null);
    setBusy(true);
    try {
      await api.deleteWorkspace(target.id);
      await refreshWorkspaces();
      pushToast('success', `「${target.name}」を一覧から外しました。データのファイルは消していません。`);
    } catch (err) {
      pushToast('error', message(err, '一覧から外せませんでした。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" id="workspaces">
      <h2>データの切り替え</h2>
      <p className="note">
        共有（ファイルサーバー）と個人（この PC だけ）など、別々のデータを切り替えて使えます。データはそれぞれ完全に別で、
        タスク・メンバー・タグは混ざりません。切り替えた画面の左上に、いま使っているデータが表示されます。
      </p>

      <ul className="workspace-list">
        {workspaces.map((w) => {
          const active = w.id === activeWorkspaceId;
          return (
            <li key={w.id} className={`workspace-item${active ? ' is-active' : ''}`}>
              <div className="workspace-main">
                {editingId === w.id ? (
                  <span className="inline-form">
                    <input
                      value={editName}
                      autoFocus
                      aria-label="データの名前"
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveName(w.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => void saveName(w.id)} disabled={busy || !editName.trim()}>
                      保存
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setEditingId(null)}>
                      やめる
                    </button>
                  </span>
                ) : (
                  <>
                    <strong className="workspace-name">{w.name}</strong>
                    {active ? <span className="badge workspace-active">使用中</span> : null}
                    <span className="badge">{w.mode === 'shared' ? '共有フォルダ' : 'この PC'}</span>
                  </>
                )}
                <code className="workspace-path">{w.dataDir}</code>
              </div>
              {editingId === w.id ? null : (
                <div className="workspace-actions">
                  {!active ? (
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => switchWorkspace(w.id)}>
                      切り替え
                    </button>
                  ) : null}
                  {canManageWorkspaces ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setEditingId(w.id);
                        setEditName(w.name);
                      }}
                    >
                      名前を変更
                    </button>
                  ) : null}
                  {canManageWorkspaces && !w.primary ? (
                    <button type="button" className="btn btn-sm" onClick={() => setRemoving(w)} disabled={busy}>
                      一覧から外す
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canManageWorkspaces ? (
        <div className="workspace-add">
          <h3>データを追加</h3>
          <div className="field-row">
            <div className="field">
              <label htmlFor="ws-name">名前</label>
              <input id="ws-name" value={name} placeholder="例: 個人" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '3 1 260px' }}>
              <label htmlFor="ws-dir">保存場所（省略できます）</label>
              <input
                id="ws-dir"
                value={dataDir}
                placeholder="空欄ならこの PC の中に自動で作ります。例: \\fileserver\share\task"
                onChange={(e) => setDataDir(e.target.value)}
              />
            </div>
          </div>
          {dataDir.trim() ? (
            <label className="check-line">
              <input type="checkbox" checked={asShared} onChange={(e) => setAsShared(e.target.checked)} />
              共有フォルダとして扱う（Z: などマップしたドライブのとき。\\サーバー名 から始まるパスは自動で共有扱いです）
            </label>
          ) : null}
          <div className="inline-form">
            <button type="button" className="btn btn-primary" onClick={() => void add()} disabled={busy || !name.trim()}>
              <IconPlus />
              追加
            </button>
          </div>
          <p className="note">
            保存場所を空にすると、この PC の中だけに保存されます（ほかの人には見えません）。共有フォルダを指定するときは、
            参加する全員が同じ場所を指定し、読み書きの権限が必要です。追加した一覧はこの PC にだけ保存されます。
          </p>
        </div>
      ) : (
        <p className="note">このサーバーはほかの PC からも使われているため、データの追加や名前の変更はここではできません。</p>
      )}

      {removing ? (
        <ConfirmDialog
          title="一覧から外しますか？"
          message={`「${removing.name}」を一覧から外します。データのファイル（${removing.dataDir}）は消さないので、あとで同じ場所を指定すれば、また使えます。`}
          confirmLabel="一覧から外す"
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </section>
  );
}
