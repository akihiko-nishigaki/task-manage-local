import { useState } from 'react';
import { useStore } from '../store';
import { TagChip } from './Badges';
import { IconPlus } from './Icons';

interface Props {
  value: number[];
  onChange: (next: number[]) => void;
}

export function TagSelect({ value, onChange }: Props) {
  const { tags } = useStore();
  const [open, setOpen] = useState(false);
  const selected = tags.filter((t) => value.includes(t.id));
  const available = tags.filter((t) => !value.includes(t.id));

  return (
    <div className="tag-select">
      <div className="tag-select-chips">
        {selected.map((t) => (
          <TagChip key={t.id} tag={t} onRemove={() => onChange(value.filter((id) => id !== t.id))} />
        ))}
        {selected.length === 0 ? <span className="muted">タグなし</span> : null}
        <button
          type="button"
          className="chip-add"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <IconPlus width={12} height={12} />
          タグ
        </button>
      </div>
      {open ? (
        <div className="tag-picker">
          {available.length === 0 ? (
            <p className="empty-hint">選択できるタグがありません</p>
          ) : (
            available.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tag-picker-item"
                onClick={() => {
                  onChange([...value, t.id]);
                  setOpen(false);
                }}
              >
                <span className="color-dot" style={{ background: t.color }} />
                {t.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
