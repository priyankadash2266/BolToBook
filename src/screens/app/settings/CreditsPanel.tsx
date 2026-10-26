import { api } from '@/data/api';
import { useCredits } from '@/data/hooks';
import { useToast } from '@/components/Toast';
import { useT, useLang } from '@/i18n';

/** Balance, prices and the ledger of what was spent on what. */
export function CreditsPanel() {
  const t = useT('settings');
  const { lang } = useLang();
  const toast = useToast();
  const { balance, prices, ledger } = useCredits();
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="cr">
      <div className="cr-top">
        <div className="cr-balance">
          <span className="cr-coin" aria-hidden="true" />
          <div>
            <div className="cr-n">{balance ?? '—'}</div>
            <div className="cr-label">{t('credits.balance')}</div>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await api.billing.topUp(50, t('credits.addNote')); toast.show(t('credits.added')); }}>{t('credits.add')}</button>
      </div>
      {prices && (
        <div className="cr-prices">
          <div className="cr-h">{t('credits.prices')}</div>
          <ul>
            {(['cover', 'preview', 'export'] as const).map((k) => (
              <li key={k}><span>{t(`credits.${k}`)}</span><strong>{t('credits.each', { n: prices[k] })}</strong></li>
            ))}
          </ul>
        </div>
      )}
      <div className="cr-ledger">
        <div className="cr-h">{t('credits.ledger')}</div>
        {ledger.length === 0 ? <p className="faint">{t('credits.empty')}</p> : (
          <ul>
            {ledger.map((e) => (
              <li key={e.id}>
                <span className={`cr-kind cr-kind-${e.kind}`}>{t(`credits.kinds.${e.kind}`)}</span>
                <span className="cr-note">{e.note}</span>
                <span className="cr-when">{fmt(e.createdAt)}</span>
                <span className={`cr-amt ${e.amount < 0 ? 'is-spent' : 'is-added'}`}>{e.amount > 0 ? `+${e.amount}` : e.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="cr-demo faint">{t('credits.demo')}</p>
    </div>
  );
}
