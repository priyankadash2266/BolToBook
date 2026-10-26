/**
 * Building blocks for lifecycle tab pages. Every tab page should start with <TabPage tabId="…">
 * so the header (stage, title, purpose) is consistent and translated.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/data/api';
import { useEntities, useProfile } from '@/data/hooks';
import type { Chapter, Entity, EntityKind } from '@/data/types';
import { useCurrentBook, bookPath } from '@/app/context';
import { useT } from '@/i18n';
import { TabArt } from './TabArt';
import { LiveWave } from './voice';
import { createDictationEngine, speechSupported, useMicLevel } from '@/lib/speech';
import { cleanTranscript, joinText, speechLocale, usesDevanagari } from '@/lib/text';
import { mentionCounts } from '@/lib/book';
import { useDebouncedCallback, useDeferredRemove } from '@/lib/hooks';
import { Icon } from './Icon';
import { useToast, useErrorNotice } from './Toast';
import './kit.css';

/* ------------------------------------------------------------------ */
/* Page frame                                                          */
/* ------------------------------------------------------------------ */

interface TabPageProps {
  tabId: string;
  /** Override the title/purpose from the lifecycle namespace. */
  title?: ReactNode;
  purpose?: ReactNode;
  actions?: ReactNode;
  /** Full-bleed layouts (boards, maps) can opt out of the max width. */
  wide?: boolean;
  children: ReactNode;
}

export function TabPage({ tabId, title, purpose, actions, wide, children }: TabPageProps) {
  const t = useT('lifecycle');
  const { book } = useCurrentBook();
  return (
    <div className={`kit-page${wide ? ' kit-page-wide' : ''}`}>
      <WipNote />
      <header className="kit-head">
        <div className="kit-head-text">
          {book && <div className="kit-stage"><span className="kit-stage-book">{book.title.trim() || ''}</span><span className="kit-stage-sep" aria-hidden="true" /><span>{t(`tabs.${tabId}.sub`)}</span></div>}
          <h1 className="display kit-title">{title ?? t(`tabs.${tabId}.label`)}</h1>
          <p className="kit-purpose">{purpose ?? t(`tabs.${tabId}.purpose`)}</p>
          {actions && <div className="kit-actions">{actions}</div>}
        </div>
        <TabArt id={tabId} className="kit-art" />
      </header>
      {children}
    </div>
  );
}

