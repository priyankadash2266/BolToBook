import { useState } from 'react';
import type { CoverSpec } from '@/data/types';
import { useLang, useT } from '@/i18n';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { TabArt } from '@/components/TabArt';
import { fmtDate, fmtRelative, fmtTime } from '@/lib/format';
import { isDevanagari } from '@/lib/text';
import { sameSpec } from './presets';
import { CoverImage } from './CoverImage';
import type { ActiveJob } from './JobProgress';
import type { CoverText } from './Previews';
import type { CoverRun } from './runs';
import { prefSummary } from './BriefPanel';

interface Props {
  runs: CoverRun[];
  job: ActiveJob | null;
  text: CoverText;
  current?: CoverSpec;
  onUse: (spec: CoverSpec) => void;
  onDownload: (run: CoverRun, index: number) => void;
  onRemove: (run: CoverRun) => void;
}

interface Pick { run: CoverRun; index: number }

export function RunHistory({ runs, job, text, current, onUse, onDownload, onRemove }: Props) {
  const t = useT('cover2');
  const [big, setBig] = useState<Pick | null>(null);
  const total = runs.length;

  return (
    <section className="c2-history" aria-labelledby="c2-history-h">
      <div className="c2-history-head">
        <h2 id="c2-history-h" className="kit-section-title">{t('history.title')}</h2>
        <p className="kit-section-hint">{t('history.hint')}</p>
      </div>
      {runs.length === 0 ? (
        <div className="c2-history-empty">
          <TabArt id="cover" className="c2-empty-art" />
          <p>{t('history.empty')}</p>
        </div>
      ) : (
        <ol className="c2-runs">
          {runs.map((r, i) => (
            <RunCard key={r.id} run={r} no={total - i} job={job?.runId === r.id ? job : null} text={text} current={current}
              onUse={onUse} onDownload={onDownload} onRemove={onRemove} onEnlarge={(index) => setBig({ run: r, index })} />
          ))}
        </ol>
      )}
      <Enlarge pick={big} text={text} current={current} onClose={() => setBig(null)} onUse={onUse} onDownload={onDownload} />
    </section>
  );
}

