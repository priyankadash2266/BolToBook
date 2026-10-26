import { useT } from '@/i18n';
import { Icon } from '@/components/Icon';
import { isDevanagari } from '@/lib/text';
import type { WordMatch } from '@/screens/tabs/finish/coverWords';
import { STEPS, type CoverResult, type StepKey } from './coverJobs';
import { CoverImage } from './CoverImage';
import type { CoverText } from './Previews';

export interface ActiveJob {
  runId: string;
  count: number;
  step: StepKey;
  fraction: number;
  results: CoverResult[];
  matched: WordMatch[];
  /** The job has returned; waiting for the stored run to catch up. */
  finished?: boolean;
}

/** The running job: four steps, a progress rule, and each cover appearing as it's ready. */
export function JobProgress({ job, text }: { job: ActiveJob; text: CoverText }) {
  const t = useT('cover2');
  const cur = STEPS.indexOf(job.step);
  const ready = job.results.length;
  return (
    <div className="c2-job rise" role="status" aria-live="polite">
      <div className="c2-job-head">
        <span className="kick">{t('jobTitle', { n: job.count })}</span>
        <span className="c2-job-n">{t('progress', { done: ready, n: job.count })}</span>
      </div>
      <ol className="c2-steps">
        {STEPS.map((s, i) => {
          const state = job.finished || i < cur ? 'done' : i === cur ? 'now' : 'next';
          return (
            <li key={s} className={`c2-step is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="c2-step-dot" aria-hidden="true">{state === 'done' ? <Icon name="check" size={11} weight={3} /> : null}</span>
              <span className="c2-step-l">{t(`steps.${s}`)}</span>
            </li>
          );
        })}
      </ol>
      <div className="c2-bar" aria-hidden="true"><span style={{ transform: `scaleX(${job.finished ? 1 : Math.max(0.03, job.fraction)})` }} /></div>
      {job.step === 'imagery' && job.matched.length > 0 && (
        <ul className="cd-picked-list c2-job-words">
          {job.matched.map((m) => <li key={m.word} className="tag tag-brass" lang={isDevanagari(m.word) ? 'hi' : undefined}>{m.word}</li>)}
        </ul>
      )}
      <div className="c2-job-covers" style={{ ['--n' as string]: job.count, ['--nm' as string]: job.count > 4 ? 3 : job.count }}>
        {Array.from({ length: job.count }, (_, i) => {
          const r = job.results[i];
          return (
            <span key={i} className={`c2-slot${r ? ' is-ready' : ''}`}>
              {r ? <CoverImage mediaId={r.mediaId} spec={r.spec} text={text} alt={t('history.design', { n: i + 1 })} /> : <span className="c2-slot-ph" aria-hidden="true" />}
            </span>
          );
        })}
      </div>
    </div>
  );
}
