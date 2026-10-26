import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NeedsManuscript, TabPage, chapterName, deskLink, useBookFont, useEntityCollection } from '@/components/kit';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { bookPath, useCurrentBook } from '@/app/context';
import { api } from '@/data/api';
import type { Chapter, Entity } from '@/data/types';
import { useLang, useT } from '@/i18n';
import { fmtDate, fmtNumber, fmtTime } from '@/lib/format';
import { applyIssues, proofreadChapter, type Issue } from '@/lib/proofread';
import { SECTIONS, buildReport, parseReport, totalFindings, type Finding, type Report, type SectionKey } from './finish/report';
import './finish/finish.css';
import './review.css';

const RUN_MS = 600;
const SHOW = 6;
const newestFirst = (a: Entity, b: Entity) => b.name.localeCompare(a.name);

export default function Review() {
  const t = useT('finish');
  const tc = useT('common');
  const toast = useToast();
  const { book, chapters } = useCurrentBook();
  const reviews = useEntityCollection('review', { sort: newestFirst });
  const [running, setRunning] = useState<'' | 'book' | 'chapter'>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ordered = useMemo(() => [...chapters].sort((a, b) => a.order - b.order), [chapters]);
  const writtenChapters = ordered.filter((c) => c.content.trim());
  const [chapterId, setChapterId] = useState('');

  if (!book) return null;
  const hasText = writtenChapters.length > 0;

  const run = (onlyChapterId?: string) => {
    if (running) return;
    setRunning(onlyChapterId ? 'chapter' : 'book');
    setTimeout(async () => {
      try {
        const [characters, places, events, laps] = await Promise.all([
          api.entities.list(book.id, 'character'), api.entities.list(book.id, 'place'), api.entities.list(book.id, 'event'), api.laps.list({ bookId: book.id }),
        ]);
        const report = buildReport({ chapters, lang: book.lang, characters, places, events, laps, chapterLabel: (n) => tc('chapterN', { n }), onlyChapterId });
        const e = await api.entities.create({ bookId: book.id, kind: 'review', name: new Date().toISOString(), fields: { report: JSON.stringify(report), scope: report.scope, chapterId: onlyChapterId ?? '' } });
        setSelectedId(e.id);
      } catch {
        toast.show(t('failed'));
      } finally {
        setRunning('');
      }
    }, RUN_MS);
  };

  const selected = reviews.items.find((r) => r.id === selectedId) ?? reviews.items[0];
  const report = selected ? parseReport(selected.fields.report) : undefined;
  const chosen = chapterId && writtenChapters.some((c) => c.id === chapterId) ? chapterId : writtenChapters[0]?.id ?? '';

  return (
    <TabPage tabId="review">
      {!hasText ? <NeedsManuscript /> : (
        <div className="rvx">
          <section className="rv-run panel" aria-busy={!!running}>
            <p className="rv-intro">{t('review.intro')}</p>
            <div className="rv-run-row">
              <button type="button" className="btn btn-primary btn-lg rv-run-main" onClick={() => run()} disabled={!!running}>
                <Icon name="eye" size={18} />{t('review.run')}
              </button>
              <div className="rv-run-ch">
                <label className="sr-only" htmlFor="rv-ch">{t('review.chapterLabel')}</label>
                <select id="rv-ch" className="select" value={chosen} onChange={(e) => setChapterId(e.target.value)} disabled={!!running}>
                  {ordered.map((c, i) => c.content.trim() ? <option key={c.id} value={c.id}>{i + 1}. {chapterName(c, i, tc)}</option> : null)}
                </select>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(chosen)} disabled={!!running || !chosen}>{t('review.runChapter')}</button>
              </div>
            </div>
            {running && (
              <div className="rv-progress" role="status">
                <span className="rv-progress-bar" style={{ animationDuration: `${RUN_MS}ms` }} aria-hidden="true" />
                <span className="rv-progress-text">{running === 'chapter' ? t('review.runningChapter') : t('review.running')}</span>
              </div>
            )}
          </section>

          {selected && report && <ReportView entity={selected} report={report} chapters={ordered} />}

          <section className="rv-earlier" aria-labelledby="rv-earlier-h">
            <h2 id="rv-earlier-h" className="kit-section-title">{t('review.earlier')}</h2>
            <p className="kit-section-hint">{t('review.earlierHint')}</p>
            {reviews.items.length === 0 ? <p className="muted rv-none">{t('review.noEarlier')}</p> : (
              <ul className="rv-list">
                {reviews.items.map((r) => <EarlierRow key={r.id} entity={r} current={r.id === selected?.id} onOpen={() => setSelectedId(r.id)} onRemove={() => reviews.remove(r)} />)}
              </ul>
            )}
          </section>
        </div>
      )}
    </TabPage>
  );
}

