import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Editor as TEditor } from '@tiptap/react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/data/api';
import { useEntities, useLaps, useManuscript, useVersions } from '@/data/hooks';
import { bookPath, useCurrentBook } from '@/app/context';
import { useT } from '@/i18n';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { MicOrb } from '@/components/voice';
import { TabArt } from '@/components/TabArt';
import { deskLink } from '@/components/kit';
import { SelectionBar } from './editor/SelectionBar';
import type { Chapter } from '@/data/types';
import { cleanTranscript, countWords, escapeRegExp, isDevanagari, speechLocale, toParagraphs, usesDevanagari } from '@/lib/text';
import { blockHtml, parseBlock, plainOf, plainToMd, toPlain } from '@/lib/markdown';
import { createDictationEngine, speechSupported, useMicLevel, type DictationEngine, type DictationError } from '@/lib/speech';
import { applyProposal, proposeEdit, type Proposal } from '@/lib/voiceEdit';
import { wordDiff } from '@/lib/diff';
import type { Hit } from '@/lib/search';
import { useDraft } from './editor/useDraft';
import { Dock, type LiveView, type VePhase } from './editor/Dock';
import { Rail } from './editor/Rail';
import { Margin } from './editor/Margin';
import { FindModal } from './editor/FindModal';
import { spokenCommand } from './editor/command';
import { ManuscriptPanel } from '@/screens/tabs/write/ManuscriptPanel';
import { RichText, type CaretTarget, type DeskEditorHandle, type DeskSelection } from './editor/RichText';
import { Toolbar } from './editor/Toolbar';
import {
  LEAD_PARA, TRAIL_PARA, clip, entitiesIn, isolateChapter, prefersReducedMotion,
  proposalAsHit, rebuildInstruction, wait, type Seg,
} from './editor/util';
import './editor/editor.css';
import '@/screens/tabs/write/write.css';

function useMedia(q: string) {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

const lsGet = (k: string, d: boolean) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
const lsSet = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* */ } };

interface Highlight { paraIndex: number; ranges: [number, number][]; key: number; label?: string }
interface Pending { chapterId: string; highlight?: Omit<Highlight, 'key'>; proposal?: Proposal; voice?: boolean }
interface DictNote { n: number; changes: string[]; pre: string; chapterId: string }
/** Where dictation writes: the Markdown before it started, the editor position, and the words around it in that block. */
interface DictCtx { pre: string; pos: number; before: string; after: string; chapterId: string }
interface VeMsg { kind: 'unparsed' | 'not-found' | 'empty-book'; q?: string }
/** A spoken change heard inside dictation: what was said, and where it would have gone as prose (an editor position). */
interface Spoken { utterance: string; caret: number; docId: string }

function rangesOf(text: string, needle: string): [number, number][] {
  const n = needle.trim();
  if (!n) return [];
  const re = new RegExp(escapeRegExp(n).replace(/\s+/g, '\\s+'), 'gi');
  const out: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { out.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex++; }
  return out;
}

/**
 * The writing desk. One page, one voice button.
 *  - mode 'chapter' (/write/:chapterId): a chapter, with its outline and ideas in the margin.
 *  - mode 'draft'   (/manuscript): the book's free-writing manuscript; select a passage to move it into a chapter.
 * Dictation writes what the author says; a clear spoken change ("change X to Y") is shown as a proposal instead.
 */
