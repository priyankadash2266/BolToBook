/**
 * Cover design as a workflow: the author says what the cover should say, sends it ("Design covers",
 * paid per design), watches the job, and every run is kept with its context and images.
 * The chosen cover sits on the study stage; hand adjustments are free.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentBook } from '@/app/context';
import { api } from '@/data/api';
import { useCredits, useEntities } from '@/data/hooks';
import type { Book, CoverSpec } from '@/data/types';
import { useT } from '@/i18n';
import { DEFAULT_COVER } from '@/components/CoverArt';
import { TabPage, useBookField } from '@/components/kit';
import { PaidButton, useCharge } from '@/components/credits';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { download } from '@/lib/format';
import { useDeferredRemove } from '@/lib/hooks';
import { isDevanagari } from '@/lib/text';
import { downloadCoverPng, downloadCoverSvg, fileBase } from '@/lib/exporters';
import { estimatePages, resolveFormat, SPINE_PER_PAGE, TRIMS } from '@/lib/paginate';
import { wordsSpec } from '@/screens/tabs/finish/coverWords';
import { sameSpec } from './cover/presets';
import { AUTO_PREFS, matchContext, runCoverJob, type CoverPrefs, type CoverResult } from './cover/coverJobs';
import { deleteRun, patchRun, readRun, runFields, type CoverRun, type RunContext } from './cover/runs';
import { BriefPanel } from './cover/BriefPanel';
import { JobProgress, type ActiveJob } from './cover/JobProgress';
import { RunHistory } from './cover/RunHistory';
import { Stage } from './cover/Stage';
import type { CoverText } from './cover/Previews';
import './cover/cover.css';

const splitThemes = (s: string) => s.split(/[,;\n،]+/).map((x) => x.trim()).filter(Boolean);

/** Runs left 'running' by a closed tab: returned credits once, then marked as not finished. */
const settled = new Set<string>();

