import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Segmented } from '@/components/Segmented';
import { Waveform } from '@/components/Waveform';
import { Icon } from '@/components/Icon';
import { CoverArt } from '@/components/CoverArt';
import type { CoverSpec } from '@/data/types';
import type { CleanSeg, LandingCopy, MemoryEntry, ProofSeg } from './copy';
import { useReducedMotion } from './useMotion';

type J = LandingCopy['journey'];
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

/* I. Capture a Lap at 2:14 a.m. */
export function LapDemo({ c, deva }: { c: J['lap']; deva: boolean }) {
  const reduced = useReducedMotion();
  const words = c.words.split(/\s+/);
  const [n, setN] = useState(-1); // -1 idle, 0..len recording, len+1 saved
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const rec = n >= 0 && n <= words.length;
  const saved = n > words.length;
  const capture = () => {
    clearInterval(timer.current);
    if (reduced) { setN(words.length + 1); return; }
    setN(0);
    let i = 0;
    timer.current = setInterval(() => {
      i += 1;
      setN(i);
      if (i > words.length) clearInterval(timer.current);
    }, 300);
  };
  return (
    <div className="lp-phone">
      <div className="lp-phone-time display">{c.time}</div>
      <div className="lp-phone-day">{c.day}</div>
      <div className="lp-phone-card" aria-live="polite">
        <div className="lp-phone-label">{saved ? c.savedLabel : rec ? c.listening : c.newLap}</div>
        <p className={deva ? 'deva-book' : 'book'}>
          {n < 0 ? <span className="lp-phone-ph">{c.placeholder}</span> : words.slice(0, Math.max(1, Math.min(words.length, n))).join(' ')}
          {rec && <span className="caret lp-caret-lap" />}
        </p>
        {saved && <div className="lp-phone-saved rise"><Icon name="check" size={14} /> {c.saved}</div>}
      </div>
      <button type="button" className={`lp-phone-btn ${rec ? 'is-rec' : ''}`} onClick={capture} aria-label={c.aria}>
        <Waveform active={rec} bars={7} height={36} color="#D9B65F" />
      </button>
      <div className="lp-phone-hint">{saved ? c.again : c.hint}</div>
    </div>
  );
}

/* II. The Lap waiting in the margin of the chapter the author pinned it to. */
export function MarginDemo({ c, deva }: { c: J['margin']; deva: boolean }) {
  const [state, setState] = useState<'wait' | 'used' | 'later'>('wait');
  return (
    <div className="page lp-margin">
      <div className="lp-margin-text">
        <div className="lp-cap">{c.chapter}</div>
        <p className={deva ? 'deva-book' : 'book'}>{c.text}<span className="caret" aria-hidden="true" /></p>
      </div>
      <aside className={`lp-margin-lap ${state === 'used' ? 'is-used' : ''}`} aria-label={c.from}>
        <div className="lp-margin-from">{c.from}</div>
        <div className="lp-margin-when">{c.waiting}</div>
        <p className={deva ? 'deva-book' : 'book'}>“{c.lap}”</p>
        {state === 'wait' ? (
          <div className="lp-margin-acts">
            <button type="button" className="chip lp-chip-lap" onClick={() => setState('used')}>{c.use}</button>
            <button type="button" className="chip" onClick={() => setState('later')}>{c.later}</button>
          </div>
        ) : (
          <div className="lp-margin-note rise" aria-live="polite">
            {state === 'used' ? c.usedNote : c.laterNote}{' '}
            <button type="button" className="lp-linkbtn" onClick={() => setState('wait')}>{c.reset}</button>
          </div>
        )}
      </aside>
    </div>
  );
}

/* III. Index cards along an arc; the selected card shows the author's note verbatim. */
export function PlanDemo({ c, deva }: { c: J['plan']; deva: boolean }) {
  const [sel, setSel] = useState(2);
  const card = c.cards[sel];
  const lift = [0, 26, 40, 26, 0];
  return (
    <div className="lp-plan">
      <div className="lp-plan-arc" role="group" aria-label={c.label}>
        <svg className="lp-plan-curve" viewBox="0 0 500 80" preserveAspectRatio="none" aria-hidden="true">
          <path d="M10 70 Q250 -30 490 70" fill="none" stroke="var(--line-2)" strokeWidth="2" strokeDasharray="4 6" />
        </svg>
        {c.cards.map((k, i) => (
          <button
            key={k.ch}
            type="button"
            className={`page lp-card ${i === sel ? 'is-on' : ''}`}
            style={{ ['--lift' as string]: `${-lift[i]}px`, ['--rot' as string]: `${(i - 2) * 2.4}deg` }}
            aria-pressed={i === sel}
            onClick={() => setSel(i)}
          >
            <span className="lp-card-beat">{k.beat}</span>
            <span className="lp-card-ch">{k.ch}</span>
            <span className={`lp-card-title ${deva ? 'deva-book' : 'book'}`}>{k.title}</span>
            <span className="lp-card-who">{k.who}</span>
          </button>
        ))}
      </div>
      <div className="lp-plan-said" aria-live="polite">
        <span className="lp-plan-mic" aria-hidden="true"><Icon name="mic" size={14} /></span>
        <div>
          <div className="lp-cap">{c.saidLabel} · {card.ch}</div>
          <p className={deva ? 'deva-book' : 'book'}>“{card.said}”</p>
          <div className="lp-small">{c.kept}</div>
        </div>
      </div>
    </div>
  );
}