/** A labelled section inside a tab page. */
export function Section({ title, hint, actions, children, id }: { title: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="kit-section" id={id} aria-label={typeof title === 'string' ? title : undefined}>
      <div className="kit-section-head">
        <div>
          <h2 className="kit-section-title">{title}</h2>
          {hint && <p className="kit-section-hint">{hint}</p>}
        </div>
        {actions && <div className="kit-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Book helpers                                                        */
/* ------------------------------------------------------------------ */

/** True when the current book is written in Devanagari (or mixed). */
export function useDeva() {
  const { book } = useCurrentBook();
  return book ? usesDevanagari(book.lang) : false;
}

/** Book-text class for the author's own words (Devanagari-aware). */
export function useBookFont() {
  return useDeva() ? 'deva-book' : 'book';
}

export function chapterName(ch: Pick<Chapter, 'title' | 'order'>, index: number, tc: (k: string, v?: Record<string, string | number>) => string) {
  return ch.title.trim() || tc('chapterN', { n: index + 1 });
}

/* ------------------------------------------------------------------ */
/* Save state                                                          */
/* ------------------------------------------------------------------ */

export function SaveNote({ state }: { state: 'idle' | 'saving' | 'saved' }) {
  const t = useT('common');
  if (state === 'idle') return null;
  return <span className="kit-save" aria-live="polite">{state === 'saving' ? t('saving') : <><Icon name="check" size={13} /> {t('saved')}</>}</span>;
}

/* ------------------------------------------------------------------ */
/* Book fields (book.fields) — premise, promise, synopsis…             */
/* ------------------------------------------------------------------ */

/** Read/write one of the book's free-form fields with a debounced save. */
export function useBookField(key: string): [string, (v: string) => void, 'idle' | 'saving' | 'saved'] {
  const { book } = useCurrentBook();
  const [value, setValue] = useState(book?.fields[key] ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const lastEdit = useRef(0);
  useEffect(() => {
    if (Date.now() - lastEdit.current < 2000) return;
    setValue(book?.fields[key] ?? '');
  }, [book?.id, book?.fields[key]]); // eslint-disable-line react-hooks/exhaustive-deps
  const saver = useDebouncedCallback(async (v: string) => {
    if (!book) return;
    setState('saving');
    const fresh = await api.books.get(book.id);
    await api.books.update(book.id, { fields: { ...(fresh?.fields ?? {}), [key]: v } });
    setState('saved');
  }, 650);
  return [value, (v) => { lastEdit.current = Date.now(); setValue(v); saver.call(v); }, state];
}

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

/**
 * A list of the author's entries of one kind, with create / debounced update / delete-with-undo.
 * Local edits show instantly; saves are debounced per entry.
 */
export function useEntityCollection(kind: EntityKind, opts: { filter?: (e: Entity) => boolean; sort?: (a: Entity, b: Entity) => number } = {}) {
  const { book } = useCurrentBook();
  const t = useT('kit');
  const toast = useToast();
  const { data } = useEntities(book?.id, kind);
  const [local, setLocal] = useState<Record<string, Partial<Entity>>>({});
  const localRef = useRef(local);
  localRef.current = local;
  const dataRef = useRef(data);
  dataRef.current = data;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const del = useDeferredRemove((id) => api.entities.remove(id));

  const items = useMemo(() => {
    let rows = (data ?? []).filter((e) => !del.hidden.has(e.id)).map((e) => ({ ...e, ...local[e.id], fields: { ...e.fields, ...(local[e.id]?.fields ?? {}) } }) as Entity);
    if (opts.filter) rows = rows.filter(opts.filter);
    if (opts.sort) rows = [...rows].sort(opts.sort);
    return rows;
  }, [data, local, del.hidden, opts.filter, opts.sort]);

  const create = async (name = '', fields: Record<string, string> = {}) => {
    if (!book) return undefined;
    return api.entities.create({ bookId: book.id, kind, name, fields });
  };
  const update = (id: string, patch: { name?: string; fields?: Record<string, string> }) => {
    const merged = { ...localRef.current[id], ...patch, fields: { ...(localRef.current[id]?.fields ?? {}), ...(patch.fields ?? {}) } };
    localRef.current = { ...localRef.current, [id]: merged };
    setLocal(localRef.current);
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(async () => {
      timers.current.delete(id);
      const cur = (dataRef.current ?? []).find((e) => e.id === id);
      const pending = localRef.current[id] ?? {};
      await api.entities.update(id, { name: pending.name ?? cur?.name, fields: { ...(cur?.fields ?? {}), ...(pending.fields ?? {}) } });
      // Keep anything typed while the save was in flight.
      if (localRef.current[id] === pending) {
        const { [id]: _done, ...rest } = localRef.current;
        localRef.current = rest;
        setLocal(rest);
      }
    }, 600));
  };
  const remove = (e: Entity) => {
    del.schedule(e.id);
    toast.show(t('removed', { name: e.name || t('entry') }), { label: t('undo'), onClick: () => del.undo(e.id) }, 5000);
  };
  useEffect(() => () => { timers.current.forEach((tm) => clearTimeout(tm)); }, []);
  return { items, create, update, remove, loading: data === undefined };
}

/* ------------------------------------------------------------------ */
/* Voice-enabled text field: the author's own words, spoken or typed   */
/* ------------------------------------------------------------------ */

interface VoiceTextareaProps {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  rows?: number;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  /** Render in the book face (Devanagari-aware). */
  bookText?: boolean;
  className?: string;
  id?: string;
}

/** A textarea with a mic: dictation is cleaned (punctuation, fillers) and appended in the author's words. */
export function VoiceTextarea({ value, onChange, label, placeholder, rows = 4, hideLabel, bookText = true, className = '', id }: VoiceTextareaProps) {
  const t = useT('kit');
  const { book } = useCurrentBook();
  const { data: profile } = useProfile();
  const font = useBookFont();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useErrorNotice(err);
  const engine = useRef(createDictationEngine());
  const valueRef = useRef(value);
  valueRef.current = value;
  const level = useMicLevel(listening);
  const fid = id ?? `vt-${label.replace(/\W+/g, '-').toLowerCase()}`;
  useEffect(() => () => engine.current.abort(), []);

  const start = () => {
    setErr(null);
    engine.current.start(speechLocale(book?.lang ?? 'en', profile?.country ?? 'IN'), {
      onInterim: setInterim,
      onFinal: (f) => {
        const cur = valueRef.current;
        const clean = cleanTranscript(f, book?.lang ?? 'en', { capitalizeStart: !cur.trim() || /[.!?।]\s*$/.test(cur) }).text;
        onChange(joinText(cur, clean));
      },
      onState: (s) => setListening(s === 'listening' || s === 'starting'),
      onError: (e) => { setErr(e === 'unsupported' ? t('voice.unsupported') : e === 'not-allowed' ? t('voice.denied') : t('voice.error')); setListening(false); },
    });
  };
  const stop = () => { engine.current.stop(); setListening(false); };

  return (
    <div className={`kit-vt ${listening ? 'is-listening' : ''} ${!value.trim() && !interim ? 'is-empty' : ''} ${className}`}>
      <div className="kit-vt-head">
        <label htmlFor={fid} className={hideLabel ? 'sr-only' : 'label kit-vt-label'}>{label}</label>
        <button
          type="button"
          className={`kit-vt-mic ${listening ? 'is-on' : ''}`}
          onClick={listening ? stop : start}
          aria-pressed={listening}
          aria-label={listening ? t('voice.stop') : t('voice.speak', { field: label })}
          title={speechSupported() ? undefined : t('voice.unsupported')}
        >
          {listening ? <span className="kit-vt-stop" /> : <Icon name="mic" size={15} />}
          <span className="kit-vt-say" aria-hidden="true">{listening ? t('voice.stopShort') : t('voice.sayIt')}</span>
        </button>
      </div>
      <textarea
        id={fid}
        className={`textarea kit-vt-input ${bookText ? font : ''}`}
        value={value + (interim ? (value && !/\s$/.test(value) ? ' ' : '') + interim : '')}
        onChange={(e) => { setInterim(''); onChange(e.target.value); }}
        placeholder={placeholder}
        rows={rows}
        readOnly={listening}
      />
      {listening && (
        <div className="kit-vt-live" aria-hidden="true">
          <LiveWave active level={level} bars={40} height={20} barWidth={2} gap={2} color="var(--edit)" />
          <span>{t('voice.listening')}</span>
        </div>
      )}
    </div>
  );
}

/** Single-line text input with the same look. */
export function TextField({ label, value, onChange, placeholder, hideLabel, bookText, id }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hideLabel?: boolean; bookText?: boolean; id?: string }) {
  const font = useBookFont();
  const fid = id ?? `tf-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={fid} className={hideLabel ? 'sr-only' : 'label'}>{label}</label>
      <input id={fid} className={`input ${bookText ? font : ''}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chapters                                                            */
/* ------------------------------------------------------------------ */

export function ChapterSelect({ value, onChange, label, allowNone = true, id }: { value?: string; onChange: (id: string) => void; label: string; allowNone?: boolean; id?: string }) {
  const { chapters } = useCurrentBook();
  const tc = useT('common');
  const t = useT('kit');
  const fid = id ?? `chs-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={fid} className="label">{label}</label>
      <select id={fid} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {allowNone && <option value="">{t('noChapter')}</option>}
        {chapters.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {chapterName(c, i, tc)}</option>)}
      </select>
    </div>
  );
}

/** Link into the writing desk at a chapter (optionally a paragraph or a phrase). */
export function deskLink(bookId: string, chapterId: string, opts: { para?: number; find?: string } = {}) {
  const q = new URLSearchParams();
  if (opts.para !== undefined) q.set('para', String(opts.para));
  if (opts.find) q.set('find', opts.find);
  const qs = q.toString();
  return bookPath(bookId, 'write', chapterId) + (qs ? `?${qs}` : '');
}

/**
 * "Appears in": a strip with one cell per chapter, filled where `name` is written.
 * Detection only — it shows where the author's own words are.
 */
export function AppearsStrip({ name, compact }: { name: string; compact?: boolean }) {
  const t = useT('kit');
  const tc = useT('common');
  const { book, chapters } = useCurrentBook();
  const counts = useMemo(() => mentionCounts(name, chapters), [name, chapters]);
  if (!book || !chapters.length || !name.trim()) return null;
  const total = counts.reduce((s, c) => s + c, 0);
  const inCh = counts.filter((c) => c > 0).length;
  return (
    <div className={`kit-appears${compact ? ' is-compact' : ''}`}>
      {!compact && <div className="kit-appears-head"><span className="label">{t('appears.label')}</span><span className="faint">{total ? t('appears.count', { n: total, c: inCh }) : t('appears.none')}</span></div>}
      <div className="kit-strip" role="list" aria-label={t('appears.label')}>
        {chapters.map((ch, i) => {
          const c = counts[i] ?? 0;
          const lab = `${chapterName(ch, i, tc)}: ${c ? t('appears.times', { n: c }) : t('appears.notHere')}`;
          return c > 0
            ? <Link key={ch.id} role="listitem" className="kit-cell is-on" to={deskLink(book.id, ch.id, { find: name.trim() })} title={lab} aria-label={lab} />
            : <span key={ch.id} role="listitem" className="kit-cell" title={lab} aria-label={lab} />;
        })}
      </div>
    </div>
  );
}

/** A small "+ Add" row that creates an entry from a typed name. */
export function QuickAdd({ placeholder, onAdd, label }: { placeholder: string; onAdd: (name: string) => void; label: string }) {
  const [v, setV] = useState('');
  const t = useT('kit');
  return (
    <form className="kit-quickadd" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(''); } }}>
      <label className="sr-only" htmlFor={`qa-${label}`}>{label}</label>
      <input id={`qa-${label}`} className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!v.trim()}><Icon name="plus" size={16} />{t('add')}</button>
    </form>
  );
}

/** Empty-state block for tabs that need manuscript text first. */
export function NeedsManuscript() {
  const t = useT('kit');
  const { book } = useCurrentBook();
  if (!book) return null;
  return (
    <div className="empty">
      <h3>{t('needsText.title')}</h3>
      <p>{t('needsText.body')}</p>
      <Link className="btn btn-primary" to={bookPath(book.id, 'write')}><Icon name="feather" size={16} />{t('needsText.cta')}</Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Boxes: the one way to keep things. Every box has a title and a      */
/* description; + adds another. Dynamic, never a fixed form.           */
/* ------------------------------------------------------------------ */

/**
 * Which boxes are folded down to their title, remembered per box in this browser.
 * Stored as "everything folded?" plus the boxes that differ, so Fold all / Unfold all stay cheap.
 */
export interface BoxFolds {
  isFolded: (id: string) => boolean;
  set: (id: string, folded: boolean) => void;
  toggle: (id: string) => void;
  setAll: (folded: boolean) => void;
  /** True when every one of `ids` is folded. */
  allFolded: (ids: string[]) => boolean;
}

interface FoldStore { all: boolean; ex: string[] }
const foldKey = (scope: string) => `dictationer.folds.${scope}`;
const readFolds = (scope: string): FoldStore => {
  try {
    const raw = localStorage.getItem(foldKey(scope));
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v.all === 'boolean' && Array.isArray(v.ex)) return { all: v.all, ex: v.ex.filter((x: unknown) => typeof x === 'string') };
  } catch { /* storage unavailable */ }
  return { all: false, ex: [] };
};

/** Fold state for one list of boxes (`scope` should include the book id and the kind). */
export function useBoxFolds(scope: string): BoxFolds {
  const [st, setSt] = useState<FoldStore>(() => readFolds(scope));
  const first = useRef(true);
  useEffect(() => { setSt(readFolds(scope)); first.current = true; }, [scope]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { localStorage.setItem(foldKey(scope), JSON.stringify(st)); } catch { /* storage unavailable */ }
  }, [st, scope]);
  return useMemo(() => {
    const ex = new Set(st.ex);
    const isFolded = (id: string) => st.all !== ex.has(id);
    const set = (id: string, folded: boolean) => setSt((cur) => {
      const now = cur.all !== cur.ex.includes(id);
      if (now === folded) return cur;
      return { all: cur.all, ex: cur.ex.includes(id) ? cur.ex.filter((x) => x !== id) : [...cur.ex, id] };
    });
    return {
      isFolded,
      set,
      toggle: (id) => set(id, !isFolded(id)),
      setAll: (folded) => setSt({ all: folded, ex: [] }),
      allFolded: (ids) => ids.length > 0 && ids.every(isFolded),
    };
  }, [st]);
}

/** The pieces of one box, handed to `renderBox` so a page can lay them out its own way. */
export interface BoxParts {
  index: number;
  count: number;
  /** The title input (already labelled, focuses itself on a new box). */
  title: ReactNode;
  /** The description field (a VoiceTextarea). */
  desc: ReactNode;
  /** The optional notes field / opener, when `notes` is set. */
  notes: ReactNode;
  /** Order + remove buttons. */
  tools: ReactNode;
  /** Whatever `extra` returns for this box. */
  extra: ReactNode;
  update: (patch: { name?: string; fields?: Record<string, string> }) => void;
  remove: () => void;
  move: (d: -1 | 1) => void;
  /** Add an empty box straight after this one. */
  insertAfter: () => void;
  /** Folded down to its title (only when `folds` is passed). */
  folded: boolean;
  toggleFold: () => void;
}

/** What `renderAdd` gets to build its own "add" card. */
export interface BoxAddApi {
  /** Create a box (optionally already filled) at the end and focus it. */
  add: (name?: string, fields?: Record<string, string>) => Promise<Entity | undefined>;
  empty: boolean;
  loading: boolean;
}

interface BoxListProps {
  kind: EntityKind;
  /** Only boxes matching this (e.g. a sub-group). */
  filter?: (e: Entity) => boolean;
  /** Fields stamped on new boxes. */
  stamp?: Record<string, string>;
  titleLabel: string;
  titlePlaceholder?: string;
  descLabel: string;
  descPlaceholder?: string;
  addLabel: string;
  /** Shown when there are no boxes yet. */
  emptyHint?: string;
  /** Extra content inside each box (detections, links…). */
  extra?: (e: Entity) => ReactNode;
  /** Optional third text field (e.g. notes), collapsed until opened. */
  notes?: { key: string; label: string; placeholder?: string };
  columns?: 1 | 2;
  /** Show order controls. */
  ordered?: boolean;
  /** A named look (adds `kit-boxes-v-<variant>` / `kit-box-v-<variant>` classes for page styling). */
  variant?: string;
  /** Lay out a box's pieces yourself. The box keeps its <article id="box-<id>"> wrapper. */
  renderBox?: (e: Entity, parts: BoxParts) => ReactNode;
  /** Replace the default "+" card. */
  renderAdd?: (api: BoxAddApi) => ReactNode;
  /** Rows of the description field (default 3). */
  descRows?: number;
  /** Fold state (from `useBoxFolds`); new boxes always open unfolded. */
  folds?: BoxFolds;
  /** Show the description's label on its header row (beside the Say it pill) instead of hiding it. */
  showDescLabel?: boolean;
}

const ordOf = (e: Entity) => { const o = Number(e.fields.order ?? 0); return isFinite(o) ? o : 0; };

export function BoxList({ kind, filter, stamp, titleLabel, titlePlaceholder, descLabel, descPlaceholder, addLabel, emptyHint, extra, notes, columns = 2, ordered, variant, renderBox, renderAdd, descRows = 3, folds, showDescLabel }: BoxListProps) {
  const t = useT('kit');
  const font = useBookFont();
  const { book } = useCurrentBook();
  const { items: raw, create, update, remove, loading } = useEntityCollection(kind, { filter });
  /** What is actually stored (no local edits), to know when a new order has been saved. */
  const { data: stored } = useEntities(book?.id, kind);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  /**
   * Orders we have just set, kept until the stored data agrees. Without this a move shows, flips back when
   * the debounced save clears the local edit (before the list reloads), then flips forward again.
   */
  const [pinned, setPinned] = useState<Record<string, number>>({});
  const busy = useRef(false);

  const items = useMemo(() => {
    const ord = (e: Entity) => (e.id in pinned ? pinned[e.id] : ordOf(e));
    return [...raw].sort((a, b) => (ord(a) - ord(b)) || a.createdAt.localeCompare(b.createdAt));
  }, [raw, pinned]);
  const orderOf = (e: Entity) => (e.id in pinned ? pinned[e.id] : ordOf(e));

  // Forget pins once the stored order has caught up (or the box is gone).
  useEffect(() => {
    const ids = Object.keys(pinned);
    if (!ids.length || !stored) return;
    const left = ids.filter((id) => { const e = stored.find((x) => x.id === id); return e && ordOf(e) !== pinned[id]; });
    if (left.length !== ids.length) setPinned((p) => Object.fromEntries(left.map((id) => [id, p[id]])));
  }, [stored, pinned]);

  /** Set several orders at once: shown instantly, saved through the same debounced path as typing. */
  const setOrders = (next: Record<string, number>) => {
    if (!Object.keys(next).length) return;
    setPinned((p) => ({ ...p, ...next }));
    Object.entries(next).forEach(([id, o]) => update(id, { fields: { order: String(o) } }));
  };
  /** Distinct whole orders (1, 2, 3…) when two boxes share one, so moves and inserts always land. */
  const normalised = () => {
    const seen = new Set<number>();
    const clash = items.some((e) => { const o = orderOf(e); if (seen.has(o)) return true; seen.add(o); return false; });
    if (!clash) return items.map(orderOf);
    const next: Record<string, number> = {};
    items.forEach((e, i) => { if (orderOf(e) !== i + 1) next[e.id] = i + 1; });
    setOrders(next);
    return items.map((_, i) => i + 1);
  };
  const born = (e: Entity | undefined) => {
    if (!e) return;
    setFocusId(e.id);
    setFresh((s) => new Set(s).add(e.id));
    folds?.set(e.id, false);
  };
  const add = async (name = '', fields: Record<string, string> = {}) => {
    const max = items.reduce((m, e) => Math.max(m, orderOf(e)), 0);
    const e = await create(name, { ...(stamp ?? {}), order: String(Math.floor(max) + 1), description: '', ...fields });
    born(e);
    return e;
  };
  const insertAfter = async (i: number) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const orders = normalised();
      const here = orders[i] ?? 0;
      const next = orders[i + 1];
      const o = next === undefined ? Math.floor(here) + 1 : (here + next) / 2;
      born(await create('', { ...(stamp ?? {}), order: String(o), description: '' }));
    } finally { busy.current = false; }
  };
  const move = (i: number, d: -1 | 1) => {
    const a = items[i], b = items[i + d];
    if (!a || !b) return;
    const orders = normalised();
    setOrders({ [a.id]: orders[i + d], [b.id]: orders[i] });
  };
  return (
    <div className={`kit-boxes kit-boxes-${columns}${variant ? ` kit-boxes-v-${variant}` : ''}${!loading && !items.length ? ' is-empty' : ''}`}>
      {items.map((e, i) => {
        const folded = !!folds?.isFolded(e.id);
        const title = (
          <>
            <label className="sr-only" htmlFor={`bx-t-${e.id}`}>{titleLabel}</label>
            <input
              id={`bx-t-${e.id}`}
              className={`kit-box-title ${font}`}
              value={e.name}
              placeholder={titlePlaceholder ?? titleLabel}
              autoFocus={focusId === e.id}
              onChange={(ev) => update(e.id, { name: ev.target.value })}
            />
          </>
        );
        const tools = (
          <div className="kit-box-tools">
            {ordered && <>
              <button type="button" className="kit-iconbtn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('box.up')}><Icon name="up" size={15} /></button>
              <button type="button" className="kit-iconbtn" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={t('box.down')}><Icon name="down" size={15} /></button>
            </>}
            <button type="button" className="kit-iconbtn" onClick={() => remove(e)} aria-label={t('box.remove')}><Icon name="trash" size={15} /></button>
          </div>
        );
        const desc = (
          <VoiceTextarea
            label={descLabel}
            hideLabel={!showDescLabel}
            id={`bx-d-${e.id}`}
            value={e.fields.description ?? ''}
            onChange={(v) => update(e.id, { fields: { description: v } })}
            placeholder={descPlaceholder ?? descLabel}
            rows={descRows}
          />
        );
        const notesEl = notes && (openNotes.has(e.id) || (e.fields[notes.key] ?? '').trim()) ? (
          <VoiceTextarea label={notes.label} id={`bx-n-${e.id}`} value={e.fields[notes.key] ?? ''} onChange={(v) => update(e.id, { fields: { [notes.key]: v } })} placeholder={notes.placeholder} rows={2} />
        ) : notes ? (
          <button type="button" className="kit-linkbtn" onClick={() => setOpenNotes((s) => new Set(s).add(e.id))}><Icon name="plus" size={14} />{notes.label}</button>
        ) : null;
        const ex = extra?.(e);
        return (
          <article key={e.id} id={`box-${e.id}`} className={`kit-box${variant ? ` kit-box-v-${variant}` : ''}${fresh.has(e.id) ? ' is-new' : ''}${folded ? ' is-folded' : ''}`} aria-label={e.name || titleLabel}>
            {renderBox ? renderBox(e, {
              index: i, count: items.length, title, desc, notes: notesEl, tools, extra: ex,
              update: (patch) => update(e.id, patch), remove: () => remove(e), move: (d) => move(i, d), insertAfter: () => { void insertAfter(i); },
              folded, toggleFold: () => folds?.toggle(e.id),
            }) : <>
              <div className="kit-box-top">{title}{tools}</div>
              {!folded && <>
                {desc}
                {notesEl}
                {ex}
              </>}
            </>}
          </article>
        );
      })}
      {renderAdd ? renderAdd({ add, empty: !items.length, loading }) : (
        <button type="button" className="kit-addbox" onClick={() => { void add(); }}>
          <span className="kit-addbox-plus" aria-hidden="true"><Icon name="plus" size={22} /></span>
          <span className="kit-addbox-label">{addLabel}</span>
          {!items.length && emptyHint && <span className="kit-addbox-hint">{emptyHint}</span>}
        </button>
      )}
    </div>
  );
}

/** Shown on book types whose workspace is still being shaped. */
export function WipNote() {
  const t = useT('kit');
  const { book } = useCurrentBook();
  if (!book || book.type !== 'nonfiction') return null;
  return <div className="kit-wip" role="note"><Icon name="flag" size={15} />{t('wip')}</div>;
}