function when(iso: string, lang: 'en' | 'hi') {
  return `${fmtDate(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' })}, ${fmtTime(iso, lang)}`;
}

function EarlierRow({ entity, current, onOpen, onRemove }: { entity: Entity; current: boolean; onOpen: () => void; onRemove: () => void }) {
  const t = useT('finish');
  const { lang } = useLang();
  const r = parseReport(entity.fields.report);
  const n = r ? totalFindings(r) : 0;
  return (
    <li className={`rv-row${current ? ' is-current' : ''}`}>
      <button type="button" className="rv-row-main" onClick={onOpen} aria-current={current || undefined}>
        <span className="rv-row-date">{when(entity.name, lang)}</span>
        <span className="rv-row-meta">
          {r?.scope === 'chapter' ? (r.chapterTitle ?? '') : t('review.bookScope')} · {t('review.count', { n: fmtNumber(n, lang) })}
        </span>
      </button>
      {current ? <span className="tag tag-brand">{t('review.current')}</span> : null}
      <button type="button" className="kit-iconbtn" onClick={onRemove} aria-label={t('review.remove')}><Icon name="trash" size={15} /></button>
    </li>
  );
}

function ReportView({ entity, report, chapters }: { entity: Entity; report: Report; chapters: Chapter[] }) {
  const t = useT('finish');
  const { lang } = useLang();
  const date = when(entity.name, lang);
  const n = totalFindings(report);
  const stale = chapters.some((c) => c.updatedAt > entity.name);
  const vars = { chapters: fmtNumber(report.chapterCount, lang), words: fmtNumber(report.words, lang), n: fmtNumber(n, lang) };
  return (
    <section className="rv-report" aria-labelledby="rv-report-h">
      <header className="rv-report-head">
        <h2 id="rv-report-h" className="kit-section-title">
          {report.scope === 'chapter' ? t('review.ofChapter', { title: report.chapterTitle ?? '', date }) : t('review.of', { date })}
        </h2>
        <p className="rv-report-sum">{n === 1 ? t('review.summaryOne', vars) : t('review.summary', vars)}</p>
        <p className="rv-neutral"><Icon name="eye" size={14} />{t('review.neutral')}</p>
        {stale && <p className="rv-stale">{t('review.stale', { date })}</p>}
      </header>
      <div className="rv-cards">
        {SECTIONS.map((k) => (
          <SectionCard key={`${entity.id}-${k}`} k={k} findings={report[k]}>
            {k === 'pacing' && <PaceBars report={report} chapters={chapters} />}
            {k === 'language' && <ProofPanel chapters={report.scope === 'chapter' ? chapters.filter((c) => c.id === report.chapterId) : chapters} />}
          </SectionCard>
        ))}
      </div>
    </section>
  );
}

