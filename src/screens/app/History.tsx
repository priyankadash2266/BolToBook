import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { bookPath, useCurrentBook } from '@/app/context';
import { EmptyState } from '@/components/bits';
import { TabArt } from '@/components/TabArt';
import { Icon, type IconName } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useT, useLang } from '@/i18n';
import { api } from '@/data/api';
import { useVersions } from '@/data/hooks';
import { diffStats, wordDiff, type DiffPart } from '@/lib/diff';
import { fmtDate, fmtNumber, fmtTime } from '@/lib/format';
import { isDevanagari } from '@/lib/text';
import { toPlain } from '@/lib/markdown';
import type { Version, VersionSource } from '@/data/types';
import { ConfirmDialog } from './library/ConfirmDialog';
import './history/history.css';

type Filter = 'all' | 'typing' | 'dictation' | 'voice-edit' | 'proofread' | 'restore';
const FILTERS: Filter[] = ['all', 'typing', 'dictation', 'voice-edit', 'proofread', 'restore'];
const ICONS: Record<VersionSource, IconName> = {
  typing: 'type', dictation: 'mic', 'voice-edit': 'pen', proofread: 'check', restore: 'undo', import: 'file', create: 'plus',
};

/** Keeps a little context around each change and folds long unchanged stretches. */
function foldDiff(parts: DiffPart[], ctx = 160): (DiffPart | { gap: true })[] {
  const out: (DiffPart | { gap: true })[] = [];
  parts.forEach((p, i) => {
    if (p.type !== 'same' || p.text.length <= ctx * 2 + 40) { out.push(p); return; }
    const first = i === 0, last = i === parts.length - 1;
    if (!first) out.push({ text: p.text.slice(0, ctx).replace(/\S*$/, ''), type: 'same' });
    out.push({ gap: true });
    if (!last) out.push({ text: p.text.slice(-ctx).replace(/^\S*/, ''), type: 'same' });
  });
  return out;
}

interface Peek { pre: string; del: string; ins: string; post: string }
const clip = (s: string, n: number, end = false) => (s.length <= n ? s : end ? `${s.slice(0, n).replace(/\S*$/, '')}…` : `…${s.slice(-n).replace(/^\S*/, '')}`);

