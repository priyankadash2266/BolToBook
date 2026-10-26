import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { chapterName } from '@/components/kit';
import { Segmented } from '@/components/Segmented';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useCost } from '@/components/credits';
import { api } from '@/data/api';
import type { Book, Chapter, FormatSpec } from '@/data/types';
import { useLang, useT } from '@/i18n';
import { fmtDate, fmtNumber, fmtTime } from '@/lib/format';
import { speechLocale } from '@/lib/text';
import { FACES, bookIsDeva, esc, resolveFormat, type PrintLabels } from '@/lib/paginate';
import { bookChapters } from '@/lib/exporters';
import { PagePreview, pageOffset, type ViewMode } from './PagePreview';
import { usePagination } from './usePagination';
import { snapshotBook, snapshotChapters } from './editions';
import { applyBlock, applyCover, blockName, chapterIdOf, kindOf, resetAll, type BlockOp, type CoverOp } from './layout';
import { parseDesign } from './designCommands';
import { BlockToolbar } from './BlockToolbar';
import { DesignVoice, type VoiceOutcome } from './DesignVoicePanel';
import { FormatPanel } from './FormatPanel';
import { isStale, liveSpecOf, stalenessOf, type Variant } from './variants';
import { useVariantNames } from './Chooser';

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2];
const SIZE_STEPS: FormatSpec['size'][] = ['s', 'm', 'l'];
const STYLE_KEYS = new Set(['trim', 'face', 'size', 'margins', 'opening', 'headFace', 'pt']);
const same = (a?: FormatSpec, b?: FormatSpec) => JSON.stringify(a) === JSON.stringify(b);