/* IV. What you said vs Clean: only punctuation and fillers change, every change marked. */
export function SpeakDemo({ c, deva }: { c: J['speak']; deva: boolean }) {
  const [view, setView] = useState<'raw' | 'clean'>('clean');
  const seg = (s: CleanSeg, i: number) =>
    typeof s === 'string' ? <span key={i}>{s}</span> : 'd' in s ? <del key={i} className="del">{s.d}</del> : <ins key={i} className="ins">{s.i}</ins>;
  return (
    <div>
      <Segmented label={c.label} value={view} onChange={setView} options={[{ value: 'raw', label: c.raw }, { value: 'clean', label: c.clean }]} />
      <div className="page lp-sheet">
        <p className={`${deva ? 'deva-book' : 'book'} lp-sheet-text`}>
          {view === 'raw' ? <span className="lp-raw">{c.rawText}</span> : c.cleanSegs.map(seg)}
        </p>
        <hr className="divider lp-sheet-rule" />
        <div className="lp-small" aria-live="polite">{view === 'raw' ? c.rawNote : c.cleanNote}</div>
      </div>
    </div>
  );
}

/* V. Find a moment by describing it. */
export function FindDemo({ c, deva }: { c: J['find']; deva: boolean }) {
  const [q, setQ] = useState(0);
  const cur = c.queries[q];
  return (
    <div>
      <div className="lp-chips" role="group" aria-label={c.label}>
        {c.queries.map((x, i) => (
          <button key={x.label} type="button" className="chip" aria-pressed={i === q} onClick={() => setQ(i)}>{x.label}</button>
        ))}
      </div>
      <div className="page lp-find">
        <div className="lp-find-q">
          <Waveform active={false} bars={4} height={18} color="var(--brand-2)" />
          <span className="sr-only">{c.listening}: </span>
          <span className={`${deva ? 'deva-book' : 'book'} lp-find-qtext`}>“{cur.text}”</span>
        </div>
        <ul className="lp-find-list" aria-live="polite">
          {cur.results.map((r) => (
            <li key={r.ch + r.pg}>
              <div className="lp-find-ch"><strong>{r.ch}</strong><span>{r.pg}</span></div>
              <div className="lp-find-body">
                <div className="lp-find-tag">{r.tag}</div>
                <div className={deva ? 'deva-book' : 'book'}>…{r.pre}<mark className="hit">{r.hit}</mark>{r.post}…</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="lp-find-foot"><Link to="/start" className="btn btn-ghost btn-sm">{c.try} <Icon name="right" size={14} /></Link></div>
      </div>
    </div>
  );
}

/* VI. It remembers what you saved, and where each one appears. */
export function MemoryDemo({ c, deva }: { c: J['memory']; deva: boolean }) {
  const [tab, setTab] = useState<'people' | 'places' | 'notes'>('people');
  const list: MemoryEntry[] = c[tab];
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [tab]);
  const e = list[Math.min(sel, list.length - 1)];
  return (
    <div>
      <Segmented label={c.label} value={tab} onChange={setTab} options={[{ value: 'people', label: c.tabs.people }, { value: 'places', label: c.tabs.places }, { value: 'notes', label: c.tabs.notes }]} />
      <div className="page lp-mem">
        <ul className="lp-mem-list" role="list">
          {list.map((x, i) => (
            <li key={x.name}>
              <button type="button" aria-pressed={i === sel} onClick={() => setSel(i)} className={deva ? 'deva-book' : 'book'}>{x.name}</button>
            </li>
          ))}
        </ul>
        <div className="lp-mem-card" aria-live="polite">
          <div className={`lp-mem-name ${deva ? 'deva-book' : 'book'}`}>{e.name}</div>
          <div className="lp-cap">{c.noteLabel}</div>
          <p className={`${deva ? 'deva-book' : 'book'} lp-mem-note`}>{e.note}</p>
          <div className="lp-cap">{c.appearsLabel}</div>
          <div className="lp-mem-ch">
            {e.appears.map((n) => <span key={n} className="tag">{fill(c.ch, { n })}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* VII. Proofreading: spelling and punctuation only; every fix is a tap-to-accept mark. */
export function ProofDemo({ c, deva }: { c: J['proof']; deva: boolean }) {
  const fixes = c.segs.filter((s): s is { from: string; to: string } => typeof s !== 'string');
  const [view, setView] = useState<'before' | 'after'>('after');
  const [ok, setOk] = useState<Set<number>>(new Set());
  let k = -1;
  const render = (s: ProofSeg, i: number) => {
    if (typeof s === 'string') return <span key={i}>{s}</span>;
    k += 1;
    const idx = k;
    if (view === 'before') return <span key={i}>{s.from}</span>;
    if (ok.has(idx)) return <span key={i} className="lp-proof-done">{s.to}</span>;
    return (
      <button key={i} type="button" className="lp-proof-fix" onClick={() => setOk((o) => new Set(o).add(idx))} aria-label={fill(c.fixAria, { from: s.from.trim(), to: s.to.trim() })}>
        <del className="del">{s.from}</del><ins className="ins">{s.to}</ins>
      </button>
    );
  };
  return (
    <div>
      <Segmented label={c.label} value={view} onChange={setView} options={[{ value: 'before', label: c.before }, { value: 'after', label: c.after }]} />
      <div className="page lp-sheet">
        <p className={`${deva ? 'deva-book' : 'book'} lp-sheet-text`}>{c.segs.map(render)}</p>
        <hr className="divider lp-sheet-rule" />
        {view === 'before' ? (
          <div className="lp-small">{c.beforeNote}</div>
        ) : (
          <div className="lp-proof-foot">
            <span className="lp-small" aria-live="polite">{fill(c.count, { n: ok.size, total: fixes.length })} · {c.hint}</span>
            {ok.size < fixes.length ? (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOk(new Set(fixes.map((_, i) => i)))}>{c.acceptAll}</button>
            ) : (
              <button type="button" className="btn btn-quiet btn-xs" onClick={() => setOk(new Set())}>{c.reset}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* VIII. Three cover directions drawn with the shared CoverArt. */
const SPECS: CoverSpec[] = [
  { direction: 'night', mood: 'night', type: 'italic', motif: 'rail', layout: 'bottom', seed: 3 },
  { direction: 'ember', mood: 'ember', type: 'sans', motif: 'sun', layout: 'top', seed: 5 },
  { direction: 'paper', mood: 'paper', type: 'serif', motif: 'hills', layout: 'center', seed: 8 },
];
export function CoverDemo({ c, deva }: { c: J['cover']; deva: boolean }) {
  const [sel, setSel] = useState(0);
  return (
    <div className="lp-covers">
      <div className="lp-covers-row" role="group" aria-label={fill(c.selected, { name: c.directions[sel] })}>
        {SPECS.map((s, i) => (
          <button key={s.direction} type="button" className={`lp-cover ${i === sel ? 'is-on' : ''}`} aria-pressed={i === sel} aria-label={fill(c.aria, { name: c.directions[i] })} onClick={() => setSel(i)}>
            <CoverArt title={c.title} author={c.author} subtitle={c.subtitle} spec={s} width={150} deva={deva} />
          </button>
        ))}
      </div>
      <div className="lp-small lp-center" aria-live="polite"><strong>{fill(c.selected, { name: c.directions[sel] })}</strong> · {c.templates}</div>
    </div>
  );
}

/* IX. The finished book. */
export function ReadyDemo({ c, cover, deva }: { c: J['ready']; cover: J['cover']; deva: boolean }) {
  const [back, setBack] = useState(false);
  return (
    <div className="lp-ready">
      <button type="button" className="lp-book3d" onClick={() => setBack((b) => !b)} aria-label={back ? c.front : c.turn} aria-pressed={back}>
        <span className={`lp-book3d-inner ${back ? 'is-back' : ''}`}>
          <span className="lp-book3d-front"><CoverArt title={cover.title} author={cover.author} subtitle={cover.subtitle} spec={SPECS[0]} width={180} deva={deva} /></span>
          <span className="lp-book3d-spine" aria-hidden="true" />
          <span className="lp-book3d-back" aria-hidden="true">
            <span className={deva ? 'deva-book' : 'book'}>{c.back}</span>
            <strong className={deva ? 'deva-book' : 'book'}>{c.backBy}</strong>
          </span>
        </span>
      </button>
      <div className="lp-ready-files">
        <div className="kick lp-ready-kick">{c.kick}</div>
        {c.files.map((f) => (
          <div key={f.name} className="page lp-file">
            <Icon name="file" size={16} />
            <span>{f.name}</span>
            <span className="lp-file-meta">{f.meta}</span>
          </div>
        ))}
        <p className={`${deva ? 'deva-book' : 'book'} lp-ready-sign`}>{c.publish}</p>
      </div>
    </div>
  );
}
