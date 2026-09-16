import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './Icons';

/** Esc キーでの閉じる操作を共通化する */
export function useEscapeKey(enabled: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onEscape]);
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ title, onClose, children, footer, width = 560 }: ModalProps) {
  useEscapeKey(true, onClose);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not(.modal-close)',
    );
    el?.focus();
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        ref={panelRef}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="閉じる">
            <IconClose />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'OK',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      width={420}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-text">{message}</p>
    </Modal>
  );
}