/** Design history for this session: every change (by hand or by voice) can be undone and redone. */
function useHistory() {
  const cur = useRef<FormatSpec | undefined>(undefined);
  const past = useRef<FormatSpec[]>([]);
  const future = useRef<FormatSpec[]>([]);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const reset = useCallback((s: FormatSpec) => { cur.current = s; past.current = []; future.current = []; bump(); }, []);
  const commit = useCallback((next: FormatSpec) => {
    if (!cur.current || same(cur.current, next)) return false;
    past.current = [...past.current.slice(-99), cur.current];
    future.current = [];
    cur.current = next;
    bump();
    return true;
  }, []);
  const undo = useCallback(() => {
    const prev = past.current[past.current.length - 1];
    if (!prev || !cur.current) return false;
    past.current = past.current.slice(0, -1);
    future.current = [cur.current, ...future.current];
    cur.current = prev;
    bump();
    return true;
  }, []);
  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next || !cur.current) return false;
    future.current = future.current.slice(1);
    past.current = [...past.current, cur.current];
    cur.current = next;
    bump();
    return true;
  }, []);
  return { spec: cur.current, get: () => cur.current, reset, commit, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

interface Props {
  v: Variant;
  book: Book;
  chapters: Chapter[];
  labels: PrintLabels;
  country?: Book['country'];
  onBack: () => void;
  /** Make a fresh preview of this size and style with the book as it is now (paid; asks first). */
  onFresh: (spec: FormatSpec) => void;
  freshBusy?: boolean;
  /** Export this preview (paid; asks first). */
  onExport: () => void;
  exporting?: boolean;
  onRevert: () => void;
  onDelete: () => void;
}

/** One kept preview on the light table: every page, covers included, adjustable by hand or by voice. */
export function Previewer({ v, book, chapters, labels, country, onBack, onFresh, freshBusy, onExport, exporting, onRevert, onDelete }: Props) {
  const t = useT('finish');
  const { lang } = useLang();
  const tc = useT('common');
  const toast = useToast();
  const { label } = useVariantNames();
  const exportCost = useCost('export', 1).cost;
  const previewCost = useCost('preview', 1).cost;
  const h = useHistory();
  const fmt = h.spec;
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [selected, setSelected] = useState<string | null>(null);
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [pos, setPos] = useState(0);
  const [mode, setMode] = useState<ViewMode>('spread');
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<'live' | 'kept'>('live');
  const [tab, setTab] = useState<'design' | 'settings' | 'details'>('design');
  const loadedFor = useRef<string | null>(null);
  const dirty = useRef(false);
  const follow = useRef<string | null>(null);

  useEffect(() => {
    if (loadedFor.current !== book.id) { loadedFor.current = book.id; h.reset(resolveFormat(book)); }
  }, [book, h]);
  useEffect(() => { setPos(0); setSelected(null); setView('live'); }, [v.id]);

  // Save the book's details and design changes (debounced) once the author changes something.
  useEffect(() => {
    if (!fmt || !dirty.current) return;
    setSaved('saving');
    const tm = setTimeout(() => { api.books.update(book.id, { format: fmt }).then(() => setSaved('saved')).catch(() => setSaved('idle')); }, 600);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmt]);

  const bookNow: Book = useMemo(() => ({ ...book, format: fmt ?? book.format }), [book, fmt]);
  const live = useMemo(() => liveSpecOf(v, bookNow), [v, bookNow]);
  const stale = useMemo(() => stalenessOf(v, bookNow, chapters), [v, bookNow, chapters]);
  const changed = isStale(stale);
  const showKept = changed && view === 'kept';
  const editable = !showKept;

  const src = useMemo(() => showKept
    ? { book: snapshotBook(book, v), chapters: snapshotChapters(v, book.id), spec: v.spec }
    : { book: { ...bookNow, format: live }, chapters, spec: live },
  [showKept, book, v, bookNow, chapters, live]);

  const { result, laidOutWith, updating } = usePagination(src.book, src.chapters, src.spec, labels, 220, true);
  const renderSpec = laidOutWith ?? src.spec;
  const renderBook: Book = { ...src.book, format: renderSpec };
  const offset = pageOffset(!!renderSpec.ebook);

  const commit = useCallback((fn: (s: FormatSpec) => FormatSpec) => {
    const cur = h.get();
    if (!cur) return false;
    const ok = h.commit(fn(cur));
    if (ok) { dirty.current = true; setView('live'); }
    return ok;
  }, [h]);
  const undo = useCallback(() => { if (h.undo()) dirty.current = true; }, [h]);
  const redo = useCallback(() => { if (h.redo()) dirty.current = true; }, [h]);

  const included = useMemo(() => bookChapters(src.chapters), [src.chapters]);
  const chapterNo = useMemo(() => { const m = new Map(included.map((c, i) => [c.id, i + 1])); return (id: string) => m.get(id); }, [included]);
  const nameOf = useCallback((key: string) => blockName(key, t, chapterNo), [t, chapterNo]);
  const itemCount = (result?.pages.length ?? 0) + (renderSpec.ebook ? 1 : 3);

  const locate = useCallback((key: string): number | null => {
    if (!result) return null;
    if (key === 'cover:title') return 0;
    if (key === 'back:blurb') return renderSpec.ebook ? null : itemCount - 1;
    if (key === 'run:head' || key === 'run:folio') return null;
    if (key === 'all:chtitle') {
      const cur = result.pages[pos - offset];
      if (cur?.kind === 'open') return null;
      const first = included[0] && result.chapterStart[included[0].id];
      return first == null ? null : first + offset;
    }
    if (/:end$/.test(key)) {
      const id = chapterIdOf(key);
      let last = -1;
      result.pages.forEach((p, i) => { if (p.chapterId === id && p.kind !== 'blank') last = i; });
      return last < 0 ? null : last + offset;
    }
    const needle = `data-k="${esc(key)}"`;
    const i = result.pages.findIndex((p) => p.body.includes(needle));
    return i < 0 ? null : i + offset;
  }, [result, itemCount, pos, included, offset, renderSpec.ebook]);

  useEffect(() => {
    const k = follow.current;
    if (!k || !result?.done || updating || laidOutWith !== src.spec) return;
    follow.current = null;
    const at = locate(k);
    if (at == null) return;
    const pg = (i: number) => i - offset;
    const sameSpread = mode === 'spread' && !renderSpec.ebook && at >= offset && pos >= offset && Math.floor((pg(at) + 1) / 2) === Math.floor((pg(pos) + 1) / 2);
    if (at !== pos && !sameSpread) setPos(at);
  }, [result, updating, locate, mode, pos, laidOutWith, src.spec, offset, renderSpec.ebook]);

  if (!fmt) return <p className="muted">{tc('loading')}</p>;

  const deva = bookIsDeva(book);
  const trimLabel = renderSpec.ebook ? t('pv.size.ebook') : t(`gen.trim.${renderSpec.trim}`);
  const stats = result
    ? renderSpec.ebook
      ? t(result.done ? 'pv.statsEbook' : 'gen.stats.working', { trim: trimLabel, pages: fmtNumber(result.total, lang) })
      : t(result.done ? 'gen.stats.done' : 'gen.stats.working', { trim: trimLabel, pages: fmtNumber(result.total, lang), spine: result.spineIn.toFixed(2) })
    : t('gen.stats.starting', { trim: trimLabel });

  /* ---- design changes (free; they're the book's own layout) ---- */
  const setFormat = <K extends keyof FormatSpec>(k: K, val: FormatSpec[K]) => { commit((s) => ({ ...s, [k]: val })); };
  const onBlock = (key: string, op: BlockOp) => { if (commit((s) => applyBlock(s, key, op))) follow.current = key; };
  const onCover = (op: CoverOp) => { commit((s) => applyCover(s, op)); };
  const select = (key: string | null) => { setSelected(key); if (key && kindOf(key) !== 'heading') setScope('one'); };
  const effectLabel = (effect: string, vars?: Record<string, string | number>) => {
    if (effect === 'face' && vars?.face) return FACES[vars.face as FormatSpec['face']]?.label ?? String(vars.face);
    return t(`design.effect.${effect}`, vars);
  };

  const runVoice = (text: string): VoiceOutcome => {
    if (!editable) return { ok: false, reason: 'unknown' };
    const res = parseDesign(text, { selected: selected && kindOf(selected) === 'heading' && scope === 'all' ? 'all:chtitle' : selected, onCover: pos === 0, chapters: included.map((c, i) => ({ id: c.id, n: i + 1 })) });
    if (!res.ok) return res;
    const u = res.u;
    for (const a of u.actions) {
      if (a.kind === 'undo') { undo(); return { ok: true, chip: t('design.effect.undo') }; }
      if (a.kind === 'redo') { redo(); return { ok: true, chip: t('design.effect.redo') }; }
      // Size and style are what this preview is; another one is made from "Choose what to make".
      if (a.kind === 'sizeStep' || (a.kind === 'format' && Object.keys(a.patch).some((k) => STYLE_KEYS.has(k)))) return { ok: false, reason: 'style' };
    }
    commit((s0) => {
      let s = s0;
      for (const a of u.actions) {
        if (a.kind === 'block') s = applyBlock(s, a.key, a.op);
        else if (a.kind === 'cover') s = applyCover(s, a.op);
        else if (a.kind === 'format') s = { ...s, ...a.patch };
        else if (a.kind === 'sizeStep') s = { ...s, size: SIZE_STEPS[Math.max(0, Math.min(2, SIZE_STEPS.indexOf(s.size) + a.dir))] };
      }
      return s;
    });
    if (u.key) {
      follow.current = u.key;
      if (u.key === 'all:chtitle') {
        setScope('all');
        if (!selected || kindOf(selected) !== 'heading') { const first = included[0]; select(first ? `ch:${first.id}:title` : null); }
      } else if (/:end$/.test(u.key)) select(null);
      else { select(u.key); if (kindOf(u.key) === 'heading') setScope('one'); }
    }
    const target = u.key ? nameOf(u.key) : t(`design.target.${u.target ?? 'design'}`);
    return { ok: true, chip: `${target} → ${effectLabel(u.effect, u.effectVars)}` };
  };

  const kind: 'pdf' | 'epub' = v.size === 'ebook' ? 'epub' : 'pdf';

  const chapterOptions = included.map((c, i) => ({ id: c.id, label: `${i + 1}. ${chapterName(c, i, tc)}` }));
  const blankSpots = [
    ...(fmt.halfTitle !== false ? [{ key: 'half:title', label: t('gen.kind.half') }] : []),
    { key: 'title:main', label: t('gen.kind.title') },
    { key: 'copyright', label: t('gen.kind.copyright') },
    ...(fmt.includeContents ? [{ key: 'toc', label: t('gen.kind.contents') }] : []),
    ...included.map((c, i) => ({ key: `ch:${c.id}:end`, label: t('design.block.end', { n: i + 1 }) + (c.title.trim() ? ` · ${c.title.trim()}` : '') })),
  ];
  const zi = ZOOMS.indexOf(zoom);
  const onRootKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  };
  const toolbar = selected && editable ? (
    <BlockToolbar blockKey={selected} spec={live} name={kindOf(selected) === 'heading' && scope === 'all' ? nameOf('all:chtitle') : nameOf(selected)}
      scope={scope} onScope={setScope} onBlock={(k, op) => onBlock(k, op)} onCover={(op) => onCover(op)} onClose={() => setSelected(null)} coverDefault={book.cover?.layout} />
  ) : undefined;
  const made = `${fmtDate(v.createdAt, lang, { day: 'numeric', month: 'short' })}, ${fmtTime(v.createdAt, lang)}`;
  const changeList = [stale.layout && t('pv.changedLayout'), stale.text && t('pv.changedText')].filter(Boolean).join(' · ').replace(/^./, (c) => c.toUpperCase());

  const metaNo = t('pv.metaNo', { n: v.n });
  const tabs = [
    { value: 'design' as const, label: t('pv.tabs.design') },
    { value: 'settings' as const, label: t('pv.tabs.settings') },
    { value: 'details' as const, label: t('pv.tabs.details') },
  ];
  const exportBtn = (
    <button type="button" className={`btn btn-primary paid-btn gn-export${exporting ? ' is-busy' : ''}`} onClick={onExport} disabled={!included.length || exporting} aria-busy={exporting}>
      {exporting ? <span className="paid-spin" aria-hidden="true" /> : <Icon name="download" size={16} />}
      {exporting ? <span>{t(kind === 'pdf' ? 'pv.exportingPdf' : 'pv.exportingEpub')}</span>
        : <><span className="gn-x-long">{t(kind === 'pdf' ? 'pv.exportPdf' : 'pv.exportEpub')}</span><span className="gn-x-short">{t(`pv.exportShort.${kind}`)}</span></>}
      {!exporting && exportCost !== undefined && <span className="paid-cost">{tc('credits.cost', { n: fmtNumber(exportCost, lang) })}</span>}
    </button>
  );

  return (
    <div className="gn gn-open gn-ws" onKeyDown={onRootKey} aria-label={t('pv.workspace')}>
      <header className="gn-ws-bar">
        <button type="button" className="btn btn-ghost btn-sm gn-ws-back" onClick={onBack} aria-label={t('pv.back')} title={t('pv.back')}>
          <Icon name="left" size={16} /><span className="gn-x-long">{t('pv.back')}</span>
        </button>
        <div className="gn-ws-title">
          <h1 className="gn-ws-h">{label(v.size, v.style)}</h1>
          <p className="gn-ws-meta" aria-live="polite"><span className="gn-ws-no">{metaNo}</span> · {stats}{updating && result ? <span className="gn-updating"> · {t('gen.preview.updating')}</span> : null}</p>
        </div>
        <div className="gn-ws-tools" role="toolbar" aria-label={t('gen.preview.tools')}>
          {!renderSpec.ebook && (
            <span className="gn-mode"><Segmented size="sm" label={t('gen.preview.view')} value={mode} onChange={setMode}
              options={[{ value: 'spread', label: t('gen.preview.spread') }, { value: 'single', label: t('gen.preview.single') }]} /></span>
          )}
          <span className="gn-grp" role="group" aria-label={t('gen.preview.zoom')}>
            <button type="button" className="gn-ibtn" onClick={() => setZoom(ZOOMS[Math.max(0, zi - 1)])} disabled={zi <= 0} aria-label={t('gen.preview.zoomOut')}>−</button>
            <button type="button" className="gn-zoom-val" onClick={() => setZoom(1)} title={t('gen.preview.fit')}>{Math.round(zoom * 100)}%</button>
            <button type="button" className="gn-ibtn" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])} disabled={zi >= ZOOMS.length - 1} aria-label={t('gen.preview.zoomIn')}>+</button>
          </span>
          {editable && (
            <span className="gn-grp" role="group" aria-label={t('design.history')}>
              <button type="button" className="gn-ibtn" onClick={undo} disabled={!h.canUndo} aria-label={t('design.undo')} title={t('design.undoKey')}><Icon name="undo" size={16} /></button>
              <button type="button" className="gn-ibtn gn-redo" onClick={redo} disabled={!h.canRedo} aria-label={t('design.redo')} title={t('design.redoKey')}><Icon name="undo" size={16} /></button>
            </span>
          )}
        </div>
        <div className="gn-ws-export">{exportBtn}</div>
      </header>

      <div className="gn-ws-body">
        <section className="gn-ws-main" aria-label={t('gen.preview.label')}>
          {changed && (
            <div className="gn-stale" role="status">
              <div className="gn-stale-text">
                <strong>{t('pv.staleTitle')}</strong>
                <span>{changeList}. {t('pv.staleBody')}</span>
              </div>
              <div className="gn-stale-act">
                <Segmented size="sm" label={t('pv.viewLabel')} value={view} onChange={setView}
                  options={[{ value: 'live', label: t('pv.viewLive') }, { value: 'kept', label: t('pv.viewKept') }]} />
                <button type="button" className="btn btn-ghost btn-sm paid-btn" onClick={() => onFresh(live)} disabled={freshBusy}>
                  {freshBusy ? <span className="paid-spin" aria-hidden="true" /> : <Icon name="file" size={15} />}
                  <span>{freshBusy ? t('pv.making') : t('pv.fresh')}</span>
                  {!freshBusy && previewCost !== undefined && <span className="paid-cost">{tc('credits.cost', { n: fmtNumber(previewCost, lang) })}</span>}
                </button>
              </div>
            </div>
          )}
          <div className="gn-table">
            <PagePreview book={renderBook} spec={renderSpec} result={result} pos={pos} onPos={setPos} mode={mode} zoom={zoom}
              selected={selected} onSelect={select} editable={editable} toolbar={toolbar} nameOf={nameOf} chapterOptions={chapterOptions}
              blurbPh={t('gen.preview.blurbPh')} />
            {included.length === 0 && <p className="gn-note">{t('gen.empty')}</p>}
          </div>
        </section>

        <aside className="gn-panel" aria-label={t('pv.panelLabel')}>
          <div className="gn-ptabs">
            <Segmented size="sm" label={t('pv.panelLabel')} value={tab} onChange={setTab} options={tabs} />
          </div>
          <div className="gn-pbody">
            {tab === 'design' && (
              <div className="gn-pane-design">
                <DesignVoice locale={speechLocale(lang, country ?? 'IN')} run={runVoice} onUndo={undo} canUndo={h.canUndo} disabled={!editable} />
                <div className="gn-selbox">
                  <span className="gn-fp-kick">{t('pv.selectedL')}</span>
                  {selected && editable ? (
                    <div className="gn-selbox-row">
                      <span className="gn-selbox-name">{kindOf(selected) === 'heading' && scope === 'all' ? nameOf('all:chtitle') : nameOf(selected)}</span>
                      <button type="button" className="btn btn-quiet btn-xs" onClick={() => setSelected(null)}>{t('pv.clearSel')}</button>
                    </div>
                  ) : null}
                  <p className="gn-hint">{!editable ? t('design.hintSnapshot') : selected ? t('pv.selectedHint') : t('design.hint')}</p>
                </div>
              </div>
            )}
            {tab === 'settings' && (
              <FormatPanel spec={fmt} deva={deva} saved={saved} disabled={!editable} onFormat={setFormat} onBlock={(k, op) => onBlock(k, op)}
                onResetAll={() => { commit(resetAll); setSelected(null); toast.show(t('gen.fp.resetDone'), { label: t('design.undo'), onClick: undo }); }}
                blankSpots={blankSpots} sections={renderSpec.ebook ? ['details', 'changes'] : ['details', 'blank', 'changes']}
                title={t('pv.details')} hint={t('pv.detailsHint')} />
            )}
            {tab === 'details' && (
              <section className="gn-about" aria-label={t('pv.thisPreview')}>
                <dl className="gn-about-dl">
                  <div className="is-wide"><dt>{t('pv.madeOn')}</dt><dd>{made}</dd></div>
                  <div><dt>{t(v.size === 'ebook' ? 'pv.screensL' : 'pv.pagesL')}</dt><dd>{fmtNumber(v.pages, lang)}</dd></div>
                  <div><dt>{t('pv.wordsL')}</dt><dd>{fmtNumber(v.words, lang)}</dd></div>
                </dl>
                <div className="gn-exports">
                  <span className="gn-fp-kick">{t('pv.exportsH')}</span>
                  {v.exports.length === 0 ? <span className="gn-exports-none">{t('pv.exportsNone')}</span> : (
                    <ul>
                      {v.exports.slice(0, 5).map((x, i) => (
                        <li key={i}><Icon name="download" size={12} />{x.kind.toUpperCase()} · {fmtDate(x.at, lang, { day: 'numeric', month: 'short' })}, {fmtTime(x.at, lang)}</li>
                      ))}
                    </ul>
                  )}
                  <p className="gn-hint">{t(kind === 'pdf' ? 'pv.whyPdf' : 'pv.whyEpub')}</p>
                </div>
                <div className="gn-about-act">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onRevert}><Icon name="undo" size={14} />{t('pv.revert')}</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}><Icon name="trash" size={14} />{t('pv.delete')}</button>
                </div>
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
