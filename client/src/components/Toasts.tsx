import { useStore } from '../store';
import { IconClose } from './Icons';

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-msg">{t.message}</span>
          <button
            type="button"
            className="icon-btn toast-close"
            onClick={() => dismissToast(t.id)}
            aria-label="閉じる"
          >
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  );
}