function RunCard({ run, no, job, text, current, onUse, onDownload, onRemove, onEnlarge }: {
  run: CoverRun; no: number; job: ActiveJob | null; text: CoverText; current?: CoverSpec;
  onUse: Props['onUse']; onDownload: Props['onDownload']; onRemove: Props['onRemove']; onEnlarge: (i: number) => void;
}) {
  const t = useT('cover2');
  const { lang } = useLang();
  const running = !!job || run.status === 'running';
  const status = job ? 'running' : run.status;
  const c = run.context;
  const runText: CoverText = { title: c.title || text.title, subtitle: c.subtitle, author: c.author, deva: c.deva };
  const tiles = job
    ? Array.from({ length: job.count }, (_, i) => job.results[i])
    : run.specs.map((spec, i) => ({ index: i, spec, mediaId: run.mediaIds[i] || undefined }));
  const prefs = prefSummary(c.prefs, t);

  return (
    <li className={`c2-run is-${status}`}>
      <span className="c2-run-dot" aria-hidden="true" />
      <article className="c2-run-card" aria-label={t('history.runN', { n: no })}>
        <header className="c2-run-head">
          <span className="c2-run-no">{t('history.runN', { n: no })}</span>
          <div className="c2-run-when">
            <b>{fmtRelative(run.createdAt, lang)}</b>
            <time dateTime={run.createdAt}>{t('history.at', { date: fmtDate(run.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' }), time: fmtTime(run.createdAt, lang) })}</time>
          </div>
          <div className="c2-run-meta">
            <span className={`tag ${status === 'failed' ? 'tag-edit' : status === 'running' ? 'tag-brass' : status === 'partial' ? 'tag-lap' : 'tag-brand'}`}>
              {status === 'running' && <span className="paid-spin c2-mini-spin" aria-hidden="true" />}
              {t(`history.status.${status}`)}
            </span>
            <span className="c2-run-cost">{t('history.designs', { n: run.count || c.count })} · {t('history.cost', { n: run.cost })}</span>
            <button type="button" className="btn btn-quiet btn-sm btn-icon c2-run-del" onClick={() => onRemove(run)} disabled={running}
              aria-label={t('history.remove')} title={t('history.remove')}><Icon name="trash" size={16} /></button>
          </div>
        </header>

        {status === 'failed' && (
          <p className="c2-run-fail">
            {run.cost === 0 ? t('history.notCharged') : run.refunded > 0 ? <>{t('history.interrupted')} {t('history.refunded', { n: run.refunded })}</> : t('history.interrupted')}
          </p>
        )}
        {status === 'partial' && run.refunded > 0 && <p className="c2-run-fail">{t('history.refunded', { n: run.refunded })}</p>}

        <details className="c2-ctx">
          <summary>
            <Icon name="feather" size={15} />
            <span className="c2-ctx-l">{t('history.context')}</span>
            <span className="c2-ctx-peek" lang={isDevanagari(c.coverBrief) ? 'hi' : undefined}>{c.coverBrief || prefs}</span>
            <Icon name="down" size={15} className="c2-caret" />
          </summary>
          <div className="c2-ctx-body">
            <div className="c2-ctx-row">
              <span className="c2-sub-l">{t('history.ctxDescribe')}</span>
              {c.coverBrief ? <blockquote className="c2-quote">{c.coverBrief}</blockquote> : <p className="cd-empty">{t('history.ctxNone')}</p>}
            </div>
            {c.brief && (
              <div className="c2-ctx-row">
                <span className="c2-sub-l">{t('history.ctxSummary')}</span>
                <p className="c2-ctx-sum">{c.brief}</p>
              </div>
            )}
            <div className="c2-ctx-chips">
              {c.themes.length > 0 && <ChipRow label={t('history.ctxThemes')} items={c.themes} />}
              <ChipRow label={t('history.ctxPrefs')} items={[prefs]} brass />
              <ChipRow label={t('history.ctxWords')} items={[c.title, c.subtitle, c.author].filter(Boolean) as string[]} />
            </div>
          </div>
        </details>

        {tiles.length > 0 && (
          <ul className="c2-covers">
            {tiles.map((r, i) => {
              if (!r) return <li key={i} className="c2-tile is-waiting"><span className="c2-tile-art"><span className="c2-slot-ph" /></span></li>;
              const isCur = !!current && sameSpec(current, r.spec);
              const label = t('history.design', { n: i + 1 });
              return (
                <li key={i} className={`c2-tile${isCur ? ' is-current' : ''} rise`}>
                  <button type="button" className="c2-tile-art" onClick={() => onEnlarge(i)} aria-label={t('history.enlarge', { n: i + 1 })}>
                    <CoverImage mediaId={r.mediaId} spec={r.spec} text={runText} alt={label} />
                    {isCur && <span className="c2-badge"><Icon name="check" size={12} weight={3} />{t('history.inUse')}</span>}
                    <span className="c2-zoom" aria-hidden="true"><Icon name="search" size={15} /></span>
                  </button>
                  <div className="c2-tile-acts">
                    <button type="button" className={`btn btn-sm c2-use ${isCur ? 'btn-quiet' : 'btn-ghost'}`} disabled={isCur || running} onClick={() => onUse(r.spec)}>
                      {isCur ? <><Icon name="check" size={14} />{t('history.inUse')}</> : t('history.use')}
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm btn-icon" disabled={!r.mediaId || running} onClick={() => onDownload(run, i)}
                      aria-label={`${t('history.download')} · ${label}`} title={t('history.download')}><Icon name="download" size={16} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </li>
  );
}

function ChipRow({ label, items, brass }: { label: string; items: string[]; brass?: boolean }) {
  return (
    <div className="c2-chiprow">
      <span className="c2-sub-l">{label}</span>
      <ul className="cd-themes">{items.map((x) => <li key={x} className={`tag ${brass ? 'tag-brass' : ''}`} lang={isDevanagari(x) ? 'hi' : undefined}>{x}</li>)}</ul>
    </div>
  );
}

function Enlarge({ pick, text, current, onClose, onUse, onDownload }: { pick: Pick | null; text: CoverText; current?: CoverSpec; onClose: () => void; onUse: Props['onUse']; onDownload: Props['onDownload'] }) {
  const t = useT('cover2');
  if (!pick) return <Modal open={false} onClose={onClose}>{null}</Modal>;
  const { run, index } = pick;
  const spec = run.specs[index];
  if (!spec) return null;
  const isCur = !!current && sameSpec(current, spec);
  const c = run.context;
  const runText: CoverText = { title: c.title || text.title, subtitle: c.subtitle, author: c.author, deva: c.deva };
  return (
    <Modal open onClose={onClose} title={t('history.design', { n: index + 1 })} width={560}>
      <div className="c2-big">
        <div className="c2-big-art cv-shadow"><CoverImage mediaId={run.mediaIds[index] || undefined} spec={spec} text={runText} alt={t('history.design', { n: index + 1 })} /></div>
        <div className="c2-big-acts">
          <button type="button" className="btn btn-primary" disabled={isCur} onClick={() => { onUse(spec); onClose(); }}>
            <Icon name="check" size={16} />{isCur ? t('history.inUse') : t('history.use')}
          </button>
          <button type="button" className="btn btn-ghost" disabled={!run.mediaIds[index]} onClick={() => onDownload(run, index)}>
            <Icon name="download" size={16} />{t('history.download')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