/** A one-line look at what changed: the first changed stretch, snapped to whole words, with a little context. Linear time. */
function peekOf(a: string, b: string): Peek | null {
  if (a === b) return null;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  let j = 0;
  while (j < n - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  while (i > 0 && /\S/.test(a[i - 1])) i--;
  while (j > 0 && /\S/.test(a.charAt(a.length - j))) j--;
  const del = a.slice(i, a.length - j).trim();
  const ins = b.slice(i, b.length - j).trim();
  if (!del && !ins) return null;
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  return {
    pre: i > 0 ? clip(flat(a.slice(Math.max(0, i - 60), i)), 36) : '',
    del: clip(flat(del), 80, true),
    ins: clip(flat(ins), 80, true),
    post: j > 0 ? clip(flat(a.slice(a.length - j, a.length - j + 60)), 36, true) : '',
  };
}

export default function History() {
  const t = useT('history');
  const te = useT('editor');
  const c = useT('common');
  const { lang } = useLang();
  const toast = useToast();
  const nav = useNavigate();
  const { book, chapters } = useCurrentBook();
  const { data: versions, loading } = useVersions(book?.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [chapterId, setChapterId] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'before' | 'after' | null>(null);

  const all = versions ?? [];
  const shown = useMemo(() => all.filter((v) => (filter === 'all' || v.source === filter) && (!chapterId || v.chapterId === chapterId)), [all, filter, chapterId]);
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: 0 };
    for (const v of all) if (!chapterId || v.chapterId === chapterId) { m.all++; m[v.source] = (m[v.source] ?? 0) + 1; }
    return m;
  }, [all, chapterId]);
  const byDay = useMemo(() => {
    const g: { day: string; label: string; items: Version[] }[] = [];
    for (const v of shown) {
      const day = new Date(v.createdAt).toDateString();
      let cur = g.find((x) => x.day === day);
      if (!cur) { cur = { day, label: fmtDate(v.createdAt, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), items: [] }; g.push(cur); }
      cur.items.push(v);
    }
    return g;
  }, [shown, lang]);

  const sel = all.find((v) => v.id === selId) ?? null;
  const chapterNo = (id: string) => chapters.findIndex((ch) => ch.id === id) + 1;
  const chapterName = (v: Version) => {
    const n = chapterNo(v.chapterId);
    return n > 0 ? c('chapterN', { n }) : (v.chapterTitle || t('chapterGone'));
  };
  const rowTitle = (v: Version) => t('rowTitle', { source: t(`source.${v.source}`), chapter: chapterName(v) });
  // Compared as plain words: formatting marks (bold, headings, lists…) never show as raw symbols.
  const plainSel = useMemo(() => (sel ? { before: toPlain(sel.before), after: toPlain(sel.after) } : null), [sel]);
  const parts = useMemo(() => (plainSel ? foldDiff(wordDiff(plainSel.before, plainSel.after)) : []), [plainSel]);
  const stats = useMemo(() => (plainSel ? diffStats(plainSel.before, plainSel.after) : null), [plainSel]);
  const formatOnly = !!sel && !!plainSel && sel.before !== sel.after && plainSel.before === plainSel.after;
  const selChapter = sel ? chapters.find((ch) => ch.id === sel.chapterId) : undefined;

  const doRestore = async () => {
    if (!sel || !confirm) return;
    const target = confirm === 'before' ? sel.before : sel.after;
    if (!selChapter) { toast.show(t('restoreFailed')); setConfirm(null); return; }
    if (selChapter.content === target) { toast.show(t('noChange')); setConfirm(null); return; }
    try {
      await api.versions.restore(sel.id, confirm);
      toast.show(t('restored'));
    } catch { toast.show(t('restoreFailed')); }
    setConfirm(null);
  };

  if (!book) return <div className="wrap" aria-busy="true" />;

  if (!loading && all.length === 0) {
    return (
      <div className="wrap wrap-narrow hs-emptywrap">
        <header className="hs-head">
          <div className="kick">{t('kicker')}</div>
          <h1 className="hs-title">{t('title')}</h1>
          <p className="hs-sub">{t('sub')}</p>
        </header>
        <EmptyState art="timeline" title={t('emptyTitle')} body={t('emptyBody')}>
          <Link className="btn btn-primary" to={bookPath(book.id, 'write')}><Icon name="feather" size={16} />{t('write')}</Link>
        </EmptyState>
      </div>
    );
  }

  const deva = sel ? isDevanagari(sel.before + sel.after) : false;

  return (
    <div className={`hs-layout${sel ? ' has-sel' : ''}`}>
      <section className="hs-list" aria-label={t('title')}>
        <header className="hs-head">
          <div className="kick">{t('kicker')}</div>
          <h1 className="hs-title">{t('title')}</h1>
          <p className="hs-sub">{t('sub')}</p>
        </header>
        <div className="hs-tools">
          <div className="hs-filters" role="group" aria-label={t('filters.label')}>
            {FILTERS.map((f) => (
              <button key={f} type="button" className="chip hs-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f !== 'all' && <Icon name={ICONS[f]} size={13} />}
                {t(`filters.${f}`)}
                {counts[f] ? <span className="hs-chip-n">{fmtNumber(counts[f], lang)}</span> : null}
              </button>
            ))}
          </div>
          {chapters.length > 1 && (
            <label className="hs-chapsel">
              <span>{t('chapter')}</span>
              <select className="select" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
                <option value="">{t('allChapters')}</option>
                {chapters.map((ch, i) => <option key={ch.id} value={ch.id}>{c('chapterN', { n: i + 1 })}{ch.title ? ` · ${ch.title}` : ''}</option>)}
              </select>
            </label>
          )}
        </div>
        {shown.length === 0 && <p className="hs-nomatch">{t('emptyFilter')}</p>}
        {byDay.map((g) => (
          <section key={g.day} className="hs-dayblock" aria-label={g.label}>
            <h2 className="hs-day">
              <span className="hs-day-label">{g.label}</span>
              <span className="hs-day-rule" aria-hidden="true" />
              <span className="hs-day-n">{g.items.length === 1 ? t('dayOne') : t('dayN', { n: fmtNumber(g.items.length, lang) })}</span>
            </h2>
            <ol className="hs-rows">
              {g.items.map((v) => {
                const peek = peekOf(toPlain(v.before), toPlain(v.after));
                const vdeva = isDevanagari(v.after || v.before);
                return (
                  <li key={v.id} className="hs-li">
                    <button type="button" className="hs-row" aria-current={v.id === selId} onClick={() => setSelId(v.id)}>
                      <span className={`hs-icon s-${v.source}`} aria-hidden="true"><Icon name={ICONS[v.source]} size={15} /></span>
                      <span className="hs-rowbody">
                        <span className="hs-rowtop">
                          <span className="hs-rowtitle">{rowTitle(v)}</span>
                          <span className="hs-rowtime num">{fmtTime(v.createdAt, lang)}</span>
                        </span>
                        {v.summary && <span className="hs-rowsum">{v.summary}</span>}
                        {v.source === 'voice-edit' && v.command && <span className="hs-rowcmd"><Icon name="mic" size={12} />“{v.command}”</span>}
                        {peek && (
                          <span className={`hs-peek ${vdeva ? 'deva-book' : 'book'}`}>
                            {peek.pre && <span className="hs-peek-ctx">{peek.pre} </span>}
                            {peek.del && <del className="del">{peek.del}</del>}
                            {peek.del && peek.ins && ' '}
                            {peek.ins && <ins className="ins">{peek.ins}</ins>}
                            {peek.post && <span className="hs-peek-ctx"> {peek.post}</span>}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </section>

      <section className="hs-detail" aria-live="polite">
        {!sel ? (
          <div className="hs-pick">
            <TabArt id="timeline" className="hs-pick-art" />
            <p>{t('pick')}</p>
          </div>
        ) : (
          <article className="hs-sheet rise" key={sel.id}>
            <button type="button" className="btn btn-quiet btn-sm hs-back" onClick={() => setSelId(null)}><Icon name="left" size={15} />{t('back')}</button>
            <header className="hs-dhead">
              <span className={`hs-icon hs-icon-lg s-${sel.source}`} aria-hidden="true"><Icon name={ICONS[sel.source]} size={18} /></span>
              <div className="hs-dhead-text">
                <div className="kick">{t(`source.${sel.source}`)} · {fmtDate(sel.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}, {fmtTime(sel.createdAt, lang)}</div>
                <h2 className="hs-dtitle">{chapterName(sel)}{selChapter?.title || sel.chapterTitle ? <span className="hs-dtitle-sub"> · {selChapter?.title || sel.chapterTitle}</span> : null}</h2>
              </div>
            </header>
            {sel.command && (
              <figure className="hs-said">
                <figcaption><Icon name="mic" size={13} />{t('youSaid')}</figcaption>
                <blockquote className={isDevanagari(sel.command) ? 'deva-book' : 'book'}>“{sel.command}”</blockquote>
              </figure>
            )}
            {sel.summary && <p className="hs-dsum">{sel.summary}</p>}
            {stats && (
              <div className="hs-stats" aria-label={t('stats', { a: fmtNumber(stats.added, lang), r: fmtNumber(stats.removed, lang) })}>
                <span className="hs-stat is-add" aria-hidden="true"><b className="num">+{fmtNumber(stats.added, lang)}</b>{t('added')}</span>
                <span className="hs-stat is-del" aria-hidden="true"><b className="num">−{fmtNumber(stats.removed, lang)}</b>{t('removed')}</span>
              </div>
            )}
            <div className="hs-paper">
              {formatOnly && <p className="hs-formatonly" style={{ margin: '0 0 12px', fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-3)', fontStyle: 'italic' }}>{te('tb.formatOnly')}</p>}
              <p className={`hs-diff${deva ? ' is-deva' : ''}`}>
                {parts.map((p, i) => ('gap' in p
                  ? <span key={i} className="hs-gap" aria-hidden="true"><span>⁂</span></span>
                  : p.type === 'same' ? <span key={i}>{p.text}</span>
                  : p.type === 'add' ? <ins key={i} className="ins">{p.text}</ins>
                  : <del key={i} className="del">{p.text}</del>))}
              </p>
            </div>
            <div className="hs-actions">
              <button type="button" className="btn btn-primary" onClick={() => setConfirm('before')} disabled={!selChapter}><Icon name="undo" size={16} />{t('restoreBefore')}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm('after')} disabled={!selChapter}>{t('restoreThis')}</button>
              {selChapter && <button type="button" className="btn btn-quiet" onClick={() => nav(bookPath(book.id, 'write', selChapter.id))}><Icon name="pen" size={15} />{t('openMs')}</button>}
            </div>
            <p className="hs-legend">{t('legend')}</p>
          </article>
        )}
      </section>

      <ConfirmDialog
        open={!!confirm}
        danger={false}
        title={confirm === 'before' ? t('confirmBeforeTitle') : t('confirmThisTitle')}
        body={t('confirmBody', { chapter: sel ? chapterName(sel) : '' })}
        confirmLabel={t('confirm')}
        onConfirm={doRestore}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