export default function Editor({ mode = 'chapter' }: { mode?: 'chapter' | 'draft' }) {
  const isDraft = mode === 'draft';
  const t = useT('editor');
  const tc = useT('common');
  const tw = useT('write');
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const { bookId = '', chapterId } = useParams();
  const [params, setParams] = useSearchParams();
  const { book, chapters, loading, profile } = useCurrentBook();
  const { data: entitiesData } = useEntities(bookId);
  const entities = useMemo(() => entitiesData ?? [], [entitiesData]);
  const { data: manuscript } = useManuscript(bookId);
  const { data: lapsData } = useLaps({ bookId });
  const { data: msVersions } = useVersions(isDraft && manuscript ? bookId : undefined, manuscript?.id);

  const phone = useMedia('(max-width: 760px)');
  const narrow = useMedia('(max-width: 1099px)');
  const supported = useMemo(() => speechSupported(), []);
  const lang = book?.lang ?? 'en';
  const deva = usesDevanagari(lang);
  const locale = speechLocale(lang, profile?.country ?? book?.country ?? 'OTHER');

  const chapter: Chapter | undefined = isDraft ? manuscript : chapters.find((c) => c.id === chapterId);
  const chapterIndex = !isDraft && chapter ? chapters.indexOf(chapter) : -1;
  const chapterNumber = chapterIndex + 1;
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : undefined;
  const laps = useMemo(() => (!isDraft && chapter ? (lapsData ?? []).filter((l) => l.chapterId === chapter.id) : []), [isDraft, chapter, lapsData]);
  const moved = useMemo(() => (msVersions ?? []).filter((v) => v.chapterId === manuscript?.id && v.command?.startsWith('move:')).length, [msVersions, manuscript?.id]);
  const msName = t('page.msShort');
  const docName = useCallback((id: string) => {
    if (manuscript && id === manuscript.id) return msName;
    return t('find.chapterN', { n: chapters.findIndex((c) => c.id === id) + 1 });
  }, [manuscript, msName, chapters, t]);

  const [sel, setSel] = useState<DeskSelection | null>(null);
  const [moveSignal, setMoveSignal] = useState(0);
  const draft = useDraft(chapter, (a, r) => t('versions.typing', { a, r }));
  const text = draft.text;
  const loaded = !!chapter && draft.loadedId === chapter.id;

  // ---------- Layout state ----------
  const marginKey = isDraft ? 'ed.margin.ms' : 'ed.margin';
  const [marginOpen, setMarginOpen] = useState(() => lsGet(marginKey, true));
  const [marginOverlay, setMarginOverlay] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => lsSet(marginKey, marginOpen), [marginKey, marginOpen]);
  useEffect(() => { setDrawer(false); setMarginOverlay(false); }, [chapterId]);

  // ---------- Announcements ----------
  const [said, setSaid] = useState('');
  const announce = useCallback((s: string) => { setSaid(''); setTimeout(() => setSaid(s), 30); }, []);
  const lastSave = useRef(draft.saveState);
  useEffect(() => {
    if (lastSave.current === 'saving' && draft.saveState === 'saved') announce(t('announce.saved'));
    lastSave.current = draft.saveState;
  }, [draft.saveState, announce, t]);

  // ---------- Routing (chapters): the chapter asked for, else the most recent one, else the Chapters tab ----------
  useEffect(() => {
    if (isDraft || loading || !book) return;
    const recent = () => {
      if (!chapters.length) { nav(bookPath(bookId, 'chapters'), { replace: true }); return; }
      const r = [...chapters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      nav(bookPath(bookId, 'write', r.id) + loc.search, { replace: true });
    };
    if (!chapterId) { recent(); return; }
    if (chapters.some((c) => c.id === chapterId)) return;
    // A chapter created a moment ago may not be in the list yet; check before moving on.
    let alive = true;
    api.chapters.get(chapterId).then((c) => {
      if (alive && (!c || c.bookId !== bookId || c.role === 'draft')) recent();
    }).catch(() => { if (alive) recent(); });
    return () => { alive = false; };
  }, [isDraft, loading, book, chapters, chapterId, bookId, nav, loc.search]);

  // ---------- View: the rich-text page (edit) or a read-only page showing a proposed change (read) ----------
  const [view, setView] = useState<'edit' | 'read'>('edit');
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const rtRef = useRef<DeskEditorHandle>(null);
  const [rich, setRich] = useState<TEditor | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingCaret = useRef<CaretTarget | 'keep' | null>(null);
  const [, setCaretTick] = useState(0);
  const firstLoad = useRef<string | undefined>(undefined);

  // Put the caret back after returning to the page (runs after the editor has loaded any new text).
  useLayoutEffect(() => {
    if (view !== 'edit' || pendingCaret.current === null || !rtRef.current) return;
    const target = pendingCaret.current;
    pendingCaret.current = null;
    rtRef.current.focusAt(target === 'keep' ? undefined : target);
  });

  const toEdit = useCallback((target?: CaretTarget) => {
    pendingCaret.current = target ?? 'keep';
    setHighlight(null);
    setView('edit');
    setCaretTick((n) => n + 1);
  }, []);

  /** Shows a found paragraph on the page (words marked), without leaving the editor. */
  const showPara = useCallback((h: Omit<Highlight, 'key'>) => {
    setHighlight({ ...h, key: Date.now() });
    setView('edit');
  }, []);

  // Scroll the proposed change into view (read view).
  useEffect(() => {
    if (!highlight || view !== 'read') return;
    const el = document.getElementById(`p-${highlight.paraIndex}`);
    const sc = scrollRef.current;
    if (!el || !sc) return;
    const y = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    sc.scrollTo({ top: Math.max(0, y - sc.clientHeight / 4), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [highlight, view]);

  // On first open of a page, start at the top.
  useEffect(() => {
    if (!loaded || firstLoad.current === chapter?.id) return;
    firstLoad.current = chapter?.id;
    setView('edit');
    setHighlight(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [loaded, chapter?.id]);

  // ---------- Title (chapters only) ----------
  const [title, setTitle] = useState('');
  const titleDirty = useRef(false);
  const titlePending = useRef<{ id: string; title: string } | null>(null);
  const flushTitle = useCallback(() => {
    const p = titlePending.current;
    titlePending.current = null;
    if (p) api.chapters.update(p.id, { title: p.title.trim() }).catch(() => {}).finally(() => { titleDirty.current = false; });
  }, []);
  useEffect(() => { if (!titleDirty.current) setTitle(chapter?.title ?? ''); }, [chapter?.title, chapter?.id]);
  useEffect(() => {
    titleDirty.current = false;
    setTitle(chapter?.title ?? '');
    return () => flushTitle();
  }, [chapter?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTitle = (v: string) => {
    if (!chapter || isDraft) return;
    titleDirty.current = true;
    setTitle(v);
    titlePending.current = { id: chapter.id, title: v };
  };
  useEffect(() => {
    if (!titlePending.current) return;
    const h = setTimeout(flushTitle, 600);
    return () => clearTimeout(h);
  }, [title, flushTitle]);

  // ---------- Pages a spoken change can reach ----------
  const liveChapters = useCallback((): Chapter[] => {
    if (isDraft) return chapter ? [{ ...chapter, content: draft.loadedId === chapter.id ? draft.textRef.current : chapter.content }] : [];
    return chapters.map((c) => (c.id === draft.loadedId ? { ...c, content: draft.textRef.current } : c));
  }, [isDraft, chapter, chapters, draft]);
  const liveChaptersRef = useRef(liveChapters);
  liveChaptersRef.current = liveChapters;
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  // ---------- Dictation ----------
  const dictEngine = useRef<DictationEngine | null>(null);
  const [dictState, setDictState] = useState<'idle' | 'starting' | 'listening' | 'stopping'>('idle');
  const [finals, setFinals] = useState('');
  const [interim, setInterim] = useState('');
  const [liveView, setLiveView] = useState<LiveView>('clean');
  const [voiceError, setVoiceError] = useState<string | undefined>();
  const [note, setNote] = useState<DictNote | null>(null);
  const dictCtx = useRef<DictCtx | null>(null);
  const finalsRef = useRef('');
  const interimRef = useRef('');
  const finalAfterStop = useRef(false);
  const dictStopping = useRef(false);
  const dictErrored = useRef(false);
  const dictSession = useRef(0);
  /** A spoken change heard in this dictation; the rest of the session is not written. */
  const cmdCut = useRef<string | null>(null);
  const runEditRef = useRef<(instr: string, opts?: { preferHit?: Hit; alternatives?: Hit[]; spoken?: Spoken }) => Promise<void>>(async () => {});
  const dictating = dictState !== 'idle';

  const errText = useCallback((e: DictationError) => (
    e === 'not-allowed' ? tc('voice.denied') : e === 'network' ? tc('voice.network') : e === 'unsupported' ? tc('voice.unsupported') : tc('voice.error')
  ), [tc]);

  const cleanInsert = useCallback((raw: string, before: string, after: string, final: boolean) => {
    let r = raw.trim();
    let lead = '', trail = '';
    if (LEAD_PARA.test(r)) { r = r.replace(LEAD_PARA, '').trim(); lead = '\n\n'; }
    if (TRAIL_PARA.test(r)) { r = r.replace(TRAIL_PARA, '').trim(); trail = '\n\n'; }
    const startSentence = !!lead || !before.trim() || /([.!?।…:"”]|\n)\s*$/.test(before);
    const midSentence = /^\s*[a-z]/.test(after);
    const c = r ? cleanTranscript(r, lang, { capitalizeStart: startSentence, endSentence: final && !midSentence }) : { text: '', changes: [] as string[] };
    return { text: c.text ? lead + c.text + trail : '', changes: c.changes };
  }, [lang]);

  /** Spacing for words placed between `before` and `after` (both in the same block). */
  const spaced = (text: string, before: string, after: string) => {
    let ins = text;
    if (!ins.startsWith('\n') && before && !/\s$/.test(before)) ins = ' ' + ins;
    if (!ins.endsWith('\n') && after && !/^\s/.test(after)) ins += ' ';
    return ins;
  };

  /** Writes spoken words into the open page at an editor position, as plain text. The caller commits the version. */
  const placeWords = useCallback((pos: number, raw: string) => {
    const h = rtRef.current;
    if (!h) return null;
    const { before, after } = h.context(pos);
    const c = cleanInsert(raw, before, after, true);
    if (!c.text) return null;
    const caret = h.insertPlain(pos, spaced(c.text, before, after));
    return { content: h.md(), caret, words: countWords(c.text), changes: c.changes };
  }, [cleanInsert]);

  /** Spoken words for a page that is not open: a new paragraph at its end. */
  const appendWords = useCallback((md: string, raw: string) => {
    const c = cleanInsert(raw, '', '', true);
    if (!c.text.trim()) return null;
    const add = plainToMd(c.text.trim());
    const base = md.replace(/\s+$/, '');
    return { content: base ? `${base}\n\n${add}` : add, words: countWords(c.text), changes: c.changes };
  }, [cleanInsert]);

  const finishDictation = useCallback(async () => {
    const ctx = dictCtx.current;
    if (!ctx) return;
    dictCtx.current = null;
    let raw = finalsRef.current;
    if (!finalAfterStop.current && interimRef.current.trim()) raw = (raw + ' ' + interimRef.current).trim();
    const cmd = cmdCut.current;
    cmdCut.current = null;
    finalsRef.current = ''; interimRef.current = '';
    setFinals(''); setInterim(''); setDictState('idle');
    announce(cmd ? t('announce.heardChange') : t('announce.stopped'));
    const here = ctx.chapterId === draft.loadedId && !!rtRef.current;
    let caret = ctx.pos;
    let ins: { content: string; words: number; changes: string[]; caret?: number } | null = null;
    if (raw.trim()) {
      if (here) ins = placeWords(ctx.pos, raw);
      else {
        const cur = (await api.chapters.get(ctx.chapterId))?.content ?? ctx.pre;
        ins = appendWords(cur, raw);
      }
    }
    if (!ins) {
      if (!cmd && raw.trim() === '' && !dictErrored.current) toast.show(t('dictation.nothing'));
      toEdit(ctx.pos);
    } else {
      const summary = ins.words === 1 ? t('dictation.summaryOne') : t('dictation.summary', { n: ins.words });
      if (here) await draft.commit(ins.content, { source: 'dictation', summary });
      else await api.chapters.update(ctx.chapterId, { content: ins.content }, { source: 'dictation', summary });
      setNote({ n: ins.words, changes: ins.changes, pre: ctx.pre, chapterId: ctx.chapterId });
      if (ins.caret !== undefined) caret = ins.caret;
      toEdit(caret);
    }
    if (cmd) void runEditRef.current(cmd, { spoken: { utterance: cmd, caret, docId: ctx.chapterId } });
  }, [announce, placeWords, appendWords, draft, t, toEdit, toast]);

  const finishRef = useRef(finishDictation);
  finishRef.current = finishDictation;

  const stopDictation = useCallback(() => {
    if (!dictCtx.current) return;
    dictStopping.current = true;
    setDictState('stopping');
    dictEngine.current?.stop();
  }, []);

  const startDictation = useCallback(async (at?: CaretTarget) => {
    const h = rtRef.current;
    if (!supported || !chapter || dictCtx.current || !h) return;
    setVoiceError(undefined);
    setNote(null);
    if (at !== undefined) h.focusAt(at);
    const pos = h.caret();
    await draft.checkpoint();
    const around = h.context(pos);
    dictCtx.current = { pre: draft.textRef.current, pos, before: around.before, after: around.after, chapterId: chapter.id };
    finalsRef.current = ''; interimRef.current = ''; finalAfterStop.current = false; dictErrored.current = false; cmdCut.current = null;
    setFinals(''); setInterim('');
    setHighlight(null);
    setSel(null);
    setView('edit');
    setDictState('starting');
    dictEngine.current?.abort();
    dictEngine.current = createDictationEngine();
    const my = ++dictSession.current;
    dictEngine.current.start(locale, {
      onInterim: (s) => { if (my !== dictSession.current || cmdCut.current !== null) return; interimRef.current = s; setInterim(s); },
      onFinal: (s) => {
        if (my !== dictSession.current || cmdCut.current !== null) return;
        const utter = s.trim();
        const ctx = dictCtx.current;
        // A clear spoken change, on its own after a pause, pointing at words on the page: show it, don't write it.
        if (utter && ctx && !dictStopping.current) {
          const sofar = finalsRef.current;
          const docs = liveChaptersRef.current().map((c) => (c.id === ctx.chapterId
            ? { ...c, content: ctx.pre + (sofar ? `\n\n${plainToMd(sofar)}` : '') }
            : c));
          const cmd = spokenCommand(utter, docs, entitiesRef.current);
          if (cmd) {
            cmdCut.current = cmd;
            interimRef.current = '';
            setInterim('');
            stopDictation();
            return;
          }
        }
        finalsRef.current = (finalsRef.current + ' ' + utter).trim();
        setFinals(finalsRef.current);
        if (dictStopping.current) finalAfterStop.current = true;
      },
      onState: (s) => {
        if (my !== dictSession.current) return;
        if (s === 'listening') { setDictState('listening'); announce(t('announce.listening')); }
        if (s === 'idle' || s === 'error') { dictStopping.current = false; void finishRef.current(); }
      },
      onError: (e) => { if (my !== dictSession.current) return; dictErrored.current = true; setVoiceError(errText(e)); },
    });
  }, [supported, chapter, draft, locale, announce, t, errText, stopDictation]);

  useEffect(() => () => { dictEngine.current?.abort(); }, []);
  // Leaving the chapter mid-dictation keeps what was said in the chapter it was said into.
  useEffect(() => { if (dictCtx.current && dictCtx.current.chapterId !== chapter?.id) stopDictation(); }, [chapter?.id, stopDictation]);

  const undoDictation = async () => {
    if (!note) return;
    const n = note;
    setNote(null);
    const summary = n.n === 1 ? t('dictation.summaryOne') : t('dictation.summary', { n: n.n });
    if (n.chapterId === draft.loadedId) await draft.commit(n.pre, { source: 'restore', summary });
    else await api.chapters.update(n.chapterId, { content: n.pre }, { source: 'restore', summary });
    toast.show(t('dictation.undone'));
  };
  useEffect(() => { if (note && note.chapterId !== chapter?.id) setNote(null); }, [chapter?.id, note]);

  // Live words shown in the page at the caret: settled words + words still being heard + a caret.
  const ghost = useMemo<{ pos: number; segs: Seg[] } | null>(() => {
    const ctx = dictCtx.current;
    if (!dictating || !ctx) return null;
    const { before, after } = ctx;
    let settled = liveView === 'clean' ? cleanInsert(finals, before, after, false).text : finals.trim();
    let live = interim.trim();
    if (liveView === 'clean' && live) {
      const lv = cleanInsert(live, before + settled, after, false).text;
      live = lv || live;
    }
    const joined = settled || live;
    const lead = joined && !joined.startsWith('\n') && before && !/\s$/.test(before) ? ' ' : '';
    if (settled && live && !/\s$/.test(settled)) settled += ' ';
    const tail = after && !/^\s/.test(after) && joined ? ' ' : '';
    return { pos: ctx.pos, segs: [{ t: lead + settled }, { t: live, cls: 'live' }, { t: '', caret: true }, { t: tail }] };
  }, [dictating, finals, interim, liveView, cleanInsert]);

  // Keep the live words in view as the page grows.
  useEffect(() => {
    if (!dictating) return;
    const el = document.getElementById('ed-live-caret');
    const sc = scrollRef.current;
    if (!el || !sc) return;
    const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
    if (r.bottom > s.bottom - 60 || r.top < s.top + 40) {
      sc.scrollTo({ top: sc.scrollTop + (r.top - s.top) - sc.clientHeight * 0.55, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [ghost, dictating]);

  // ---------- Spoken changes: find, show, the author decides ----------
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState<string | undefined>();
  const [vePhase, setVePhase] = useState<VePhase>('idle');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [lastInstruction, setLastInstruction] = useState('');
  const [spoken, setSpoken] = useState<Spoken | null>(null);
  const [veMsg, setVeMsg] = useState<VeMsg | null>(null);
  const [changing, setChanging] = useState(false);
  const [changeWords, setChangeWords] = useState('');
  const [othersOpen, setOthersOpen] = useState(false);
  const [backTo, setBackTo] = useState<{ chapterId: string; n: number } | null>(null);
  const [scanId, setScanId] = useState<string | undefined>();
  const [pending, setPending] = useState<Pending | null>(null);
  const runSeq = useRef(0);

  const endEditFlow = useCallback(() => {
    runSeq.current++;
    setProposal(null); setVeMsg(null); setChanging(false); setOthersOpen(false); setScanId(undefined); setSpoken(null);
    setVePhase('idle');
  }, []);

  /** The spoken change was really the author's sentence: write it in where it was said. */
  const writeSpoken = useCallback(async (sp: Spoken) => {
    endEditFlow();
    const here = sp.docId === draft.loadedId && !!rtRef.current;
    if (here) {
      setView('edit');
      const ins = placeWords(sp.caret, sp.utterance);
      if (!ins) return;
      const summary = ins.words === 1 ? t('dictation.summaryOne') : t('dictation.summary', { n: ins.words });
      await draft.commit(ins.content, { source: 'dictation', summary });
      toEdit(ins.caret);
    } else {
      const cur = (await api.chapters.get(sp.docId))?.content;
      if (cur === undefined) return;
      const ins = appendWords(cur, sp.utterance);
      if (!ins) return;
      const summary = ins.words === 1 ? t('dictation.summaryOne') : t('dictation.summary', { n: ins.words });
      await api.chapters.update(sp.docId, { content: ins.content }, { source: 'dictation', summary });
    }
    toast.show(t('ve.wroteWords'));
  }, [endEditFlow, draft, placeWords, appendWords, t, toEdit, toast]);

  const runEdit = useCallback(async (instr: string, opts: { preferHit?: Hit; alternatives?: Hit[]; spoken?: Spoken } = {}) => {
    const cmdText = instr.trim();
    if (!cmdText || !chapter) return;
    const my = ++runSeq.current;
    setVeMsg(null); setProposal(null); setChanging(false); setOthersOpen(false);
    if (opts.spoken) setSpoken(opts.spoken);
    setLastInstruction(cmdText);
    setVePhase('understand');
    await draft.checkpoint();
    await wait(380);
    if (my !== runSeq.current) return;
    setVePhase('find');
    const all = liveChapters();
    // Show the search walking the chapters briefly.
    if (!prefersReducedMotion() && !isDraft) {
      for (const c of all.slice(0, 10)) { setScanId(c.id); await wait(45); if (my !== runSeq.current) return; }
    }
    let res;
    const hit = opts.preferHit;
    if (hit) {
      const target = all.find((c) => c.id === hit.chapterId);
      const iso = target ? [isolateChapter(target, hit.paraIndex)] : all;
      res = proposeEdit(cmdText, iso, { entities, preferHit: hit });
      if (res.ok && target) res.proposal.before = toParagraphs(target.content)[res.proposal.paraIndex];
    } else {
      res = proposeEdit(cmdText, all, { entities });
    }
    setScanId(undefined);
    if (my !== runSeq.current) return;
    if (!res.ok) {
      // Heard as a change but nothing matches now: it was prose after all.
      if (opts.spoken) { void writeSpoken(opts.spoken); return; }
      setVePhase('error');
      const q = res.command?.target ?? res.command?.locator;
      setVeMsg({ kind: res.reason, q });
      announce(t('announce.notFound'));
      return;
    }
    const prop: Proposal = { ...res.proposal, alternatives: opts.alternatives ?? res.proposal.alternatives };
    setScanId(prop.chapterId);
    if (prop.chapterId !== chapter.id) {
      setBackTo((b) => b ?? { chapterId: chapter.id, n: chapterNumber });
      setPending({ chapterId: prop.chapterId, proposal: prop });
      nav(bookPath(bookId, 'write', prop.chapterId));
    } else {
      setPending({ chapterId: prop.chapterId, proposal: prop });
    }
  }, [chapter, draft, liveChapters, isDraft, entities, announce, t, chapterNumber, nav, bookId, writeSpoken]);
  runEditRef.current = runEdit;

  const presentProposal = useCallback(async (prop: Proposal) => {
    const my = runSeq.current;
    setProposal(prop);
    setVePhase('show');
    setHighlight({ paraIndex: prop.paraIndex, ranges: [], label: t('page.foundHere'), key: Date.now() });
    setView('read');
    announce(isDraft ? t('announce.foundMs') : t('announce.found', { n: chapters.findIndex((c) => c.id === prop.chapterId) + 1 }));
    await wait(700);
    if (my === runSeq.current) setVePhase('decide');
    setTimeout(() => setScanId(undefined), 900);
  }, [t, chapters, announce, isDraft]);

  // Apply anything waiting for a page to open (find results, deep links, spoken changes, ?voice=1).
  useEffect(() => {
    if (!pending || !loaded || pending.chapterId !== chapter?.id) return;
    const p = pending;
    setPending(null);
    firstLoad.current = chapter.id;
    if (p.proposal) void presentProposal(p.proposal);
    else if (p.highlight) showPara(p.highlight);
    if (p.voice) {
      if (supported) void startDictation('end');
      else toEdit('end');
    }
  }, [pending, loaded, chapter?.id, presentProposal, showPara, supported, startDictation, toEdit]);

  // A proposal belongs to its page; leaving it discards the proposal (nothing was saved).
  useEffect(() => {
    if (proposal && chapter?.id !== proposal.chapterId && !pending) { setProposal(null); setSpoken(null); setVePhase('idle'); setHighlight(null); setView('edit'); }
  }, [chapter?.id, proposal, pending]);

  const summaryFor = (p: Proposal) => {
    const c = p.command;
    const pl = clip(c.payload ?? '', 48), tg = clip(c.target ?? '', 40);
    if (c.kind === 'replace') return t('ve.summary.replace', { t: tg, p: pl });
    if (c.kind === 'delete') return t('ve.summary.delete', { t: tg });
    return t('ve.summary.add', { p: pl });
  };

  const accept = async () => {
    if (!proposal || !chapter || draft.loadedId !== proposal.chapterId) return;
    const current = { ...chapter, content: draft.textRef.current };
    if (toParagraphs(current.content)[proposal.paraIndex] !== proposal.before) {
      toast.show(t('ve.stale'));
      void runEdit(lastInstruction);
      return;
    }
    const content = applyProposal(current, proposal);
    const summary = summaryFor(proposal);
    const target = proposal;
    endEditFlow();
    await draft.commit(content, { source: 'voice-edit', summary, command: lastInstruction });
    toEdit({ block: target.paraIndex, at: 'end' });
    announce(t('announce.accepted'));
    const v = (await api.versions.list(bookId, target.chapterId)).find((x) => x.source === 'voice-edit' && x.after === content);
    toast.show(t('ve.savedVersion'), v ? {
      label: t('ve.undo'),
      onClick: () => { api.versions.restore(v.id, 'before').then(() => toast.show(t('ve.undone'))).catch(() => {}); },
    } : undefined, 7000);
  };

  const keepMine = () => {
    const wasSpoken = !!spoken;
    endEditFlow();
    toEdit(highlight ? { block: highlight.paraIndex, at: 'start' } : undefined);
    toast.show(wasSpoken ? t('ve.keptSpoken') : t('ve.kept'));
  };

  const applyChangedWords = () => {
    if (!proposal || !changeWords.trim()) return;
    const instr = rebuildInstruction(lastInstruction, proposal.command, changeWords);
    void runEdit(instr, { preferHit: proposalAsHit(proposal), alternatives: proposal.alternatives });
  };

  const chooseOther = (h: Hit) => {
    if (!proposal) return;
    const rest = [proposalAsHit(proposal), ...proposal.alternatives.filter((a) => !(a.chapterId === h.chapterId && a.paraIndex === h.paraIndex))];
    void runEdit(lastInstruction, { preferHit: h, alternatives: rest });
  };

  const level = useMicLevel(dictState === 'listening' || dictState === 'starting');

  useEffect(() => { if (backTo && backTo.chapterId === chapter?.id && !pending) setBackTo(null); }, [backTo, chapter?.id, pending]);

  const toggleDictation = useCallback(() => {
    if (dictCtx.current) { stopDictation(); return; }
    if (vePhase !== 'idle' && vePhase !== 'error') return;
    if (vePhase === 'error') endEditFlow();
    void startDictation();
  }, [startDictation, stopDictation, vePhase, endEditFlow]);

  // ---------- Find ----------
  const openFind = useCallback((q?: string) => { setFindQuery(q); setFindOpen(true); }, []);
  const closeFind = useCallback(() => setFindOpen(false), []);
  const pickHit = (h: Hit) => {
    setFindOpen(false);
    const hl = { paraIndex: h.paraIndex, ranges: h.ranges };
    if (h.chapterId === chapter?.id) {
      announce(isDraft ? t('announce.foundMs') : t('announce.found', { n: chapterNumber }));
      showPara(hl);
      return;
    }
    if (manuscript && h.chapterId === manuscript.id) { nav(`${bookPath(bookId, 'manuscript')}?para=${h.paraIndex}`); return; }
    if (isDraft) { nav(deskLink(bookId, h.chapterId, { para: h.paraIndex })); return; }
    announce(t('announce.found', { n: chapters.findIndex((c) => c.id === h.chapterId) + 1 }));
    if (chapter) setBackTo((b) => b ?? { chapterId: chapter.id, n: chapterNumber });
    setPending({ chapterId: h.chapterId, highlight: hl });
    nav(bookPath(bookId, 'write', h.chapterId));
  };

  // ---------- Deep links: ?para= ?find= ?voice=1 ----------
  useEffect(() => {
    if (!loaded || !chapter) return;
    const para = params.get('para'), find = params.get('find'), voice = params.get('voice');
    if (para === null && find === null && voice === null) return;
    const paras = toParagraphs(draft.textRef.current);
    let hl: Pending['highlight'];
    if (para !== null && !Number.isNaN(Number(para))) {
      const i = Math.max(0, Math.min(paras.length - 1, Number(para)));
      hl = { paraIndex: i, ranges: find ? rangesOf(plainOf(paras[i]), find) : [] };
    } else if (find) {
      const low = find.trim().toLowerCase();
      const i = paras.findIndex((p) => plainOf(p).toLowerCase().includes(low));
      if (i >= 0) hl = { paraIndex: i, ranges: rangesOf(plainOf(paras[i]), find) };
    }
    setParams({}, { replace: true });
    setPending({ chapterId: chapter.id, highlight: voice === '1' ? undefined : hl, voice: voice === '1' });
  }, [loaded, chapter, params, setParams, draft.textRef]);

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyD') { e.preventDefault(); if (!findOpen) toggleDictation(); }
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!dictCtx.current) openFind(); }
      else if (e.key === 'Escape' && !findOpen) {
        if (highlight && !proposal && !dictating) toEdit({ block: highlight.paraIndex, at: 'start' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [findOpen, toggleDictation, openFind, highlight, proposal, dictating, toEdit]);

  // ---------- Chapter operations (phone drawer) ----------
  const addChapter = async () => {
    const c = await api.chapters.create(bookId, {});
    setDrawer(false);
    nav(bookPath(bookId, 'write', c.id));
    setTimeout(() => document.getElementById('ed-title')?.focus(), 250);
  };
  const renameChapter = (c: Chapter, newTitle: string) => {
    if (c.id === chapter?.id) { titlePending.current = null; titleDirty.current = false; setTitle(newTitle); }
    void api.chapters.update(c.id, { title: newTitle });
  };
  const moveChapter = async (c: Chapter, dir: -1 | 1) => {
    const ids = chapters.map((x) => x.id);
    const i = ids.indexOf(c.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api.chapters.reorder(bookId, ids);
  };
  const deleteChapter = async (c: Chapter) => {
    const i = chapters.indexOf(c);
    const name = c.title.trim() || t('top.chapterN', { n: i + 1 });
    const snap = { title: c.title, content: c.id === draft.loadedId ? draft.textRef.current : c.content, goal: c.goal, notes: c.notes, position: i };
    const rest = chapters.filter((x) => x.id !== c.id);
    if (c.id === chapter?.id) {
      const next = rest[Math.max(0, i - 1)];
      nav(next ? bookPath(bookId, 'write', next.id) : bookPath(bookId, 'chapters'), { replace: true });
    }
    if (c.id === draft.loadedId) await draft.checkpoint();
    await api.chapters.remove(c.id);
    if (rest.length) await api.chapters.reorder(bookId, rest.map((x) => x.id));
    toast.show(t('rail.deleted', { name }), {
      label: tc('actions.undo'),
      onClick: async () => {
        const created = await api.chapters.create(bookId, { title: snap.title, content: snap.content, goal: snap.goal, notes: snap.notes, order: snap.position + 1 });
        const now = (await api.chapters.list(bookId)).filter((x) => x.id !== created.id).map((x) => x.id);
        now.splice(snap.position, 0, created.id);
        await api.chapters.reorder(bookId, now);
        toast.show(t('rail.restored'));
        nav(bookPath(bookId, 'write', created.id));
      },
    }, 8000);
  };

  // ---------- Selected passage → another chapter ----------
  const takeOut = useCallback(async (summary: string, command: string) => {
    const cur = draft.textRef.current;
    const h = rtRef.current;
    if (!h) return cur;
    const next = h.deleteSelection();
    await draft.commit(next, { source: 'typing', summary, command });
    toEdit();
    return cur;
  }, [draft, toEdit]);
  const putBack = useCallback((docId: string, prev: string, summary: string) => {
    if (docId === draft.loadedId) void draft.commit(prev, { source: 'restore', summary });
    else void api.chapters.update(docId, { content: prev }, { source: 'restore', summary });
  }, [draft]);

  // ---------- Derived ----------
  const plain = useMemo(() => toPlain(text), [text]);
  const words = useMemo(() => countWords(plain), [plain]);
  const paras = useMemo(() => toParagraphs(text), [text]);
  const inChapter = useMemo(() => entitiesIn(plain, entities), [plain, entities]);
  const findChapters = useMemo(() => {
    if (!findOpen) return chapters;
    const ms = manuscript && { ...manuscript, title: msName, content: isDraft ? draft.textRef.current : manuscript.content };
    if (isDraft) return ms ? [ms, ...chapters] : chapters;
    return [...liveChapters(), ...(ms && ms.content.trim() ? [ms] : [])];
  }, [findOpen, liveChapters, chapters, manuscript, msName, isDraft, draft.textRef]);
  const deskHighlight = useMemo(
    () => (view === 'edit' && highlight ? { block: highlight.paraIndex, ranges: highlight.ranges, label: highlight.label, key: highlight.key } : null),
    [view, highlight],
  );
  const showMarginInline = !phone && !narrow && marginOpen && !focusMode;
  const showMarginOverlay = !phone && narrow && marginOverlay && !focusMode;
  const pageFont = deva ? 'deva-book' : 'book';
  const liveWords = useMemo(() => (finals + ' ' + interim).trim().replace(/\s+/g, ' ').slice(-180), [finals, interim]);

  if (!book || !chapter || !loaded) {
    return (
      <div className="ed ed-loading" aria-busy="true">
        <p className="muted">{t('opening')}</p>
      </div>
    );
  }

  const placeName = isDraft ? t('dock.intoMs') : t('top.chapterN', { n: chapterNumber });
  const bodyLabel = isDraft ? t('page.msBodyLabel') : t('page.bodyLabel', { n: chapterNumber });
  const empty = !text.trim();

  /** Read-only page while a spoken change waits for the author: the formatted text, the changed block as a word diff. */
  const renderReadParagraph = (p: string, i: number) => {
    if (!p.trim()) return null;
    const isTarget = proposal && proposal.chapterId === chapter.id && proposal.paraIndex === i;
    const isHl = highlight && highlight.paraIndex === i;
    const dv = isDevanagari(p) && !deva ? ' deva-book' : '';
    if (!isTarget) {
      return (
        <div key={i} id={`p-${i}`} className={`ed-rblock${isHl ? ' ed-found' : ''}${dv}`}>
          <div dangerouslySetInnerHTML={{ __html: blockHtml(parseBlock(p), { cls: { break: 'ed-break' } }) }} />
        </div>
      );
    }
    return (
      <div key={`${i}-${isHl ? highlight!.key : 0}`} className={isHl ? 'ed-found-wrap' : undefined}>
        {isHl && highlight!.label && <span className="ed-found-label" aria-hidden="true">{highlight!.label}</span>}
        <p id={`p-${i}`} className={`ed-p${isHl ? ' ed-found' : ''}${dv}`}>
          {wordDiff(plainOf(proposal!.before), plainOf(proposal!.after)).map((d, j) => (
            d.type === 'same' ? <span key={j}>{d.text}</span> : d.type === 'del' ? <del key={j} className="del">{d.text}</del> : <ins key={j} className="ins">{d.text}</ins>
          ))}
        </p>
        {(vePhase === 'decide' || vePhase === 'show') && renderDecision()}
      </div>
    );
  };

  const renderDecision = () => {
    if (!proposal) return null;
    const ready = vePhase === 'decide';
    return (
      <div className={`ed-decide${ready ? ' rise' : ' is-wait'}`} role="group" aria-label={t('steps.decide')}>
        <p className="ed-decide-lead"><strong>{t('ve.yourWords')}</strong> {t('ve.nothingSaved')}</p>
        <p className="ed-decide-cmd">{spoken ? t('ve.heard', { cmd: clip(lastInstruction, 140) }) : t('ve.from', { cmd: clip(lastInstruction, 140) })}</p>
        {changing && (
          <form className="ed-decide-change" onSubmit={(e) => { e.preventDefault(); applyChangedWords(); }}>
            <label className="sr-only" htmlFor="ed-change-words">{t('ve.changeLabel')}</label>
            <input id="ed-change-words" className={`input ${pageFont}`} value={changeWords} onChange={(e) => setChangeWords(e.target.value)} autoFocus />
            <button type="submit" className="btn btn-ghost btn-sm" disabled={!changeWords.trim()}>{t('ve.apply')}</button>
          </form>
        )}
        {othersOpen && (
          <div className="ed-decide-others">
            {proposal.alternatives.length ? (
              <>
                <div className="ed-decide-otitle">{t('ve.othersTitle')}</div>
                <ul>
                  {proposal.alternatives.map((h) => (
                    <li key={`${h.chapterId}-${h.paraIndex}`}>
                      <button type="button" className="ed-other" onClick={() => chooseOther(h)}>
                        <strong>{docName(h.chapterId)}</strong>
                        <span className={isDevanagari(h.text) ? 'deva-book' : 'book'}>{clip(h.text, 120)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="ed-decide-cmd">{t('ve.noOthers')}</p>}
          </div>
        )}
        <div className="ed-decide-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={accept} disabled={!ready}><Icon name="check" size={16} />{t('ve.accept')}</button>
          {proposal.command.kind !== 'delete' && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={!ready} aria-expanded={changing} onClick={() => { setOthersOpen(false); setChangeWords(proposal.command.payload ?? ''); setChanging((x) => !x); }}>{t('ve.change')}</button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" disabled={!ready} aria-expanded={othersOpen} onClick={() => { setChanging(false); setOthersOpen((x) => !x); }}>{t('ve.others')}{proposal.alternatives.length ? ` (${proposal.alternatives.length})` : ''}</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={keepMine}>{t('ve.keep')}</button>
        </div>
        {spoken && (
          <button type="button" className="ed-decide-prose" onClick={() => void writeSpoken(spoken)}>
            <Icon name="feather" size={14} />{t('ve.writeWords')}
          </button>
        )}
      </div>
    );
  };

  const veMessage = veMsg && (
    <div className="ed-vemsg rise" role="alert">
      {veMsg.kind === 'unparsed' && (
        <>
          <strong>{t('ve.unparsedTitle')}</strong>
          <ul className="ed-examples">
            {(['add', 'after', 'replace', 'delete'] as const).map((k) => <li key={k} lang="en">{t(`ve.examples.${k}`)}</li>)}
            {(deva || isDevanagari(lastInstruction)) && (['add', 'replace', 'delete'] as const).map((k) => <li key={`hi-${k}`} lang="hi" className="deva-ui">{t(`ve.examplesHi.${k}`)}</li>)}
          </ul>
        </>
      )}
      {veMsg.kind === 'not-found' && (
        <>
          <strong>{veMsg.q && /["“'‘]/.test(lastInstruction) ? t('ve.notFoundExact', { q: clip(veMsg.q, 60) }) : t('ve.notFound')}</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openFind(veMsg.q)}><Icon name="search" size={15} />{t('ve.tryFind')}</button>
        </>
      )}
      {veMsg.kind === 'empty-book' && <strong>{t('ve.emptyBook')}</strong>}
      <button type="button" className="btn btn-quiet btn-icon btn-sm ed-vemsg-x" onClick={() => { setVeMsg(null); setVePhase('idle'); }} aria-label={tc('actions.close')}><Icon name="x" size={15} /></button>
    </div>
  );

  const margin = (close?: () => void) => (isDraft
    ? <ManuscriptPanel bookId={bookId} words={words} moved={moved} chapters={chapters} deva={deva} onClose={close} />
    : <Margin bookId={bookId} chapter={chapter} prev={prevChapter} laps={laps} entities={inChapter} deva={deva} onClose={close} />);

  const marginShown = narrow ? marginOverlay : marginOpen;

  return (
    <div className={`ed${focusMode ? ' is-focus' : ''}${phone ? ' is-phone' : ''}${isDraft ? ' is-draft' : ''}`}>
      <div className="sr-only" role="status" aria-live="polite">{said}</div>

      {/* Top bar */}
      <div className="ed-top">
        {phone && !isDraft && (
          <button type="button" className="btn btn-ghost btn-sm ed-chapbtn" onClick={() => setDrawer(true)} aria-expanded={drawer}><Icon name="list" size={16} />{t('rail.open')}</button>
        )}
        <nav className="ed-crumb" aria-label={t('top.crumb')}>
          <Link to={bookPath(bookId, isDraft ? 'manuscript' : 'chapters')} className={`ed-crumb-book${isDevanagari(book.title) ? ' deva-ui' : ''}`}>{isDraft ? (book.title || tc('untitled')) : t('top.allChapters')}</Link>
          <span aria-hidden="true" className="ed-crumb-sep">/</span>
          <span className="ed-crumb-ch" aria-current="page">{isDraft ? t('page.msShort') : <>{t('top.chapterN', { n: chapterNumber })}{chapter.title.trim() ? ` · ${chapter.title.trim()}` : ''}</>}</span>
        </nav>
        {backTo && backTo.chapterId !== chapter.id && (
          <button type="button" className="chip ed-back rise" onClick={() => { const b = backTo; setBackTo(null); endEditFlow(); nav(bookPath(bookId, 'write', b.chapterId)); }}>
            {t('top.backTo', { n: backTo.n })}
          </button>
        )}
        <div className="ed-top-fill" />
        <span className="ed-top-meta">{words === 1 ? t('top.wordsOne') : t('top.words', { n: words.toLocaleString() })}</span>
        <span className={`ed-top-save${draft.saveState === 'saving' ? ' is-saving' : ''}`}>
          {draft.saveState==='error'?<button type="button" className="btn btn-ghost btn-xs" onClick={()=>void draft.retry()}>Not synced · retry save</button>:draft.saveState === 'saving' ? t('top.saving') : <><Icon name="check" size={13} weight={2.5} />{t('top.saved')}</>}
        </span>
        {!phone && (
          <button type="button" className="btn btn-quiet btn-sm" aria-pressed={focusMode} aria-label={t('top.focusLabel')} title={t('top.focusLabel')} onClick={() => setFocusMode((f) => !f)}>
            <Icon name="eye" size={16} /><span className="ed-top-label">{focusMode ? t('top.focusOff') : t('top.focus')}</span>
          </button>
        )}
        <Link to={bookPath(bookId, 'history')} className="btn btn-quiet btn-sm" aria-label={t('top.history')}><Icon name="clock" size={16} /><span className="ed-top-label">{t('top.history')}</span></Link>
        {!phone && !focusMode && (
          <button
            type="button"
            className="btn btn-quiet btn-icon btn-sm"
            aria-pressed={marginShown}
            aria-label={marginShown ? t('top.hideMargin') : t('top.showMargin')}
            title={marginShown ? t('top.hideMargin') : t('top.showMargin')}
            onClick={() => (narrow ? setMarginOverlay((x) => !x) : setMarginOpen((x) => !x))}
          >
            <Icon name="layout" size={17} />
          </button>
        )}
      </div>

      <div className="ed-body">
        <div className="ed-center">
          <div className="ed-tbwrap">
            <Toolbar editor={rich} disabled={dictating || view !== 'edit'} />
          </div>
          <div className="ed-scroll" ref={scrollRef}>
            {isDraft && phone && (
              <Link to={bookPath(bookId, 'chapters')} className="ms-strip">
                <span><strong>{words.toLocaleString()}</strong> {words === 1 ? tw('ms.wordOne') : tw('ms.words')}</span>
                <span aria-hidden="true">·</span>
                <span><strong>{moved}</strong> {moved === 1 ? tw('ms.movedShortOne') : tw('ms.movedShort')}</span>
                <span aria-hidden="true">·</span>
                <span>{chapters.length === 1 ? tw('ms.chaptersOne') : tw('ms.chaptersN', { n: chapters.length })}</span>
              </Link>
            )}
            <article className={`ed-page page${dictating ? ' is-live' : ''}`} lang={deva ? 'hi' : undefined}>
              <div className={`ed-runhead${isDevanagari(book.title) ? ' deva-ui' : ''}`} aria-hidden="true">{book.title.trim() || tc('untitled')}</div>
              <header className="ed-head">
                {isDraft ? (
                  <>
                    <div className="ed-num ed-num-ms"><span className="ed-num-k">{t('page.msKicker')}</span></div>
                    <h1 className="ed-title ed-title-static">{t('page.msTitle')}</h1>
                  </>
                ) : (
                  <>
                    <div className="ed-num"><span className="ed-num-k">{t('page.chapterWord')}</span><span className="ed-num-n">{chapterNumber}</span></div>
                    <label htmlFor="ed-title" className="sr-only">{t('page.titleLabel')}</label>
                    <input
                      id="ed-title"
                      className={`ed-title ${deva || isDevanagari(title) ? 'deva-book' : ''}`}
                      value={title}
                      placeholder={t('page.titlePh')}
                      onChange={(e) => onTitle(e.target.value)}
                      onBlur={flushTitle}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toEdit({ block: 0, at: 'start' }); } }}
                      disabled={dictating}
                      autoComplete="off"
                    />
                  </>
                )}
                <div className="ed-orn" aria-hidden="true"><span /><span /><span /></div>
              </header>

              {isDraft && empty && view === 'edit' && !dictating && (
                <div className="ms-empty rise">
                  <TabArt id="manuscript" className="ms-empty-art" />
                  <h2 className="ms-empty-title">{tw('ms.emptyTitle')}</h2>
                  <p className="ms-empty-body">{tw('ms.emptyBody')}</p>
                  {supported && (
                    <div className="ms-empty-mic">
                      <MicOrb listening={false} onClick={() => void startDictation('end')} label={tw('ms.emptyMic')} size={84} />
                      <span className="ms-empty-say">{tw('ms.emptySay')}</span>
                    </div>
                  )}
                </div>
              )}
              {!isDraft && empty && !dictating && chapter.goal?.trim() && (
                <p className={`ed-plan ${deva || isDevanagari(chapter.goal) ? 'deva-book' : 'book'}`}><span className="kick">{t('page.yourOutline')}</span>{chapter.goal.trim()}</p>
              )}

              <div hidden={view !== 'edit'}>
                <RichText
                  key={chapter.id}
                  ref={rtRef}
                  md={text}
                  onChange={(md) => { draft.setText(md); if (note) setNote(null); if (highlight) setHighlight(null); }}
                  editable={!dictating && view === 'edit'}
                  placeholder={isDraft ? t('page.msBodyPh') : t('page.bodyPh')}
                  className={`${pageFont}${isDraft && empty ? ' is-short' : ''}${dictating ? ' is-live' : ''}`}
                  ariaLabel={bodyLabel}
                  ghost={ghost}
                  highlight={deskHighlight}
                  onReady={setRich}
                  onSelection={setSel}
                  onMoveSelection={() => setMoveSignal((n) => n + 1)}
                />
              </div>
              {view === 'read' && (
                <div className={`ed-read ed-pm ${pageFont}`} aria-label={bodyLabel}>
                  {paras.map(renderReadParagraph)}
                </div>
              )}

              {note && note.chapterId === chapter.id && !dictating && (
                <div className="ed-note rise" role="status">
                  <span className="ed-note-n"><Icon name="check" size={14} weight={2.5} />{note.n === 1 ? t('dictation.noteOne') : t('dictation.note', { n: note.n })}</span>
                  {note.changes.map((c) => <span key={c} className="ed-note-c"><span aria-hidden="true">·</span> {t(`dictation.changes.${c}`)}</span>)}
                  <button type="button" className="ed-note-btn" onClick={undoDictation}><Icon name="undo" size={14} />{t('dictation.undo')}</button>
                  <button type="button" className="ed-note-x" onClick={() => setNote(null)} aria-label={t('dictation.dismiss')}><Icon name="x" size={13} /></button>
                </div>
              )}
              {!empty && <div className="ed-folio" aria-hidden="true">{isDraft ? '❦' : chapterNumber}</div>}
            </article>
            {!isDraft && chapters.length > 1 && !dictating && (
              <nav className="ed-turn" aria-label={t('turn.label')}>
                {prevChapter ? (
                  <Link to={bookPath(bookId, 'write', prevChapter.id)} className="ed-turn-link">
                    <Icon name="left" size={16} />
                    <span><span className="ed-turn-k">{t('turn.prev')}</span><span className="ed-turn-t">{prevChapter.title.trim() || t('top.chapterN', { n: chapterNumber - 1 })}</span></span>
                  </Link>
                ) : <span />}
                {chapters[chapterIndex + 1] && (
                  <Link to={bookPath(bookId, 'write', chapters[chapterIndex + 1].id)} className="ed-turn-link ed-turn-next">
                    <span><span className="ed-turn-k">{t('turn.next')}</span><span className="ed-turn-t">{chapters[chapterIndex + 1].title.trim() || t('top.chapterN', { n: chapterNumber + 1 })}</span></span>
                    <Icon name="right" size={16} />
                  </Link>
                )}
              </nav>
            )}
          </div>

          <div className="ed-dockwrap">
            {veMessage}
            {sel && view === 'edit' && !dictating && (
              <SelectionBar
                bookId={bookId}
                chapters={chapters}
                current={chapter}
                isDraft={isDraft}
                selected={sel.md}
                words={sel.words}
                openSignal={moveSignal}
                onTakeOut={(summary, command) => takeOut(summary, command)}
                onPutBack={(prev, summary) => putBack(chapter.id, prev, summary)}
                onDone={() => setSel(null)}
              />
            )}
            <Dock
              supported={supported}
              target={placeName}
              dictating={dictState === 'listening' || dictState === 'stopping'}
              dictStarting={dictState === 'starting'}
              onToggleDictation={toggleDictation}
              liveView={liveView}
              onLiveView={setLiveView}
              level={level}
              liveWords={liveWords}
              vePhase={vePhase}
              onCancelEdit={() => {
                const hl = highlight;
                endEditFlow();
                if (hl) toEdit({ block: hl.paraIndex, at: 'start' });
              }}
              onFind={() => openFind()}
              voiceError={voiceError}
              compact={phone}
            />
          </div>
        </div>

        {showMarginInline && <div className="ed-margin">{margin()}</div>}
        {showMarginOverlay && <div className="ed-margin ed-margin-overlay rise">{margin(() => setMarginOverlay(false))}</div>}
      </div>

      {phone && drawer && !isDraft && (
        <div className="ed-drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false); }} onKeyDown={(e) => { if (e.key === 'Escape') setDrawer(false); }}>
          <div className="ed-drawer" role="dialog" aria-modal="true" aria-label={t('rail.label')}>
            <Rail
              bookId={bookId}
              chapters={chapters}
              currentId={chapter.id}
              currentWords={words}
              deva={deva}
              onAdd={addChapter}
              onRename={renameChapter}
              onMove={moveChapter}
              onDelete={deleteChapter}
              onCollapse={() => setDrawer(false)}
              onNavigate={() => setDrawer(false)}
              drawer
              scanId={scanId}
            />
          </div>
        </div>
      )}

      <FindModal
        open={findOpen}
        onClose={closeFind}
        chapters={findChapters}
        entities={entities}
        locale={locale}
        supported={supported}
        initialQuery={findQuery}
        onPick={pickHit}
        deva={deva}
      />
    </div>
  );
}
