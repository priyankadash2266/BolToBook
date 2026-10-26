/**
 * Paid work always asks first: "Make 4 previews?" (what, cost, balance after, time) and a lighter
 * "Export a PDF?" (file type and cost). Nothing is charged until the author confirms.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { Icon } from '@/components/Icon';
import { useCost } from '@/components/credits';
import { useLang, useT } from '@/i18n';
import { fmtNumber } from '@/lib/format';
import { Sheet, useVariantNames } from './Chooser';
import { exportKindOf } from './useExport';
import type { SizeId, StyleId, Variant } from './variants';

export interface MakeItem { size: SizeId; style: StyleId }

/** A rough time for laying out `n` previews of a book of `words` words (seconds). */
export function estimateSeconds(n: number, words: number) {
  const each = Math.max(3, Math.round(2 + words / 900));
  return n * each;
}

function useDuration() {
  const t = useT('finish');
  const { lang } = useLang();
  return (secs: number) => {
    if (secs < 60) return t('pv2.c.secs', { n: fmtNumber(Math.max(5, Math.ceil(secs / 5) * 5), lang) });
    const m = Math.round(secs / 60);
    return m <= 1 ? t('pv2.c.min1') : t('pv2.c.mins', { n: fmtNumber(m, lang) });
  };
}

export function MakeConfirm({ open, items, skipped, words, onCancel, onConfirm }: {
  open: boolean;
  items: MakeItem[];
  /** Already made and unchanged: shown, not charged. */
  skipped: MakeItem[];
  words: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT('finish');
  const tc = useT('common');
  const { lang } = useLang();
  const { label } = useVariantNames();
  const n = items.length;
  const { cost, enough, balance } = useCost('preview', Math.max(1, n));
  const dur = useDuration();
  const after = cost !== undefined && balance !== undefined ? balance - cost : undefined;
  const title = t(n === 1 ? 'pv2.c.title1' : 'pv2.c.titleN', { n: fmtNumber(n, lang) });
  const go = t(n === 1 ? 'pv.make1' : 'pv.makeN', { n: fmtNumber(n, lang) });
  return (
    <Modal open={open} onClose={onCancel} title={title} width={520}>
      <div className="gn-cf">
        <section className="gn-cf-sec" aria-labelledby="gn-cf-what">
          <h3 id="gn-cf-what" className="gn-rail-kick">{t('pv2.c.what')}</h3>
          <ul className="gn-cf-list">
            {items.map((it) => (
              <li key={`${it.size}|${it.style}`}><span className="gn-cf-art"><Sheet size={it.size} h={22} /></span><span>{label(it.size, it.style)}</span></li>
            ))}
            {skipped.map((it) => (
              <li key={`s-${it.size}|${it.style}`} className="is-skip">
                <span className="gn-cf-art"><Sheet size={it.size} h={22} /></span>
                <span>{label(it.size, it.style)}<span className="gn-cf-skip">{t('pv2.c.skipped')}</span></span>
              </li>
            ))}
          </ul>
        </section>

        <dl className="gn-cf-facts">
          <div><dt>{t('pv2.c.cost')}</dt><dd>{cost !== undefined ? tc('credits.cost', { n: fmtNumber(cost, lang) }) : '…'}</dd></div>
          <div><dt>{t('pv2.c.after')}</dt><dd className={!enough ? 'is-short' : ''}>{after !== undefined ? tc('credits.cost', { n: fmtNumber(after, lang) }) : '…'}</dd></div>
          <div><dt>{t('pv2.c.time')}</dt><dd>{t('pv2.c.about', { t: dur(estimateSeconds(n, words)) })}</dd></div>
        </dl>

        <p className="gn-cf-note"><Icon name="bookmark" size={15} />{t('pv2.c.kept')}</p>
        {!enough && (
          <p className="gn-cf-short" role="alert">
            {t('pv2.c.short', { n: fmtNumber(Math.max(0, -(after ?? 0)), lang) })}{' '}
            <Link to="/app/settings#credits">{t('pv2.c.topUp')}</Link>
          </p>
        )}

        <div className="gn-cf-act">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('pv2.c.cancel')}</button>
          <button type="button" className="btn btn-primary paid-btn gn-cf-go" onClick={onConfirm} disabled={!enough || n === 0} data-autofocus>
            <Icon name="file" size={16} /><span>{go}</span>
            {cost !== undefined && <span className="paid-cost">{tc('credits.cost', { n: fmtNumber(cost, lang) })}</span>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ExportConfirm({ v, onCancel, onConfirm }: { v: Variant | null; onCancel: () => void; onConfirm: (v: Variant) => void }) {
  const t = useT('finish');
  const tc = useT('common');
  const { lang } = useLang();
  const { label } = useVariantNames();
  const { cost, enough, balance } = useCost('export', 1);
  const kind = v ? exportKindOf(v) : 'pdf';
  const after = cost !== undefined && balance !== undefined ? balance - cost : undefined;
  return (
    <Modal open={!!v} onClose={onCancel} title={t(kind === 'pdf' ? 'pv2.x.titlePdf' : 'pv2.x.titleEpub')} width={460}>
      {v && (
        <div className="gn-cf">
          <div className="gn-cf-file">
            <span className="gn-cf-art"><Sheet size={v.size} h={34} /></span>
            <div className="gn-cf-file-text">
              <strong>{t(kind === 'pdf' ? 'pv2.x.pdf' : 'pv2.x.epub')}</strong>
              <span>{label(v.size, v.style)} · {t('pv.metaNo', { n: v.n })}</span>
            </div>
          </div>
          <dl className="gn-cf-facts is-two">
            <div><dt>{t('pv2.c.cost')}</dt><dd>{cost !== undefined ? tc('credits.cost', { n: fmtNumber(cost, lang) }) : '…'}</dd></div>
            <div><dt>{t('pv2.c.after')}</dt><dd className={!enough ? 'is-short' : ''}>{after !== undefined ? tc('credits.cost', { n: fmtNumber(after, lang) }) : '…'}</dd></div>
          </dl>
          <p className="gn-cf-note"><Icon name="download" size={15} />{t(kind === 'pdf' ? 'pv2.x.notePdf' : 'pv2.x.noteEpub')}</p>
          {!enough && <p className="gn-cf-short" role="alert">{tc('credits.needMore')} <Link to="/app/settings#credits">{t('pv2.c.topUp')}</Link></p>}
          <div className="gn-cf-act">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('pv2.c.cancel')}</button>
            <button type="button" className="btn btn-primary paid-btn gn-cf-go" onClick={() => onConfirm(v)} disabled={!enough} data-autofocus>
              <Icon name="download" size={16} /><span>{t(kind === 'pdf' ? 'pv.exportPdf' : 'pv.exportEpub')}</span>
              {cost !== undefined && <span className="paid-cost">{tc('credits.cost', { n: fmtNumber(cost, lang) })}</span>}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Export with a confirmation first. Returns the trigger, the modal, and which preview is exporting. */
export function useConfirmedExport(run: (v: Variant) => Promise<unknown>) {
  const [asking, setAsking] = useState<Variant | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = async (v: Variant) => {
    setAsking(null);
    setBusy(v.id);
    try { await run(v); } finally { setBusy(null); }
  };
  return {
    ask: (v: Variant) => setAsking(v),
    busy,
    modal: <ExportConfirm v={asking} onCancel={() => setAsking(null)} onConfirm={confirm} />,
  };
}
