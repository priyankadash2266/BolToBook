import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { TabPage } from '@/components/kit';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { useT, useLang } from '@/i18n';
import { api } from '@/data/api';
import { useCurrentBook } from '@/app/context';
import { useBooks, useLaps, useResource } from '@/data/hooks';
import type { Chapter, Lap, LapTag } from '@/data/types';
import { useDeferredRemove } from '@/lib/hooks';
import { fmtDate, fmtRelative, fmtTime } from '@/lib/format';
import { chapterNumberIn, parseLapCommand, rankLaps, tagKey } from '@/lib/lapVoice';
import { LapHero, type SubmitOutcome } from './laps/LapHero';
import { LapCard } from './laps/LapCard';
import { SelectionBar } from './laps/SelectionBar';
import { TagChip, daysAgo, groupByDay, isUnused, isUsed } from './laps/bits';
import type { AudioTake } from './laps/useLapDictation';
import './laps/laps.css';

type StatusFilter = 'all' | 'unused' | 'used';

/** What a spoken command did, shown so the author can check it, pick another Lap, or undo. */
type Result =
  | { kind: 'append'; lapId: string; text: string; prevText: string; alternatives: string[]; raw: string }
  | { kind: 'used' | 'unused'; lapId: string; where: string; prev: Pick<Lap, 'status' | 'usedWhere' | 'chapterId'>; alternatives: string[]; raw: string }
  | { kind: 'noMatch'; query: string; raw: string };

const usedState = (l: Lap): Pick<Lap, 'status' | 'usedWhere' | 'chapterId'> => ({ status: l.status, usedWhere: l.usedWhere, chapterId: l.chapterId });

