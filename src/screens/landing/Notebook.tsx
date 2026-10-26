import { useLayoutEffect, useRef, useState } from 'react';
import { Waveform } from '@/components/Waveform';
import { Icon } from '@/components/Icon';
import type { LandingCopy } from './copy';
import { useLoopClock, useOnScreen, useReducedMotion } from './useMotion';

/**
 * The living notebook: one seamless 20-second loop of a writing session.
 *   0.0 – 7.0   the author dictates; raw words arrive, then settle into punctuated text
 *   7.0 – 10.6  the author speaks a voice edit (waveform turns vermilion)
 *  10.6 – 12.6  BolToBook finds the earlier passage (page scrolls up to it)
 *  12.6 – 16.6  the change is shown: removed marks struck, the author's own words added
 *  16.0         the author taps Accept → "Saved as a new version"
 *  17.6 – 20.0  back to the chapter being written; the paragraph fades for the next loop
 */
const LOOP = 20;
const T = { rawEnd: 6.1, write: 7, cmd: 10.6, find: 12.6, insStart: 13.1, actions: 14.9, accept: 16, merged: 16.6, back: 17.8, fade: 19.2 };
/** What a reduced-motion visitor sees: the change shown, waiting for the author's yes. */
const STATIC_T = 15.4;

type Phase = 'write' | 'cmd' | 'find' | 'diff' | 'merged' | 'back';

function phaseAt(t: number): Phase {
  if (t < T.write) return 'write';
  if (t < T.cmd) return 'cmd';
  if (t < T.find) return 'find';
  if (t < T.merged) return 'diff';
  if (t < T.back) return 'merged';
  return 'back';
}

function words(s: string) { return s.split(/\s+/).filter(Boolean); }

