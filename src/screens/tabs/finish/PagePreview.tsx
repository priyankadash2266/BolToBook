import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Book, FormatSpec } from '@/data/types';
import { useT } from '@/i18n';
import { Icon } from '@/components/Icon';
import { blockStyleOf, bookCss, bookIsDeva, geometry, htmlLang, renderPage, spreads, type Geometry, type PageKind, type PaginateResult } from '@/lib/paginate';
import { isDevanagari } from '@/lib/text';
import { BackCover, DesignedCover } from './DesignedCover';

/* ------------------------------------------------------------------ */
/* The book as a sequence: covers + every laid-out page                 */
/* ------------------------------------------------------------------ */

export type ViewItem = { t: 'front' } | { t: 'inside' } | { t: 'page'; i: number } | { t: 'back' };
export type ViewMode = 'spread' | 'single';
/** A group shown together: item indexes, null = empty side of a spread. */
type Group = (number | null)[];

export const PAGE_OFFSET = 2;
/** Index of page 0 among the view items: a print book has a front and inside cover first, an eBook only a cover. */
export const pageOffset = (ebook?: boolean) => (ebook ? 1 : PAGE_OFFSET);

export function viewItems(pageCount: number, ebook = false): ViewItem[] {
  const pages = Array.from({ length: pageCount }, (_, i) => ({ t: 'page' as const, i }));
  return ebook ? [{ t: 'front' }, ...pages] : [{ t: 'front' }, { t: 'inside' }, ...pages, { t: 'back' }];
}

function groupsOf(items: ViewItem[], single: boolean): Group[] {
  if (single) return items.map((_, i) => [i]);
  const pages = items.length - 3;
  const out: Group[] = [[0], [1]];
  for (const [a, b] of spreads(pages)) out.push([a == null ? null : a + PAGE_OFFSET, b == null ? null : b + PAGE_OFFSET]);
  out.push([items.length - 1]);
  return out;
}

const groupIndexOf = (groups: Group[], pos: number) => Math.max(0, groups.findIndex((g) => g.includes(pos)));

/**
 * Where the reader is, described by what's on the page rather than its index, so a new layout
 * (another trim, face, a blank page added) keeps the same passage in view instead of whatever
 * page now happens to sit at that index — often an empty verso.
 */
type Anchor = { t: 'front' | 'inside' | 'back' } | { t: 'page'; key?: string; chapterId?: string; kind: PageKind; nth: number; ratio: number };
type Pages = PaginateResult['pages'];

const firstKey = (body: string) => body.match(/data-k="([^"]+)"/)?.[1];

function anchorOf(pos: number, items: ViewItem[], pages: Pages): Anchor | null {
  const it = items[pos];
  if (!it) return null;
  if (it.t !== 'page') return { t: it.t };
  // A blank page has nothing to hold on to: anchor on the next page with something printed.
  let i = it.i;
  while (pages[i] && pages[i].kind === 'blank' && i < pages.length - 1) i++;
  const p = pages[i];
  if (!p) return null;
  const nth = pages.slice(0, i).filter((x) => x.kind === p.kind).length;
  return { t: 'page', key: firstKey(p.body), chapterId: p.chapterId, kind: p.kind, nth, ratio: i / Math.max(1, pages.length) };
}

function findAnchor(a: Anchor, items: ViewItem[], pages: Pages, offset: number, done: boolean): number | null {
  if (a.t !== 'page') {
    const i = items.findIndex((x) => x.t === a.t);
    return i < 0 ? (a.t === 'back' ? items.length - 1 : 0) : i;
  }
  if (a.key) {
    const needle = `data-k="${a.key}"`;
    const i = pages.findIndex((p) => p.body.includes(needle));
    if (i >= 0) return i + offset;
  }
  if (a.chapterId) {
    const i = pages.findIndex((p) => p.chapterId === a.chapterId && p.kind !== 'blank');
    if (i >= 0) return i + offset;
  }
  if (a.kind !== 'text' && a.kind !== 'open' && a.kind !== 'blank') {
    const same = pages.map((p, i) => (p.kind === a.kind ? i : -1)).filter((i) => i >= 0);
    if (same.length) return same[Math.min(a.nth, same.length - 1)] + offset;
  }
  if (!done) return null;
  return Math.min(pages.length - 1, Math.round(a.ratio * pages.length)) + offset;
}

