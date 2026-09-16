import { useRef, useState } from 'react';
import type { ExportData } from '@shared/types';
import { useStore } from '../store';
import { ConfirmDialog } from '../components/Modal';
import { IconDownload, IconLock, IconUpload } from '../components/Icons';

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function SettingsView() {
  const { exportData, importData, pushToast, members, projects, tags, tasks } = useStore();
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  const [pending, setPending] = useState<{ data: ExportData; fileName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setBusy(true);
    const data = await exportData();
    setBusy(false);
    if (!data) return;
    // Blob URL 経由でローカル保存するだけ。外部へは送信しない。
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskmanage-export-${timestamp()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast('success', 'エクスポートしました（ローカル保存のみ）。');
  };

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ExportData;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
        pushToast('error', 'エクスポート形式の JSON ではありません。');
        return;
      }
      setPending({ data: parsed, fileName: file.name });
    } catch {
      pushToast('error', 'JSON を読み取れませんでした。');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="admin-view">
      <section className="panel notice">
        <h2>
          <IconLock /> 社外送信ゼロ
        </h2>
        <p>
          このアプリは外部のサーバー・CDN・フォント・解析サービスへ一切アクセスしません。データは
          このパソコン（またはサーバー機）上の SQLite ファイルにのみ保存され、
          エクスポートもブラウザ内でファイルを生成してローカルに保存するだけです。
        </p>
      </section>

      <section className="panel">
        <h2>現在のデータ</h2>
        <ul className="stat-list">
          <li>
            <span className="stat-num">{projects.length}</span>プロジェクト
          </li>
          <li>
            <span className="stat-num">{tasks.length}</span>タスク
          </li>
          <li>
            <span className="stat-num">{members.length}</span>メンバー
          </li>
          <li>
            <span className="stat-num">{tags.length}</span>タグ
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>エクスポート</h2>
        <p className="note">全データを JSON ファイルとしてダウンロードします（バックアップ用）。</p>
        <button type="button" className="btn btn-primary" onClick={doExport} disabled={busy}>
          <IconDownload />
          JSON をダウンロード
        </button>
      </section>

      <section className="panel">
        <h2>インポート</h2>
        <fieldset className="radio-group">
          <legend>取り込み方法</legend>
          <label className="check-line">
            <input
              type="radio"
              name="import-mode"
              checked={mode === 'merge'}
              onChange={() => setMode('merge')}
            />
            マージ（既存データに追加）
          </label>
          <label className="check-line">
            <input
              type="radio"
              name="import-mode"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            />
            置換（既存データをすべて削除してから取り込む）
          </label>
        </fieldset>
        <label className="btn file-btn">
          <IconUpload />
          JSON ファイルを選択
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>
      </section>

      {pending ? (
        <ConfirmDialog
          title="インポートの確認"
          message={
            mode === 'replace'
              ? `「${pending.fileName}」で既存データをすべて置き換えます。現在のデータは失われます。よろしいですか？`
              : `「${pending.fileName}」の内容を既存データにマージします。よろしいですか？`
          }
          confirmLabel="インポート"
          danger={mode === 'replace'}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const p = pending;
            setPending(null);
            void importData(mode, p.data);
          }}
        />
      ) : null}
    </div>
  );
}