export default function Cover() {
  const t = useT('cover2');
  const tc = useT('common');
  const toast = useToast();
  const charge = useCharge();
  const { prices } = useCredits();
  const { book, chapters } = useCurrentBook();
  const [coverBrief, setCoverBrief, briefState] = useBookField('cover_brief');
  const [prefs, setPrefs] = useState<CoverPrefs>(AUTO_PREFS);
  const [count, setCount] = useState(4);
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [draft, setDraft] = useState<CoverSpec | null>(null);
  const jobRef = useRef<ActiveJob | null>(null);
  jobRef.current = job;

  const { data: runEntities } = useEntities(book?.id, 'coverRun');
  const del = useDeferredRemove((id) => deleteRun(book!.id, id));
  const runs = useMemo(() => (runEntities ?? [])
    .filter((e) => !del.hidden.has(e.id))
    .map(readRun)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [runEntities, del.hidden]);

  const summary = book?.fields.brief?.trim() ?? '';
  const themes = useMemo(() => splitThemes(book?.fields.themes ?? ''), [book?.fields.themes]);
  const pick = useMemo(() => matchContext({ coverBrief, themes, brief: '' }), [coverBrief, themes]);

  // Clear the finished job once the stored run has caught up.
  useEffect(() => {
    if (!job?.finished) return;
    const r = runs.find((x) => x.id === job.runId);
    if (!r || r.status !== 'running') setJob(null);
  }, [job, runs]);

  // A run still 'running' that this page didn't start was interrupted (tab closed mid-run): return its credits.
  useEffect(() => {
    if (!book) return;
    for (const r of runs) {
      if (r.status !== 'running' || r.id === jobRef.current?.runId || settled.has(r.id)) continue;
      if (Date.now() - new Date(r.createdAt).getTime() < 60_000) continue;
      settled.add(r.id);
      (async () => {
        if (r.cost > 0) await api.billing.topUp(r.cost, t('send.refundNote'));
        await patchRun(book.id, r.id, { status: 'failed', refunded: r.cost });
      })().catch(() => settled.delete(r.id));
    }
  }, [runs, book, t]);

  // Drop a hand draft when the saved cover changes underneath it (e.g. "Use this cover" in the history).
  const savedKey = JSON.stringify(book?.cover ?? null);
  useEffect(() => { setDraft(null); }, [savedKey]);

  const spinePx = useMemo(() => {
    if (!book) return 0.05;
    const f = resolveFormat(book);
    const words = chapters.reduce((s, c) => s + c.wordCount, 0);
    const pages = estimatePages(words, f, chapters.length);
    return (pages * SPINE_PER_PAGE) / TRIMS[f.trim].w;
  }, [book, chapters]);

  if (!book) return null;

  const title = book.title || tc('untitled');
  const text: CoverText = { title, subtitle: book.subtitle, author: book.author, deva: isDevanagari(book.title) };
  const fallback = wordsSpec(pick) ?? DEFAULT_COVER;
  const shown = draft ?? book.cover ?? fallback;
  const stageState = draft ? 'draft' : book.cover ? 'saved' : 'none';
  const canSend = !!(coverBrief.trim() || summary);
  const running = !!job && !job.finished;

  const saveBook = (patch: Partial<Book>) => api.books.update(book.id, patch).then(() => toast.show(tc('saved'))).catch(() => toast.show(t('failed')));
  const chooseCover = async (spec: CoverSpec) => {
    try { await api.books.update(book.id, { cover: spec }); setDraft(null); toast.show(t('history.saved')); } catch { toast.show(t('failed')); }
  };

  const design = async () => {
    if (!canSend || jobRef.current) return;
    const n = count;
    const createdAt = new Date().toISOString();
    const context: RunContext = {
      title, subtitle: book.subtitle, author: book.author, brief: summary, themes, coverBrief: coverBrief.trim(), prefs, count: n, deva: text.deva,
    };
    const ent = await api.entities.create({ bookId: book.id, kind: 'coverRun', name: createdAt,
      fields: runFields({ context, specs: [], mediaIds: [], count: n, cost: 0, refunded: 0, createdAt, status: 'running' }) });
    const start: ActiveJob = { runId: ent.id, count: n, step: 'read', fraction: 0, results: [], matched: [] };
    setJob(start);

    // Charge only now that the work can start.
    const ok = await charge({ kind: 'cover', units: 1, bookId: book.id, note: t('send.note', { n, title }), ref: ent.id });
    if (!ok) { await api.entities.remove(ent.id).catch(() => {}); setJob(null); return; }
    const unit = prices?.cover ?? 0;
    const cost = unit;
    await patchRun(book.id, ent.id, { cost });

    let results: CoverResult[] = [];
    try {
      results = await runCoverJob({ ...context, bookId: book.id, runId: ent.id }, (p) => setJob((j) => j && j.runId === ent.id ? {
        ...j, step: p.step, fraction: p.fraction, matched: p.matched ?? j.matched, results: p.result ? [...j.results, p.result] : j.results,
      } : j));
    } catch {
      results = [];
    }
    const made = results.filter((r) => r.mediaId);
    const missing = n - made.length;
    const refund = made.length === 0 ? unit : 0;
    if (refund > 0) await api.billing.topUp(refund, t('send.refundNote')).catch(() => {});
    const status = missing === 0 ? 'done' : made.length > 0 ? 'partial' : 'failed';
    await patchRun(book.id, ent.id, { specs: made.map((r) => r.spec), mediaIds: made.map((r) => r.mediaId!), status, refunded: refund });
    setJob((j) => (j && j.runId === ent.id ? { ...j, finished: true, fraction: 1, results: made } : j));
    toast.show(status === 'done' ? t('send.done', { n }) : status === 'partial' ? t('send.partial', { ok: made.length, n, r: refund }) : t('send.failed', { n: refund }));
  };

  const removeRun = (r: CoverRun) => {
    del.schedule(r.id);
    toast.show(t('history.removed'), { label: t('history.undo'), onClick: () => del.undo(r.id) }, 5000);
  };
  const downloadRun = async (r: CoverRun, i: number) => {
    const id = r.mediaIds[i];
    const m = id ? await api.media.get(id) : undefined;
    if (!m) { toast.show(t('stage.downloadFailed')); return; }
    const no = runs.length - runs.findIndex((x) => x.id === r.id);
    download(`${fileBase(book)}-cover-${no}-${i + 1}.png`, m.blob);
  };
  const dl = (fn: typeof downloadCoverPng) => async () => { try { await fn(book, shown); } catch { toast.show(t('stage.downloadFailed')); } };

  const send = (
    <div className="c2-send-go">
      <PaidButton kind="cover" units={1} label={t('send.label')} busyLabel={t('send.busy')} onRun={design}
        disabled={!canSend || running} className="btn btn-primary btn-lg c2-go" icon={<Icon name="feather" size={18} />} />
      {!canSend
        ? <p className="c2-send-hint is-need"><Icon name="flag" size={13} />{t('send.needWords')}</p>
        : <p className="c2-send-hint">{t('send.each', { n: prices?.cover ?? 0 })}</p>}
      {job && <JobProgress job={job} text={text} />}
    </div>
  );

  return (
    <TabPage tabId="cover">
      <p className="muted">Beta cover studio: generates illustrated design variations from your brief and preferences. These are template-based designs, not AI-generated artwork. Every run and its input are saved below.</p>
      <div className="cd">
        <BriefPanel book={book} summary={summary} themes={themes} coverBrief={coverBrief} setCoverBrief={setCoverBrief} briefState={briefState}
          matches={pick.matches} prefs={prefs} setPrefs={setPrefs} count={count} setCount={setCount} running={running} onSaveBook={saveBook} send={send} />
        <Stage text={text} spec={shown} state={stageState} spinePx={spinePx}
          onChange={(s) => setDraft(sameSpec(s, book.cover) ? null : s)}
          onKeep={() => chooseCover(shown)} onReset={() => setDraft(null)}
          onPng={dl(downloadCoverPng)} onSvg={dl(downloadCoverSvg)} />
      </div>
      <RunHistory runs={runs} job={job && !job.finished ? job : null} text={text} current={book.cover}
        onUse={chooseCover} onDownload={downloadRun} onRemove={removeRun} />
    </TabPage>
  );
}