/** Fits the shown group into the desk. */
function useBox() {
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 900, h: 600 });
  useEffect(() => {
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { el, ref, box };
}

interface Props {
  book: Book;
  spec: FormatSpec;
  result: PaginateResult | null;
  pos: number;
  onPos: (n: number) => void;
  mode: ViewMode;
  zoom: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
  editable: boolean;
  /** The floating toolbar for the selected block. */
  toolbar?: ReactNode;
  nameOf: (key: string) => string;
  chapterOptions: { id: string; label: string }[];
  blurbPh: string;
  /** Show the filmstrip of every page under the desk (default on). */
  strip?: boolean;
  /** A scope class for the book CSS, so two previews on one screen don't share styles. */
  scope?: string;
}

export function PagePreview({ book, spec, result, pos, onPos, mode, zoom, selected, onSelect, editable, toolbar, nameOf, chapterOptions, blurbPh, strip = true, scope = 'gn-book' }: Props) {
  const t = useT('finish');
  const deva = bookIsDeva(book);
  const ebook = !!spec.ebook;
  const offset = pageOffset(ebook);
  const g = geometry(spec, deva);
  const css = useMemo(() => bookCss(spec, g, '.' + scope), [spec, g.pageW, g.pageH, g.lineH, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const { el: deskEl, ref: deskRef, box } = useBox();
  const narrow = box.w < 600;
  const single = mode === 'single' || narrow || ebook;
  const pages = result?.pages ?? [];
  const items = useMemo(() => viewItems(pages.length, ebook), [pages.length, ebook]);
  const groups = useMemo(() => groupsOf(items, single), [items, single]);
  const at = Math.max(0, Math.min(pos, items.length - 1));
  const gi = groupIndexOf(groups, at);
  const group = groups[gi] ?? [0];
  /** The member of a spread to stand on: the printed page, not the empty verso beside it. */
  const bestOf = useCallback((g0: Group) => {
    const real = g0.filter((x): x is number => x != null);
    return real.find((i) => { const it = items[i]; return !(it?.t === 'page' && pages[it.i]?.kind === 'blank'); }) ?? real[0] ?? 0;
  }, [items, pages]);

  // Keep the same passage in view across layouts (see Anchor).
  const anchor = useRef<Anchor | null>(null);
  const seen = useRef<PaginateResult | null>(null);
  useEffect(() => {
    if (!result) return;
    if (seen.current && seen.current !== result && anchor.current) {
      const np = findAnchor(anchor.current, items, pages, offset, result.done);
      if (np == null) return; // that passage isn't laid out yet: wait for more pages
      seen.current = result;
      const target = single ? np : bestOf(groups[groupIndexOf(groups, np)] ?? [np]);
      if (target !== pos) { onPos(target); return; }
    }
    seen.current = result;
    const a = anchorOf(at, items, pages);
    if (a) anchor.current = a;
  }, [result, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Turning to single pages from a spread: stand on the printed page of that spread.
  const wasSingle = useRef(single);
  useEffect(() => {
    if (single && !wasSingle.current) { const b = bestOf(group); if (b !== pos) onPos(b); }
    wasSingle.current = single;
  }, [single]); // eslint-disable-line react-hooks/exhaustive-deps
  const isCoverGroup = group.length === 1 && (items[group[0] ?? 0]?.t !== 'page');
  // Spreads keep one scale, so a lone cover isn't suddenly larger than the pages.
  const slots = single ? 1 : 2;
  const fit = Math.max(0.15, Math.min((box.w - 48) / (g.pageW * slots), (box.h - 48) / g.pageH));
  const scale = +(fit * zoom).toFixed(4);

  const go = useCallback((d: number) => { const n = Math.max(0, Math.min(groups.length - 1, gi + d)); onPos(single ? (groups[n][0] ?? 0) : bestOf(groups[n])); }, [groups, gi, onPos, single, bestOf]);

  const labelOf = (i: number | null) => {
    if (i == null) return '';
    const it = items[i];
    if (!it) return '';
    if (it.t !== 'page') return t(`gen.kind.${it.t}`);
    const p = pages[it.i];
    if (!p) return '';
    if (p.folio != null && p.kind !== 'blank' && p.kind !== 'half' && p.kind !== 'title' && p.kind !== 'copyright' && p.kind !== 'contents' && p.kind !== 'dedication') return t('gen.preview.pageN', { n: p.folio });
    return t(`gen.kind.${p.kind}`);
  };

  /* ---------- selection ---------- */
  const canvas = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const [parts, setParts] = useState<string[]>([]);
  const measureSel = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const base = c.getBoundingClientRect();
    const found = Array.from(c.querySelectorAll<Element>('.gn-sheet [data-k]'));
    setParts([...new Set(found.map((e) => e.getAttribute('data-k') ?? ''))].filter(Boolean));
    if (!selected) { setRects([]); return; }
    const els = found.filter((e) => e.getAttribute('data-k') === selected);
    setRects(els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, w: Math.max(6, r.width), h: Math.max(6, r.height) };
    }).filter((r) => r.w > 0 && r.h > 0));
  }, [selected]);
  useLayoutEffect(() => { measureSel(); const id = requestAnimationFrame(measureSel); return () => cancelAnimationFrame(id); }, [measureSel, gi, scale, result, spec, single]);
  useEffect(() => { document.fonts?.ready.then(measureSel).catch(() => {}); }, [measureSel]);

  const onCanvasClick = (e: React.MouseEvent) => {
    if (!editable) return;
    const el = (e.target as Element).closest?.('[data-k]');
    onSelect(el && canvas.current?.contains(el) ? el.getAttribute('data-k') : null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1); }
    if (e.key === 'Home') { e.preventDefault(); onPos(0); }
    if (e.key === 'End') { e.preventDefault(); onPos(items.length - 1); }
    if (e.key === 'Escape' && selected) { e.preventDefault(); onSelect(null); }
  };

  // Floating toolbar placement: above the selection, inside the canvas.
  const tbRef = useRef<HTMLDivElement>(null);
  const [tbPos, setTbPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!rects.length || !canvas.current) { setTbPos((p) => (p ? null : p)); return; }
    const top = Math.min(...rects.map((r) => r.y));
    const bottom = Math.max(...rects.map((r) => r.y + r.h));
    const first = rects[0];
    const cw = canvas.current.clientWidth;
    const tw = tbRef.current?.offsetWidth ?? 420;
    const th = tbRef.current?.offsetHeight ?? 52;
    const left = Math.max(6, Math.min(cw - tw - 6, first.x + first.w / 2 - tw / 2));
    const gap = 28;
    const below = top - th - gap < 0;
    const next = { left: Math.round(left), top: Math.round(below ? bottom + gap : top - th - gap), below };
    setTbPos((p) => (p && p.left === next.left && p.top === next.top && p.below === next.below ? p : next));
  });

  const pagesW = (single ? 1 : 2) * g.pageW * scale;
  const pageH = g.pageH * scale;
  const canvasStyle: CSSProperties = { minWidth: pagesW + 48, minHeight: pageH + 48 };

  /* ---------- rendering one slot ---------- */
  const slot = (i: number | null, side: 'left' | 'right', k: string) => {
    const box = { width: g.pageW * scale, height: pageH };
    if (i == null) return <div key={k} className="gn-page gn-page-void" style={box} aria-hidden="true" />;
    const it = items[i];
    if (it.t === 'front') {
      return (
        <div key={k} className="gn-page gn-page-cover gn-sheet" style={box}>
          <DesignedCover title={book.title || ' '} subtitle={book.subtitle} author={book.author} spec={book.cover} layout={spec.layout?.cover}
            width={box.width} height={box.height} deva={isDevanagari(book.title)} selectable={editable} />
        </div>
      );
    }
    if (it.t === 'back') {
      const bs = blockStyleOf(spec, 'back:blurb');
      return (
        <div key={k} className="gn-page gn-page-cover gn-sheet" style={box}>
          <BackCover spec={book.cover} blurb={book.fields.brief ?? ''} author={book.author} placeholder={blurbPh} barcode={t('gen.preview.barcode')} deva={deva}
            width={box.width} height={box.height}
            blurbCss={{ textAlign: bs?.align, fontStyle: bs?.italic == null ? undefined : bs.italic ? 'italic' : 'normal', transform: bs?.shift ? `translateY(${bs.shift * g.lineH * scale}px)` : undefined, ['--s' as string]: bs?.scale ?? 1 }} />
        </div>
      );
    }
    if (it.t === 'inside') return <div key={k} className="gn-page gn-page-inside gn-sheet" style={box} aria-label={t('gen.kind.inside')} />;
    const p = pages[it.i];
    return (
      <div key={k} className={`gn-page gn-page-${side} gn-sheet`} style={box}>
        <div className="gn-real" style={{ width: g.pageW, height: g.pageH, transform: `scale(${scale})`, ['--inv' as string]: (1 / scale).toFixed(3) }}
          dangerouslySetInnerHTML={{ __html: p ? renderPage(p, { book, spec }) : '' }} />
        {(!p || p.kind === 'blank') && (
          <span className="gn-blank-note" aria-hidden={!p}>
            {p ? t('pv.blankNote') : t('gen.preview.laying')}
          </span>
        )}
      </div>
    );
  };

  const sideOf = (i: number | null): 'left' | 'right' => { const it = i == null ? undefined : items[i]; return it?.t === 'page' ? pages[it.i]?.side ?? 'right' : 'right'; };
  const shownLabel = group.map(labelOf).filter(Boolean).join(' · ');
  const chapterSel = chapterOptions.length > 1 && result && (
    <label className="gn-chsel">
      <span className="sr-only">{t('gen.preview.chapter')}</span>
      <select className="select" value="" onChange={(e) => { const i = result.chapterStart[e.target.value]; if (i != null) onPos(i + offset); }}>
        <option value="">{t('gen.preview.chapter')}</option>
        {chapterOptions.map((c) => <option key={c.id} value={c.id} disabled={result.chapterStart[c.id] == null}>{c.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="gn-stage">
      <style>{css}</style>
      <div className={`gn-desk${editable ? ' is-edit' : ''}`} ref={deskRef} tabIndex={0} onKeyDown={onKey} aria-label={t('gen.preview.keys')} lang={htmlLang(book.lang)}>
        {!result ? <div className="gn-wait"><span className="gn-wait-dot" />{t('gen.preview.laying')}</div> : (
          <div className="gn-scroll">
          <div className="gn-canvas" ref={canvas} style={canvasStyle} onClick={onCanvasClick}>
            <div className={`gn-spread ${scope}${isCoverGroup ? ' is-cover' : ''}${single ? ' is-single' : ''}`} key={gi} style={{ minHeight: pageH }}>
              {single ? slot(group[0], sideOf(group[0]), 'a')
                : group.length === 1 ? slot(group[0], 'right', 'a') : <>{slot(group[0], 'left', 'a')}{slot(group[1], 'right', 'b')}</>}
            </div>
            {rects.map((r, i) => (
              <span key={i} className="gn-sel" style={{ left: r.x - 4, top: r.y - 3, width: r.w + 8, height: r.h + 6 }} aria-hidden="true">
                {i === 0 && selected && <span className="gn-sel-tag">{nameOf(selected)}</span>}
              </span>
            ))}
            {selected && toolbar && rects.length > 0 && !narrow && (
              <div ref={tbRef} className={`gn-float${tbPos?.below ? ' is-below' : ''}`} style={tbPos ? { left: tbPos.left, top: tbPos.top } : { visibility: 'hidden', left: 0, top: 0 }}
                onClick={(e) => e.stopPropagation()}>
                {toolbar}
              </div>
            )}
          </div>
          </div>
        )}
        {selected && toolbar && result && (rects.length === 0 || narrow) && <div className="gn-float is-dock" onClick={(e) => e.stopPropagation()}>{toolbar}</div>}
        {result && deskEl && (
          <>
            <button type="button" className="gn-turn gn-turn-prev" onClick={() => go(-1)} disabled={gi === 0} aria-label={t('gen.preview.prev')}><Icon name="left" size={22} /></button>
            <button type="button" className="gn-turn gn-turn-next" onClick={() => go(1)} disabled={gi >= groups.length - 1} aria-label={t('gen.preview.next')}><Icon name="right" size={22} /></button>
          </>
        )}
      </div>

      <div className="gn-nav">
        <span className="gn-navlabel" aria-live="polite">
          <span className="gn-navname">{shownLabel}</span>
          <span className="gn-navof"> {t(single ? 'gen.preview.ofPages' : 'gen.preview.ofSpreads', { n: gi + 1, total: Math.max(1, groups.length) })}</span>
        </span>
        <div className="gn-nav-tools">
          {editable && parts.length > 0 && (
            <label className="gn-parts">
              <span className="sr-only">{t('design.parts')}</span>
              <select className="select" value={selected && parts.includes(selected) ? selected : ''} onChange={(e) => onSelect(e.target.value || null)}>
                <option value="">{t('design.parts')}</option>
                {parts.map((k) => <option key={k} value={k}>{nameOf(k)}</option>)}
              </select>
            </label>
          )}
          {chapterSel}
        </div>
      </div>

      {result && !result.done && (
        <div className="gn-progress" role="progressbar" aria-label={t('gen.preview.laying')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(result.progress * 100)}>
          <span style={{ width: `${Math.round(result.progress * 100)}%` }} />
        </div>
      )}

      {result && strip && <Filmstrip book={book} spec={spec} g={g} items={items} pages={pages} active={at} activeGroup={group} single={ebook} scope={scope}
        onPos={(i) => onPos(single ? i : bestOf(groups[groupIndexOf(groups, i)] ?? [i]))} labelOf={labelOf} blurbPh={blurbPh} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filmstrip: every page, covers included, as little sheets            */
/* ------------------------------------------------------------------ */

const THUMB_H = 84;

function Filmstrip({ book, spec, g, items, pages, active, activeGroup, single, scope, onPos, labelOf, blurbPh }: {
  book: Book; spec: FormatSpec; g: Geometry; items: ViewItem[]; pages: PaginateResult['pages']; active: number; activeGroup: Group; single: boolean; scope: string;
  onPos: (n: number) => void; labelOf: (i: number | null) => string; blurbPh: string;
}) {
  const t = useT('finish');
  const strip = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupsOf(items, single), [items, single]);
  const s = THUMB_H / g.pageH;
  const w = Math.round(g.pageW * s);
  const deva = bookIsDeva(book);

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('.gn-thumb.is-on');
    const box = strip.current;
    if (!el || !box) return;
    const l = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
    box.scrollTo({ left: Math.max(0, l), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [active]);

  return (
    <nav className="gn-strip" aria-label={t('gen.preview.strip')}>
      <div className={`gn-strip-track ${scope}`} ref={strip}>
        {groups.map((grp, gi) => (
          <div key={gi} className={`gn-strip-group${grp.some((x) => x != null && activeGroup.includes(x)) ? ' is-on' : ''}`}>
            <div className="gn-strip-pair">
              {grp.map((i, si) => i == null ? null : (
                <button key={si} type="button" className={`gn-thumb${i === active ? ' is-on' : ''}`} style={{ width: w, height: THUMB_H }}
                  onClick={() => onPos(i)} aria-label={labelOf(i)} aria-current={activeGroup.includes(i) ? 'true' : undefined}>
                  <LazyThumb>
                    {() => {
                      const it = items[i];
                      if (it.t === 'front') return <DesignedCover title={book.title || ' '} subtitle={book.subtitle} author={book.author} spec={book.cover} layout={spec.layout?.cover} width={w} height={THUMB_H} deva={isDevanagari(book.title)} />;
                      if (it.t === 'back') return <BackCover spec={book.cover} blurb={book.fields.brief ?? ''} author={book.author} placeholder={blurbPh} barcode="" deva={deva} width={w} height={THUMB_H} />;
                      if (it.t === 'inside') return <span className="gn-thumb-inside" />;
                      const p = pages[it.i];
                      return p ? <div className="gn-real" style={{ width: g.pageW, height: g.pageH, transform: `scale(${s})` }} dangerouslySetInnerHTML={{ __html: renderPage(p, { book, spec }) }} /> : null;
                    }}
                  </LazyThumb>
                </button>
              ))}
            </div>
            <span className="gn-strip-label" title={grp.map(labelOf).filter(Boolean).join(' · ')}>{grp.map(labelOf).filter(Boolean).join(' · ')}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** Renders its content only once it scrolls near view (a long book has hundreds of pages). */
function LazyThumb({ children }: { children: () => ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    if (typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { root: el.closest('.gn-strip-track'), rootMargin: '0px 600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return <span ref={ref} className="gn-thumb-in">{on ? children() : null}</span>;
}
