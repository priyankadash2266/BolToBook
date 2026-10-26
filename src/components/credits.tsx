/**
 * Credits UI shared by every paid action (cover generation, previews, exports).
 *  - <CreditsChip/>  balance in the header, links to Settings › Credits
 *  - <PaidButton/>   a button that shows its cost, disables while working, and refuses politely when short
 *  - useCharge()     spend credits for a piece of work; returns false (with a toast) when the balance is too low
 */
import { useState, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/data/api';
import { useCredits } from '@/data/hooks';
import { useT } from '@/i18n';
import { Icon } from './Icon';
import { useToast } from './Toast';
import './credits.css';

type Kind = 'cover' | 'preview' | 'export';

export function CreditsChip() {
  const t = useT('common');
  const { balance } = useCredits();
  if (balance === undefined) return null;
  return (
    <Link to="/app/settings#credits" className="credits-chip" title={t('credits.balanceTitle')}>
      <span className="credits-coin" aria-hidden="true" />
      <span className="credits-n">{balance}</span>
      <span className="credits-label">{t('credits.short')}</span>
    </Link>
  );
}

export function useCharge() {
  const t = useT('common');
  const toast = useToast();
  return async (input: { kind: Kind; units?: number; bookId?: string; note: string; ref?: string }): Promise<boolean> => {
    try {
      await api.billing.charge(input);
      return true;
    } catch (e) {
      if (e instanceof Error && e.message === 'insufficient-credits') toast.show(t('credits.short_balance'));
      else toast.show(t('credits.failed'));
      return false;
    }
  };
}

/** Cost label for `units` of `kind`, e.g. "10 credits". */
export function useCost(kind: Kind, units = 1) {
  const { prices, balance } = useCredits();
  const cost = prices ? prices[kind] * Math.max(1, units) : undefined;
  return { cost, enough: cost === undefined || balance === undefined ? true : balance >= cost, balance };
}

/**
 * A button for paid work. Shows "Label · 10 credits", disables itself (with a spinner and `busyLabel`)
 * while `onRun` is in flight, and is disabled when the balance can't cover it.
 * `onRun` does the work AND the charging (call useCharge inside), so the charge happens only once the work can start.
 */
export function PaidButton({ kind, units = 1, label, busyLabel, onRun, disabled, className = 'btn btn-primary', icon }: {
  kind: Kind;
  units?: number;
  label: ReactNode;
  busyLabel: ReactNode;
  onRun: () => Promise<unknown>;
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
}) {
  const t = useT('common');
  const { cost, enough } = useCost(kind, units);
  const [busy, setBusy] = useState(false);
  const locked=useRef(false);const toast=useToast();
  const run = async () => {
    if (locked.current) return;
    locked.current=true;setBusy(true);
    try { await onRun(); } catch{toast.show(t('credits.failed'));} finally { locked.current=false;setBusy(false); }
  };
  return (
    <span className="paid">
      <button type="button" className={`${className} paid-btn${busy ? ' is-busy' : ''}`} onClick={run} disabled={busy || disabled || !enough} aria-busy={busy}>
        {busy ? <span className="paid-spin" aria-hidden="true" /> : icon}
        <span>{busy ? busyLabel : label}</span>
        {!busy && cost !== undefined && <span className="paid-cost">{t('credits.cost', { n: cost })}</span>}
      </button>
      {!enough && !busy && <Link to="/app/settings#credits" className="paid-short"><Icon name="flag" size={13} />{t('credits.needMore')}</Link>}
    </span>
  );
}
