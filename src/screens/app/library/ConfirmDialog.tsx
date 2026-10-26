import { useState, type ReactNode } from 'react';
import { Modal } from '@/components/Modal';
import { useT } from '@/i18n';

interface Props {
  open: boolean;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  /** When set, the author has to type this exact text before confirming. */
  typeToConfirm?: string;
  typeLabel?: string;
  danger?: boolean;
}

/** A plain yes/no dialog, optionally asking the author to type a word to confirm. */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose, typeToConfirm, typeLabel, danger = true }: Props) {
  const c = useT('common');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = !typeToConfirm || typed.trim() === typeToConfirm.trim();
  const close = () => { setTyped(''); setBusy(false); onClose(); };
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try { await onConfirm(); } finally { setTyped(''); setBusy(false); }
  };
  return (
    <Modal open={open} onClose={close} title={title} width={520} ariaLabel={typeof title === 'string' ? title : undefined}>
      <div style={{ padding: '12px 22px 22px' }}>
        <p className="muted" style={{ lineHeight: 1.6 }}>{body}</p>
        {typeToConfirm && (
          <label className="field" style={{ marginTop: 16 }}>
            <span>{typeLabel}</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={typeToConfirm} data-autofocus
              onKeyDown={(e) => { if (e.key === 'Enter') go(); }} autoComplete="off" spellCheck={false} />
          </label>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-quiet" onClick={close}>{c('actions.cancel')}</button>
          <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={go} disabled={!ok || busy} data-autofocus={!typeToConfirm || undefined}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
