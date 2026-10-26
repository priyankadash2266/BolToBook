import { useEffect, useRef, useState } from 'react';
import type { Book } from '@/data/types';
import { useLang, useT } from '@/i18n';
import { Icon } from '@/components/Icon';
import { EmptyState } from '@/components/bits';
import { useCost } from '@/components/credits';
import { fmtDate, fmtNumber } from '@/lib/format';
import { isDevanagari } from '@/lib/text';
import { DesignedCover } from './DesignedCover';
import { SIZE_SHAPE, type SizeId, type Staleness, type Variant } from './variants';
import { Sheet, useVariantNames } from './Chooser';
import { exportKindOf } from './useExport';
import type { JobItem, PreviewJob } from './previewJobs';

interface Props {
  book: Book;
  variants: Variant[];
  staleOf: (v: Variant) => Staleness;
  job?: PreviewJob;
  onOpen: (v: Variant) => void;
  onDelete: (v: Variant) => void;
  onRevert: (v: Variant) => void;
  /** Asks to export (a confirmation opens). */
  onExport: (v: Variant) => void;
  exporting: string | null;
  compare: string[];
  onCompare: (ids: string[]) => void;
  onDismissJob: () => void;
  /** Go to "Design your book". */
  onDesign: () => void;
}

/** Cover art height on a card. */
const ART_H = 156;
const artW = (size: SizeId, h = ART_H) => Math.round((SIZE_SHAPE[size].w / SIZE_SHAPE[size].h) * h);

