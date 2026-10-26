import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
  ariaLabel?: string;
}

/** A sheet of paper over the desk. On phones it becomes a bottom sheet with a grab handle. */
export function Modal({ open, onClose, title, children, width = 620, ariaLabel }: Props) {
  const t = useT('common');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], textarea, input, button:not(.modal-close)')
        ?? ref.current?.querySelector<HTMLElement>('button');
      el?.focus();
    }, 30);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="modal rise" role="dialog" aria-modal="true" aria-label={ariaLabel} style={{ maxWidth: width }}>
        <span className="modal-grab" aria-hidden="true" />
        {title && (
          <div className="modal-head">
            <div className="modal-title">{title}</div>
            <button type="button" className="modal-close" onClick={onClose} aria-label={t('actions.close')}><Icon name="x" size={18} /></button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