function SectionCard({ k, findings, children }: { k: SectionKey; findings: Finding[]; children?: ReactNode }) {
  const t = useT('finish');
  const { lang } = useLang();
  const [open, setOpen] = useState(findings.length > 0 || !!children);
  const [all, setAll] = useState(false);
  const shown = all ? findings : findings.slice(0, SHOW);
  const id = `rv-sec-${k}`;
  return (
    <article className={`rv-card rv-card-${k}${open ? ' is-open' : ''}`}>
      <h3 className="rv-card-h">
        <button type="button" className="rv-card-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span className="rv-card-title">{t(`review.sec.${k}.t`)}</span>
          <span className={`rv-count medal${findings.length ? '' : ' is-zero'}`}>{fmtNumber(findings.length, lang)}</span>
          <span className="rvx-caret" aria-hidden="true"><Icon name="down" size={16} /></span>
        </button>
      </h3>
      {open && (
        <div id={id} className="rv-card-body">
          <p className="rv-card-d">{t(`review.sec.${k}.d`)}</p>
          {children}
          {findings.length === 0 ? <p className="rv-nothing">{t('review.nothing')}</p> : (
            <ul className="rv-findings">
              {shown.map((f, i) => <FindingRow key={i} f={f} />)}
            </ul>
          )}
          {findings.length > SHOW && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAll((a) => !a)}>
              {all ? t('review.showLess') : t('review.showAll', { n: fmtNumber(findings.length, lang) })}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const t = useT('finish');
  const { lang } = useLang();
  const { book, chapters } = useCurrentBook();
  const font = useBookFont();
  if (!book) return null;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(f.vars)) vars[k] = typeof v === 'number' && (k === 'words' || k === 'na' || k === 'nb') ? fmtNumber(v, lang) : v;
  if (f.kind === 'describedTwo') vars.feature = t(`review.feature.${f.vars.feature}`);
  const ids = new Set(chapters.map((c) => c.id));
  const quote = f.quote ?? f.links.find((l) => l.quote)?.quote;
  return (
    <li className="rv-finding">
      <p className="rv-finding-text">{t(`review.f.${f.kind}`, vars)}</p>
      {quote && <blockquote className={`rv-quote ${font}`}>{quote}</blockquote>}
      {(f.links.length > 0 || f.tab) && (
        <div className="rv-links">
          {f.links.map((l, i) => ids.has(l.chapterId) ? (
            <Link key={i} className="chip rv-link" to={deskLink(book.id, l.chapterId, { para: l.para, find: l.find })} title={t('review.goTo')}>
              <span className="rvx-chn">{t('review.chN', { n: l.n })}</span><span className="rv-link-t">{l.title}</span><Icon name="arrow" size={12} className="rvx-go" />
            </Link>
          ) : (
            <span key={i} className="chip chip-static rv-link"><span className="rvx-chn">{t('review.chN', { n: l.n })}</span><span className="rv-link-t">{l.title}</span></span>
          ))}
          {f.tab && <Link className="chip rv-link" to={bookPath(book.id, f.tab)}><Icon name="arrow" size={13} />{t(`review.openTab.${f.tab}`)}</Link>}
        </div>
      )}
    </li>
  );
}

function PaceBars({ report, chapters }: { report: Report; chapters: Chapter[] }) {
  const t = useT('finish');
  const { lang } = useLang();
  const { book } = useCurrentBook();
  const rows = report.stats.filter((s) => s.words > 0);
  if (!book || !rows.length) return null;
  const max = Math.max(...rows.map((s) => s.words), report.avgWords, 1);
  const avgPct = (report.avgWords / max) * 100;
  const ids = new Set(chapters.map((c) => c.id));
  return (
    <figure className="rv-bars" aria-label={t('review.bars.label')}>
      <figcaption className="rv-bars-cap">
        <span className="kick">{t('review.bars.label')}</span>
        <span className="rv-bars-avg"><i aria-hidden="true" />{t('review.bars.avg', { n: fmtNumber(report.avgWords, lang) })}</span>
      </figcaption>
      <ol className="rv-bars-list">
        {rows.map((s) => {
          const far = report.avgWords > 0 && Math.abs(s.words - report.avgWords) > report.avgWords * 0.6 && report.chapterCount >= 3;
          const mine = report.scope === 'chapter' && s.chapterId === report.chapterId;
          const label = t('review.bars.bar', { title: `${s.n}. ${s.title}`, n: fmtNumber(s.words, lang) });
          const inner = (
            <>
              <span className="rv-bar-name">{s.n}. {s.title}</span>
              <span className="rv-bar-track" aria-hidden="true">
                <span className={`rv-bar-fill${far ? ' is-far' : ''}${mine ? ' is-mine' : ''}`} style={{ width: `${Math.max(1.5, (s.words / max) * 100)}%` }} />
                <span className="rv-bar-avg" style={{ left: `${avgPct}%` }} />
              </span>
              <span className="rv-bar-n">{fmtNumber(s.words, lang)}</span>
            </>
          );
          return (
            <li key={s.chapterId}>
              {ids.has(s.chapterId) ? <Link className="rv-bar" to={deskLink(book.id, s.chapterId)} aria-label={label}>{inner}</Link> : <span className="rv-bar" aria-label={label}>{inner}</span>}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Proofreading slips, live: accept or skip one by one                  */
/* ------------------------------------------------------------------ */

const issueKey = (i: Issue) => `${i.chapterId}|${i.paraIndex}|${i.start}|${i.original}|${i.pre}`;

function ProofPanel({ chapters }: { chapters: Chapter[] }) {
  const t = useT('finish');
  const tc = useT('common');
  const { lang } = useLang();
  const { book, chapters: all } = useCurrentBook();
  const [openId, setOpenId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    if (!book) return [];
    const order = [...all].sort((a, b) => a.order - b.order);
    return chapters.filter((c) => c.content.trim()).map((c) => {
      const i = order.findIndex((x) => x.id === c.id);
      return { c, n: i + 1, name: chapterName(c, i, tc), issues: proofreadChapter(c, book.lang).filter((x) => !skipped.has(issueKey(x))) };
    }).filter((r) => r.issues.length > 0);
  }, [book, chapters, all, skipped, tc]);
  if (!book) return null;
  return (
    <div className="rv-proof">
      <div className="rv-proof-head">
        <span className="kick">{t('review.proof.title')}</span>
        <p className="rv-proof-hint">{t('review.proof.hint')}</p>
      </div>
      {rows.length === 0 ? <p className="rv-nothing">{t('review.proof.none')}</p> : (
        <ul className="rv-proof-list">
          {rows.map((r) => (
            <li key={r.c.id} className="rv-proof-ch">
              <div className="rv-proof-row">
                <span className="rv-proof-name">{r.n}. {r.name}</span>
                <span className="tag tag-edit">{r.issues.length === 1 ? t('review.proof.slipsOne') : t('review.proof.slips', { n: fmtNumber(r.issues.length, lang) })}</span>
                <button type="button" className="btn btn-ghost btn-sm" aria-expanded={openId === r.c.id} onClick={() => setOpenId((o) => (o === r.c.id ? null : r.c.id))}>
                  {openId === r.c.id ? t('review.proof.close') : t('review.proof.go')}
                </button>
              </div>
              {openId === r.c.id && <ProofList chapter={r.c} issues={r.issues} onSkip={(i) => setSkipped((s) => new Set(s).add(issueKey(i)))} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const vis = (s: string) => s.replace(/ /g, '␣');

function ProofList({ chapter, issues, onSkip }: { chapter: Chapter; issues: Issue[]; onSkip: (i: Issue) => void }) {
  const t = useT('finish');
  const toast = useToast();
  const font = useBookFont();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const list = issues.filter((i) => !busy.has(issueKey(i))).slice(0, 8);
  const accept = async (i: Issue) => {
    const key = issueKey(i);
    setBusy((s) => new Set(s).add(key));
    try {
      const fresh = await api.chapters.get(chapter.id);
      if (!fresh) throw new Error('gone');
      const next = applyIssues(fresh, [i]);
      if (next !== fresh.content) {
        await api.chapters.update(chapter.id, { content: next }, { source: 'proofread', summary: t('review.proof.summary', { rule: t(`review.proof.rule.${i.rule}`) }) });
        toast.show(t('review.proof.accepted'));
      }
    } catch {
      toast.show(t('failed'));
      setBusy((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  };
  if (!list.length) return <p className="rv-nothing">{t('review.proof.allDone')}</p>;
  return (
    <ol className="rv-issues">
      {list.map((i) => (
        <li key={issueKey(i)} className="rv-issue">
          <span className="rv-issue-rule">{t(`review.proof.rule.${i.rule}`)}</span>
          <span className={`rv-issue-ctx ${font}`}>
            {i.pre && <span className="faint">…{i.pre}</span>}
            <del className="del">{vis(i.original)}</del>
            {i.replacement && <ins className="ins">{vis(i.replacement)}</ins>}
            {i.post && <span className="faint">{i.post}…</span>}
          </span>
          <span className="rv-issue-act">
            <button type="button" className="btn btn-primary btn-xs" onClick={() => accept(i)}><Icon name="check" size={14} />{t('review.proof.accept')}</button>
            <button type="button" className="btn btn-quiet btn-xs" onClick={() => onSkip(i)}>{t('review.proof.skip')}</button>
          </span>
        </li>
      ))}
    </ol>
  );
}
