import { useState } from 'react';
import type { Project } from '@shared/types';
import { useStore } from '../store';
import { Modal } from './Modal';

export const PRESET_COLORS = [
  '#2f6feb',
  '#0f9d58',
  '#d93025',
  '#f29900',
  '#8430ce',
  '#00838f',
  '#c2185b',
  '#5f6368',
];

interface Props {
  project: Project | null;
  onClose: () => void;
}

export function ProjectModal({ project, onClose }: Props) {
  const { createProject, updateProject } = useStore();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? PRESET_COLORS[0]!);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    if (project) {
      await updateProject(project.id, { name: trimmed, description, color });
    } else {
      await createProject({ name: trimmed, description, color });
    }
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      title={project ? 'プロジェクトを編集' : 'プロジェクトを作成'}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={!name.trim() || busy}
          >
            {project ? '保存' : '作成'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="pj-name">プロジェクト名</label>
        <input
          id="pj-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="例: 社内システム刷新"
        />
      </div>
      <div className="field">
        <label htmlFor="pj-desc">説明</label>
        <textarea
          id="pj-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="field-label">色</span>
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
      </div>
    </Modal>
  );
}