/** "Your previews": what the author has, newest first, with work in progress at the front. */
export function Shelf({ book, variants, staleOf, job, onOpen, onDelete, onRevert, onExport, exporting, compare, onCompare, onDismissJob, onDesign }: Props) {
  const t = useT('finish');
  const { lang } = useLang();
  const picking = compare.length > 0;
  const pick = (id: string) => onCompare(compare.includes(id) ? compare.filter((x) => x !== id) : [...compare, id].slice(-2));
  const have = new Set(variants.map((v) => v.id));
  const pending = (job?.items ?? []).filter((it) => it.status !== 'done' || !it.variantId || !have.has(it.variantId));
  const done = job ? job.items.filter((i) => i.status === 'done').length : 0;
  const pct = job ? Math.round((job.items.reduce((s, i) => s + (i.status === 'queued' ? 0 : i.fraction), 0) / Math.max(1, job.items.length)) * 100) : 0;

  if (!variants.length && !pending.length) {
    return (
      <section className="gn-shelf" aria-labelledby="gn-shelf-h">
        <h2 id="gn-shelf-h" className="sr-only">{t('pv.storeTitle')}</h2>
        <EmptyState art="generate" title={t('pv2.emptyTitle')} body={t('pv2.emptyBody')} className="gn-shelf-empty">
          <button type="button" className="btn btn-primary" onClick={onDesign}><Icon name="layout" size={16} />{t('pv2.emptyGo')}</button>
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="gn-shelf" aria-labelledby="gn-shelf-h">
      <header className="gn-shelf-head">
        <div className="gn-shelf-text">
          <h2 id="gn-shelf-h" className="gn-shelf-title">{t('pv.storeTitle')}</h2>
          <p className="gn-shelf-hint" aria-live="polite">
            {picking ? t(compare.length < 2 ? 'pv.comparePick' : 'pv.compareReady') : t('pv2.storeHint')}
          </p>
        </div>
        <div className="gn-shelf-act">
          {variants.length > 1 && (
            <button type="button" className={`btn btn-sm ${picking ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={picking}
              onClick={() => onCompare(picking ? [] : [variants[0].id])}>
              <Icon name="layout" size={15} />{picking ? t('pv.compareCancel') : t('pv.compare')}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-ghost" onClick={onDesign}><Icon name="plus" size={15} />{t('pv2.more')}</button>
        </div>
      </header>

      {job?.running && (
        <div className="gn-run" role="status">
          <span className="gn-run-dot" aria-hidden="true" />
          <span className="gn-run-text">{t('pv.jobRunning', { done: fmtNumber(done, lang), n: fmtNumber(job.items.length, lang) })}</span>
          <span className="gn-run-bar" role="progressbar" aria-label={t('pv.making')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></span>
        </div>
      )}

      <ul className="gn-cards">
        {pending.map((it) => (
          <li key={`job-${it.key}`}><PendingCard it={it} onDismiss={onDismissJob} canDismiss={!job?.running} /></li>
        ))}
        {variants.map((v) => (
          <li key={v.id}>
            <VariantCard book={book} v={v} stale={staleOf(v)} picking={picking} picked={compare.includes(v.id)} exporting={exporting === v.id}
              onOpen={() => (picking ? pick(v.id) : onOpen(v))} onDelete={() => onDelete(v)} onRevert={() => onRevert(v)} onExport={() => onExport(v)}
              onCompare={variants.length > 1 ? () => onCompare([v.id]) : undefined} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PendingCard({ it, onDismiss, canDismiss }: { it: JobItem; onDismiss: () => void; canDismiss: boolean }) {
  const t = useT('finish');
  const { lang } = useLang();
  const { label } = useVariantNames();
  const pct = Math.round(it.fraction * 100);
  const status = it.status === 'queued' ? t('pv.st2.queued')
    : it.status === 'failed' ? t('pv.st2.failed')
    : it.status === 'done' ? t('pv.st2.ready')
    : it.pages ? t('pv.st2.page', { n: fmtNumber(it.pages, lang) }) : t('pv.st2.starting');
  return (
    <article className={`gn-card is-pending is-${it.status}`} aria-busy={it.status === 'working' || it.status === 'queued'}>
      <div className="gn-card-art">
        <span className="gn-card-ghost"><Sheet size={it.combo.size} h={ART_H} /></span>
      </div>
      <div className="gn-card-body">
        <h3 className="gn-card-title">{label(it.combo.size, it.combo.style)}</h3>
        <p className="gn-card-meta" role="status">{status}</p>
        <div className="gn-card-progress" role="progressbar" aria-label={status} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${it.status === 'queued' ? 0 : pct}%` }} />
        </div>
      </div>
      {it.status === 'failed' && canDismiss && (
        <div className="gn-card-act">
          <button type="button" className="btn btn-quiet btn-sm" onClick={onDismiss}>{t('pv.dismiss')}</button>
        </div>
      )}
    </article>
  );
}

function VariantCard({ book, v, stale, picking, picked, exporting, onOpen, onDelete, onRevert, onExport, onCompare }: {
  book: Book; v: Variant; stale: Staleness; picking: boolean; picked: boolean; exporting: boolean;
  onOpen: () => void; onDelete: () => void; onRevert: () => void; onExport: () => void; onCompare?: () => void;
}) {
  const t = useT('finish');
  const tc = useT('common');
  const { lang } = useLang();
  const { label } = useVariantNames();
  const { cost } = useCost('export', 1);
  const W = artW(v.size);
  const cover = v.cover ?? book.cover;
  const changed = stale.layout || stale.text;
  const kind = exportKindOf(v);
  const name = label(v.size, v.style);
  const last = v.exports[0];
  const meta = [
    t('pv.metaNo', { n: v.n }),
    t(v.size === 'ebook' ? 'pv.screens' : 'pv.pages', { n: fmtNumber(v.pages, lang) }),
    fmtDate(v.createdAt, lang, { day: 'numeric', month: 'short' }),
  ].join(' · ');
  return (
    <article className={`gn-card${picked ? ' is-picked' : ''}${picking ? ' is-picking' : ''}`}>
      <button type="button" className="gn-card-hit" onClick={onOpen} aria-pressed={picking ? picked : undefined}
        aria-label={`${t('pv.open')}: ${name}, ${meta}`} />
      <div className={`gn-card-art${v.size === 'ebook' ? ' is-ebook' : ''}`}>
        <span className="gn-card-book" style={{ width: W, height: ART_H }}>
          <DesignedCover title={book.title || ' '} subtitle={book.subtitle} author={book.author} spec={cover} layout={v.spec.layout?.cover} width={W} height={ART_H} deva={isDevanagari(book.title)} />
        </span>
        {picking && <span className={`gn-card-check${picked ? ' is-on' : ''}`} aria-hidden="true">{picked && <Icon name="check" size={14} />}</span>}
      </div>
      <div className="gn-card-body">
        <h3 className="gn-card-title">{name}</h3>
        <p className="gn-card-meta">{meta}</p>
        <div className="gn-card-tags">
          <span className={`gn-tag ${changed ? 'gn-tag-stale' : 'gn-tag-ok'}`}><span className="gn-tag-dot" aria-hidden="true" />{changed ? t('pv.bookChanged') : t('pv.upToDate')}</span>
          {last && <span className="gn-card-out"><Icon name="download" size={12} />{t(`pv.exported.${last.kind}`, { date: fmtDate(last.at, lang, { day: 'numeric', month: 'short' }) })}</span>}
        </div>
      </div>
      {!picking && (
        <div className="gn-card-act">
          <button type="button" className="btn btn-primary btn-sm gn-card-open" onClick={onOpen} tabIndex={-1}>{t('pv.open')}</button>
          <button type="button" className={`btn btn-ghost btn-sm paid-btn gn-card-export${exporting ? ' is-busy' : ''}`} onClick={onExport} disabled={exporting} aria-busy={exporting}>
            {exporting ? <span className="paid-spin" aria-hidden="true" /> : <Icon name="download" size={15} />}
            <span>{t(`pv.exportShort.${kind}`)}</span>
            {!exporting && cost !== undefined && <span className="paid-cost">{tc('credits.cost', { n: fmtNumber(cost, lang) })}</span>}
          </button>
          <Overflow label={t('pv.more', { name })} items={[
            ...(onCompare ? [{ icon: 'layout', label: t('pv.compareWith'), onClick: onCompare }] : []),
            { icon: 'undo', label: t('pv.revert'), onClick: onRevert },
            { icon: 'trash', label: t('pv.delete'), onClick: onDelete, danger: true },
          ]} />
        </div>
      )}
    </article>
  );
}

/** A small "more" menu: opens upward inside the card's actions row. */
export function Overflow({ label, items }: { label: string; items: { icon: string; label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.gn-more-btn')?.focus(); } };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', key);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="gn-more" ref={root}>
      <button type="button" className="btn btn-quiet btn-sm btn-icon gn-more-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="19" cy="12" r="1.8" fill="currentColor" /></svg>
      </button>
      {open && (
        <div className="gn-menu" role="menu" data-pop="">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={`gn-menu-item${it.danger ? ' is-danger' : ''}`} onClick={() => { setOpen(false); it.onClick(); }}>
              <Icon name={it.icon as 'trash'} size={15} />{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