export default function Laps() {
  const t = useT('laps');
  const c = useT('common');
  const { lang } = useLang();
  const toast = useToast();
  const { bookId } = useParams();
  const [params] = useSearchParams();
  const allBooks = !bookId;
  const { book, chapters: bookChapters } = useCurrentBook();
  const { data: books } = useBooks();
  const { data: laps, loading } = useLaps(bookId ? { bookId } : {});
  const del = useDeferredRemove((id) => api.laps.remove(id));

  const [status, setStatus] = useState<StatusFilter>('all');
  const [tagF, setTagF] = useState<string | null>(null);
  const [twistOnly, setTwistOnly] = useState(false);
  const [bookF, setBookF] = useState('');
  const [find, setFind] = useState<{ q: string; raw: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [picking, setPicking] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(params.get('lap'));

  useEffect(() => { const id = params.get('lap'); if (id) setHighlight(id); }, [params]);
  useEffect(() => { if (!highlight) return; const tm = setTimeout(() => setHighlight(null), 4000); return () => clearTimeout(tm); }, [highlight]);

  // Chapters for every book in view (one book inside a book; all books on /app/laps).
  const bookIds = useMemo(() => (bookId ? [] : (books ?? []).map((b) => b.id)), [bookId, books]);
  const { data: chaptersBy } = useResource(async () => {
    const out: Record<string, Chapter[]> = {};
    await Promise.all(bookIds.map(async (id) => { out[id] = await api.chapters.list(id); }));
    return out;
  }, [bookIds.join(',')], ['chapters']);
  const chaptersOf = (bid?: string): Chapter[] => (!bid ? [] : bookId ? bookChapters : chaptersBy?.[bid] ?? []);

  const all = useMemo(() => (laps ?? []).filter((l) => !del.hidden.has(l.id)), [laps, del.hidden]);
  const scoped = useMemo(() => all.filter((l) => !allBooks || !bookF || (bookF === '_none' ? !l.bookId : l.bookId === bookF)), [all, allBooks, bookF]);
  const live = useMemo(() => scoped.filter((l) => l.status !== 'discarded'), [scoped]);
  const counts = { all: scoped.length, unused: scoped.filter(isUnused).length, used: scoped.filter(isUsed).length };

  const tagsInUse = useMemo(() => {
    const m = new Map<string, LapTag>();
    scoped.forEach((l) => l.tags?.forEach((tg) => { const k = tagKey(tg); if (!m.has(k)) m.set(k, tg); }));
    return [...m.entries()].sort((a, b) => a[1].type.localeCompare(b[1].type) || a[1].name.localeCompare(b[1].name));
  }, [scoped]);
  const anyTwist = scoped.some((l) => l.twist);

  const shown = useMemo(() => {
    let rows = scoped.filter((l) => (status === 'all' ? true : status === 'used' ? isUsed(l) : isUnused(l)));
    if (tagF) rows = rows.filter((l) => l.tags?.some((tg) => tagKey(tg) === tagF));
    if (twistOnly) rows = rows.filter((l) => l.twist);
    if (find) rows = rankLaps(find.q, rows).map((r) => r.lap);
    return rows;
  }, [scoped, status, tagF, twistOnly, find]);
  const groups = useMemo(() => (find ? [{ key: 'find', label: t('days.matches'), items: shown }] : groupByDay(shown, lang, t)), [find, shown, lang, t]);

  const whenOf = (l: Lap) => {
    if (find) return fmtRelative(l.createdAt, lang);
    const n = daysAgo(l.createdAt);
    if (n <= 1) return fmtTime(l.createdAt, lang);
    if (n < 7) return `${fmtDate(l.createdAt, lang, { weekday: 'long' })}, ${fmtTime(l.createdAt, lang)}`;
    return fmtTime(l.createdAt, lang);
  };

  const byId = (id: string) => all.find((l) => l.id === id);
  const captureBook = bookId ?? (bookF && bookF !== '_none' ? bookF : undefined);

  /* ---------------- voice / typed commands ---------------- */

  const createLap = async (input: { title?: string; text: string; tags: LapTag[]; twist: boolean }, source: 'voice' | 'typed', audio: AudioTake) => {
    let audioId: string | undefined;
    let durationMs: number | undefined;
    const a = audio ? await audio : null;
    if (a) { audioId = await api.audio.put(a.blob, a.durationMs); durationMs = a.durationMs; }
    const lap = await api.laps.create({
      text: input.text, title: input.title, tags: input.tags.length ? input.tags : undefined, twist: input.twist || undefined,
      source, bookId: captureBook, audioId, durationMs,
    });
    if (status === 'used') setStatus('all');
    setFind(null);
    setHighlight(lap.id);
    toast.show(t('toast.saved'), { label: t('toast.undo'), onClick: () => { void api.laps.remove(lap.id); } }, 6000);
    return lap;
  };

  const applyUsed = async (lap: Lap, where: string) => {
    const n = chapterNumberIn(where);
    const chs = chaptersOf(lap.bookId);
    const chapterId = n !== undefined ? chs[n - 1]?.id : undefined;
    await api.laps.update(lap.id, { status: 'placed', usedWhere: where || undefined, chapterId: chapterId ?? lap.chapterId });
  };
  const applyUnused = (lap: Lap) => api.laps.update(lap.id, { status: 'inbox', usedWhere: undefined, chapterId: undefined });
  const appendTo = (lap: Lap, text: string) => api.laps.update(lap.id, { text: lap.text.trim() ? `${lap.text.replace(/\s+$/, '')}\n${text}` : text });

  const undoResult = async (r: Result) => {
    if (r.kind === 'append') await api.laps.update(r.lapId, { text: r.prevText });
    else if (r.kind === 'used' || r.kind === 'unused') await api.laps.update(r.lapId, r.prev);
  };

  const onSubmit = async (raw: string, source: 'voice' | 'typed', audio: AudioTake): Promise<SubmitOutcome> => {
    const cmd = parseLapCommand(raw, live);
    setPicking(false);
    if (cmd.kind === 'create') {
      if (!cmd.text && !cmd.title && !cmd.tags.length) return null;
      const lap = await createLap(cmd, source, audio);
      setResult(null);
      return { kind: 'created', lap };
    }
    if (cmd.kind === 'find') {
      setFind({ q: cmd.query, raw });
      setResult(null);
      return { kind: 'command' };
    }
    const ranked = rankLaps(cmd.query, live);
    const best = ranked[0]?.lap;
    const alternatives = ranked.slice(1, 6).map((r) => r.lap.id);
    if (!best) { setResult({ kind: 'noMatch', query: cmd.query, raw }); return { kind: 'command' }; }
    if (cmd.kind === 'append') {
      await appendTo(best, cmd.text);
      setResult({ kind: 'append', lapId: best.id, text: cmd.text, prevText: best.text, alternatives, raw });
      toast.show(t('toast.appended', { lap: lapName(best) }), { label: t('toast.undo'), onClick: () => { void api.laps.update(best.id, { text: best.text }); setResult(null); } }, 6000);
    } else if (cmd.kind === 'markUsed') {
      await applyUsed(best, cmd.where);
      setResult({ kind: 'used', lapId: best.id, where: cmd.where, prev: usedState(best), alternatives, raw });
    } else {
      await applyUnused(best);
      setResult({ kind: 'unused', lapId: best.id, where: '', prev: usedState(best), alternatives, raw });
    }
    setHighlight(best.id);
    return { kind: 'command' };
  };

  /** "Not this one": undo on the first Lap, do the same to the one the author picks. */
  const pickInstead = async (id: string) => {
    if (!result || result.kind === 'noMatch') return;
    const lap = byId(id);
    if (!lap) return;
    await undoResult(result);
    const rest = [result.lapId, ...result.alternatives.filter((x) => x !== id)];
    if (result.kind === 'append') { await appendTo(lap, result.text); setResult({ ...result, lapId: id, prevText: lap.text, alternatives: rest }); }
    else if (result.kind === 'used') { await applyUsed(lap, result.where); setResult({ ...result, lapId: id, prev: usedState(lap), alternatives: rest }); }
    else { await applyUnused(lap); setResult({ ...result, lapId: id, prev: usedState(lap), alternatives: rest }); }
    setPicking(false);
    setHighlight(id);
  };

  const saveInstead = async (raw: string) => {
    if (result && result.kind !== 'noMatch') await undoResult(result);
    await createLap({ text: raw, tags: [], twist: false }, 'typed', null);
    setResult(null);
    setFind(null);
  };

  /* ---------------- selection ---------------- */

  const selectedLaps = shown.filter((l) => selected.has(l.id));
  const setSel = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const clearSel = () => setSelected(new Set());
  useEffect(() => { setSelected((s) => { const ids = new Set(all.map((l) => l.id)); const n = new Set([...s].filter((id) => ids.has(id))); return n.size === s.size ? s : n; }); }, [all]);

  const restoreAll = (prev: { id: string; st: Pick<Lap, 'status' | 'usedWhere' | 'chapterId'> }[]) => () => { prev.forEach((p) => { void api.laps.update(p.id, p.st); }); };

  const markUsedSel = async (where: string, chapterId?: string) => {
    const prev = selectedLaps.map((l) => ({ id: l.id, st: usedState(l) }));
    await Promise.all(selectedLaps.map((l) => {
      const n = chapterId ? undefined : chapterNumberIn(where);
      const ch = chapterId ?? (n !== undefined ? chaptersOf(l.bookId)[n - 1]?.id : undefined);
      return api.laps.update(l.id, { status: 'placed', usedWhere: where.trim() || undefined, chapterId: ch ?? l.chapterId });
    }));
    toast.show(t('toast.used', { n: prev.length }), { label: t('toast.undo'), onClick: restoreAll(prev) }, 6000);
    clearSel();
  };
  const markUnusedSel = async () => {
    const prev = selectedLaps.map((l) => ({ id: l.id, st: usedState(l) }));
    await Promise.all(selectedLaps.map(applyUnused));
    toast.show(t('toast.unused', { n: prev.length }), { label: t('toast.undo'), onClick: restoreAll(prev) }, 6000);
    clearSel();
  };
  const deleteLaps = (ids: string[]) => {
    ids.forEach((id) => del.schedule(id));
    toast.show(t('toast.deleted', { n: ids.length }), { label: t('toast.undo'), onClick: () => ids.forEach((id) => del.undo(id)) }, 5000);
  };

  // Chapter chips for "Mark used": only when every selected Lap is in the same book.
  const selBook = selectedLaps.length && selectedLaps.every((l) => l.bookId && l.bookId === selectedLaps[0].bookId) ? selectedLaps[0].bookId : undefined;
  const selChapters = chaptersOf(selBook);

  const lapName = (l: Lap) => l.title?.trim() || (l.text.length > 90 ? l.text.slice(0, 90).trimEnd() + '…' : l.text);
  const bookTitle = (id?: string) => (id ? books?.find((b) => b.id === id)?.title || c('untitled') : t('capture.noBook'));
  const filtersOn = status !== 'all' || !!tagF || twistOnly || !!find || (allBooks && !!bookF);
  const clearFilters = () => { setStatus('all'); setTagF(null); setTwistOnly(false); setBookF(''); setFind(null); };
  const isEmpty = !loading && scoped.length === 0 && !(allBooks && bookF);
  const bookLang = book?.lang ?? (captureBook ? books?.find((b) => b.id === captureBook)?.lang : undefined);

  return (
    <TabPage tabId="laps" title={allBooks ? t('titleAll') : t('title')} purpose={t('sub')}>
      <LapHero
        onSubmit={onSubmit}
        bookLang={bookLang}
        empty={isEmpty}
        note={allBooks ? t('capture.savesTo', { book: bookTitle(captureBook) }) : undefined}
      />

      {result && <ResultSlip result={result} lapName={(id) => { const l = byId(id); return l ? lapName(l) : ''; }} picking={picking}
        onPick={() => setPicking((p) => !p)} onChoose={pickInstead}
        onUndo={async () => { await undoResult(result); setResult(null); }}
        onSaveInstead={() => saveInstead(result.raw)} onDismiss={() => { setResult(null); setPicking(false); }} />}

      {!isEmpty && !loading && (
        <div className="lp-shelf">
          <div className="lp-filters">
            <Segmented label={t('filters.label')} value={status} onChange={(v) => { setStatus(v); clearSel(); }}
              options={(['all', 'unused', 'used'] as StatusFilter[]).map((f) => ({ value: f, label: <>{t(`filters.${f}`)}<span className="lp-count">{counts[f]}</span></> }))} />
            {allBooks && (books?.length ?? 0) > 0 && (
              <label className="lp-bookfilter">
                <span>{t('filters.book')}</span>
                <select className="select" value={bookF} onChange={(e) => { setBookF(e.target.value); clearSel(); }}>
                  <option value="">{t('filters.allBooks')}</option>
                  {books?.map((b) => <option key={b.id} value={b.id}>{b.title || c('untitled')}</option>)}
                  <option value="_none">{t('filters.noBook')}</option>
                </select>
              </label>
            )}
            {(tagsInUse.length > 0 || anyTwist || find) && (
              <div className="lp-chiprow" role="group" aria-label={t('filters.tags')}>
                {find && (
                  <span className="lp-findchip">
                    <Icon name="search" size={14} />
                    <span>{t('voice.finding', { q: find.q })}</span>
                    <button type="button" onClick={() => setFind(null)}>{t('voice.clear')}</button>
                    <button type="button" onClick={() => saveInstead(find.raw)}>{t('voice.saveInstead')}</button>
                  </span>
                )}
                {anyTwist && (
                  <button type="button" className="lp-twistfilter" aria-pressed={twistOnly} onClick={() => setTwistOnly((v) => !v)}><Icon name="flag" size={13} />{t('filters.twists')}</button>
                )}
                {tagsInUse.map(([k, tg]) => (
                  <TagChip key={k} tag={tg} pressed={tagF === k} onClick={() => setTagF((cur) => (cur === k ? null : k))} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !isEmpty && shown.length === 0 && (
        <div className="lp-nothing">
          {find ? (
            <>
              <p className="display lp-nothing-h">{t('empty.find.title', { q: find.q })}</p>
              <p className="lp-nothing-b">{t('empty.find.body')}</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFind(null)}>{t('voice.clear')}</button>
            </>
          ) : (
            <>
              <p className="display lp-nothing-h">{filtersOn ? t('empty.filtered.title') : t('empty.none.title')}</p>
              <p className="lp-nothing-b">{filtersOn ? t('empty.filtered.body') : t('empty.none.body')}</p>
              {filtersOn && <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>{t('filters.clear')}</button>}
            </>
          )}
        </div>
      )}

      {groups.map((g) => g.items.length > 0 && (
        <section key={g.key} className="lp-day" aria-labelledby={`lp-day-${g.key}`}>
          <h2 className="lp-day-h" id={`lp-day-${g.key}`}>
            <span className="lp-day-label">{g.label}</span>
            <span className="lp-day-rule" aria-hidden="true" />
            <span className="lp-day-n" aria-hidden="true">{g.items.length}</span>
          </h2>
          <ul className="lp-list">
            {g.items.map((l) => (
              <LapCard
                key={l.id}
                lap={l}
                when={whenOf(l)}
                open={openId === l.id}
                onOpen={() => setOpenId(l.id)}
                onClose={() => setOpenId(null)}
                selected={selected.has(l.id)}
                onSelect={(on) => setSel(l.id, on)}
                onDelete={() => { setOpenId(null); deleteLaps([l.id]); }}
                chapters={chaptersOf(l.bookId)}
                books={allBooks ? books : undefined}
                highlight={highlight === l.id}
              />
            ))}
          </ul>
        </section>
      ))}

      {selectedLaps.length > 0 && (
        <SelectionBar
          n={selectedLaps.length}
          chapters={selChapters}
          bookLang={bookLang}
          onUsed={markUsedSel}
          onUnused={markUnusedSel}
          onDelete={() => { const ids = selectedLaps.map((l) => l.id); clearSel(); deleteLaps(ids); }}
          onClear={clearSel}
        />
      )}
    </TabPage>
  );
}

function ResultSlip({ result, lapName, picking, onPick, onChoose, onUndo, onSaveInstead, onDismiss }: {
  result: Result; lapName: (id: string) => string; picking: boolean; onPick: () => void; onChoose: (id: string) => void;
  onUndo: () => void; onSaveInstead: () => void; onDismiss: () => void;
}) {
  const t = useT('laps');
  if (result.kind === 'noMatch') {
    return (
      <div className="lp-result is-miss rise" role="status">
        <div className="lp-result-main"><Icon name="search" size={16} /><span>{t('voice.noMatch', { q: result.query })}</span></div>
        <div className="lp-result-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSaveInstead}>{t('voice.saveInstead')}</button>
          <button type="button" className="lp-iconbtn" onClick={onDismiss} aria-label={t('voice.dismiss')}><Icon name="x" size={15} /></button>
        </div>
      </div>
    );
  }
  const label = result.kind === 'append' ? t('voice.appended')
    : result.kind === 'used' ? (result.where ? t('voice.markedUsedWhere', { where: result.where }) : t('voice.markedUsed'))
    : t('voice.markedUnused');
  const alts = result.alternatives.filter((id) => lapName(id));
  return (
    <div className="lp-result rise" role="status">
      <div className="lp-result-main">
        <Icon name="check" size={16} />
        <span><strong>{label}:</strong> <span className="book">“{lapName(result.lapId)}”</span></span>
      </div>
      <div className="lp-result-actions">
        {alts.length > 0 && <button type="button" className="btn btn-ghost btn-sm" aria-expanded={picking} onClick={onPick}>{t('voice.notThis')}</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onUndo}><Icon name="undo" size={14} />{t('toast.undo')}</button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onSaveInstead}>{t('voice.saveInstead')}</button>
        <button type="button" className="lp-iconbtn" onClick={onDismiss} aria-label={t('voice.dismiss')}><Icon name="x" size={15} /></button>
      </div>
      {picking && alts.length > 0 && (
        <div className="lp-pick">
          <span className="label">{t('voice.pick')}</span>
          <ul>{alts.map((id) => <li key={id}><button type="button" className="lp-pick-item book" onClick={() => onChoose(id)}>{lapName(id)}</button></li>)}</ul>
        </div>
      )}
    </div>
  );
}