export function Notebook({ copy, deva }: { copy: LandingCopy['demo']; deva: boolean }) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(box);
  const [paused, setPaused] = useState(false);
  const running = onScreen && !reduced && !paused;
  const clock = useLoopClock(LOOP, running);
  const t = reduced ? STATIC_T : clock;
  const phase = phaseAt(t);

  // Measure how far to scroll the manuscript to show the later chapter.
  const laterRef = useRef<HTMLDivElement>(null);
  const [laterTop, setLaterTop] = useState(420);
  useLayoutEffect(() => {
    const el = laterRef.current;
    if (!el) return;
    const measure = () => setLaterTop(el.offsetTop - 8);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el.parentElement ?? el);
    return () => ro?.disconnect();
  }, [deva]);

  const raw = words(copy.later.raw);
  const nRaw = phase === 'write' ? Math.max(0, Math.min(raw.length, Math.floor((t - 0.5) / ((T.rawEnd - 0.9) / raw.length)))) : raw.length;
  const tidied = t >= T.rawEnd;
  const cmd = words(copy.instruction);
  const nCmd = phase === 'cmd' ? Math.min(cmd.length, Math.floor((t - T.write) / ((T.cmd - T.write - 0.5) / cmd.length)) + 1) : cmd.length;
  const ins = words(copy.earlier.target.ins);
  const nIns = phase === 'diff' ? Math.max(0, Math.min(ins.length, Math.floor((t - T.insStart) / 0.28) + 1)) : 0;

  const atEarlier = phase === 'find' || phase === 'diff' || phase === 'merged';
  const scrollY = atEarlier ? 0 : -laterTop;
  const showActions = phase === 'diff' && t >= T.actions;
  const pressed = phase === 'diff' && t >= T.accept;
  const showToast = (phase === 'diff' && t >= T.accept + 0.2) || phase === 'merged' || (phase === 'back' && t < T.back + 0.8);
  const step = phase === 'write' || phase === 'cmd' || phase === 'back' ? 0 : phase === 'find' ? 1 : phase === 'diff' && t < T.actions ? 2 : 3;
  const fading = phase === 'back' && t >= T.fade;

  const waveColor = phase === 'cmd' ? 'var(--edit)' : phase === 'write' || phase === 'back' ? 'var(--brand-2)' : 'var(--ink-faint)';
  const waveOn = running && ((phase === 'write' && t < T.rawEnd) || phase === 'cmd');
  const dockLabel = { write: copy.dock.dictating, cmd: copy.dock.voiceEdit, find: copy.dock.finding, diff: pressed ? copy.dock.accepted : copy.dock.found, merged: copy.dock.accepted, back: copy.dock.back }[phase];
  const dockText = {
    write: nRaw ? raw.slice(Math.max(0, nRaw - 9), nRaw).join(' ') : copy.dock.listening,
    cmd: '“' + cmd.slice(0, nCmd).join(' ') + (nCmd >= cmd.length ? '”' : ''),
    find: copy.dock.findingText,
    diff: pressed ? copy.dock.acceptedText : copy.dock.shown,
    merged: copy.dock.acceptedText,
    back: copy.dock.backText,
  }[phase];

  const tg = copy.earlier.target;
  const lead = tg.punct ? tg.punct + ' ' : ' ';
  const bookCls = deva ? 'deva-book' : 'book';

  return (
    <figure className="lp-nb" ref={box} aria-label={copy.label}>
      <p className="sr-only">{copy.srDesc}</p>
      <div className="lp-nb-top" aria-hidden="true">
        <ol className="lp-steps" aria-label={copy.stepsLabel}>
          {copy.steps.map((s, i) => (
            <li key={s} className={i === step ? 'is-on' : ''}>{s}</li>
          ))}
        </ol>
      </div>
      {!reduced && (
        <button type="button" className="lp-nb-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? copy.play : copy.pause}>
          <Icon name={paused ? 'play' : 'pause'} size={14} />
        </button>
      )}
      <div className="page lp-nb-page" aria-hidden="true">
        <span className="lp-nb-gutter" />
        <span className="ribbon lp-nb-ribbon" />
        <div className="lp-nb-scroll" style={{ transform: `translateY(${scrollY}px)` }}>
          <div className="lp-nb-ch">
            <div className="lp-nb-head"><span>{copy.earlier.head}</span><span>{copy.earlier.page}</span></div>
            <p className={bookCls}>{copy.earlier.p1}</p>
            <p className={`${bookCls} lp-nb-target ${phase === 'find' && t > T.cmd + 0.9 ? 'is-found' : ''} ${phase === 'diff' ? 'is-diff' : ''}`}>
              {tg.before}
              {phase === 'diff' ? (
                <>
                  {tg.del && <span className="del">{tg.del}</span>}
                  {tg.punct && <span className="ins">{tg.punct}</span>}
                  {' '}
                  {nIns > 0 && <span className="ins">{ins.slice(0, nIns).join(' ')}</span>}
                  {nIns >= ins.length && tg.after && <span className="ins">{tg.after}</span>}
                </>
              ) : phase === 'merged' ? (
                <>{lead}{tg.ins}{tg.after}</>
              ) : (
                <>{tg.del}</>
              )}
            </p>
            <div className={`lp-nb-actions ${showActions ? 'is-on' : ''}`}>
              <span>{copy.actions.label}</span>
              <span className={`btn btn-primary btn-xs ${pressed ? 'is-pressed' : ''}`}><Icon name="check" size={13} /> {copy.actions.accept}</span>
              <span className="btn btn-ghost btn-xs">{copy.actions.keep}</span>
            </div>
            <p className={bookCls}>{copy.earlier.p3}</p>
          </div>
          <div className="lp-nb-between">{copy.between}</div>
          <div className="lp-nb-ch" ref={laterRef}>
            <div className="lp-nb-head"><span>{copy.later.head}</span><span>{copy.later.page}</span></div>
            <p className={bookCls}>{copy.later.p1}</p>
            <p className={`${bookCls} lp-nb-live`} style={{ opacity: fading ? 0 : 1 }}>
              {tidied ? copy.later.book : <span className={nRaw ? 'live' : ''}>{raw.slice(0, nRaw).join(' ')}</span>}
              {(phase === 'write' || phase === 'back') && <span className="caret" />}
            </p>
          </div>
        </div>
        <div className={`lp-nb-toast ${showToast ? 'is-on' : ''}`}><Icon name="check" size={13} /> {copy.toast}</div>
      </div>
      <div className="lp-dock" aria-hidden="true">
        <span className="lp-dock-mic" style={{ background: waveColor }}><Icon name="mic" size={18} /></span>
        <Waveform active={waveOn} bars={22} height={34} color={waveColor} className="lp-dock-wave" />
        <span className="lp-dock-text">
          <span className="lp-dock-label" style={{ color: phase === 'cmd' ? 'var(--edit-ink)' : 'var(--brand-2)' }}>{dockLabel}</span>
          <span className="lp-dock-line">{dockText}</span>
        </span>
      </div>
    </figure>
  );
}
