/**
 * Voice visuals shared across the product.
 *  - LiveWave: bars that move with the author's voice (mic level) and breathe gently when idle.
 *  - MicOrb:   the round "speak" button, with rings that swell as you talk.
 *  - AudioWave: playback of a saved recording, drawn from the recording itself, with a moving playhead.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { api } from '@/data/api';
import './voice.css';

/* ------------------------------------------------------------------ */
/* LiveWave                                                            */
/* ------------------------------------------------------------------ */

interface LiveWaveProps {
  /** True while listening/recording. */
  active: boolean;
  /** Live mic level 0–1 (from useMicLevel). Without it, an even speaking motion is shown while active. */
  level?: number;
  bars?: number;
  height?: number;
  /** Bar width in px. */
  barWidth?: number;
  gap?: number;
  color?: string;
  /** Show a soft breathing motion when not active (e.g. an inviting idle mic). */
  idle?: boolean;
  className?: string;
}

export function LiveWave({ active, level, bars = 28, height = 40, barWidth = 3, gap = 3, color = 'currentColor', idle = false, className = '' }: LiveWaveProps) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const lvl = useRef(level ?? 0);
  lvl.current = level ?? 0;
  const env = useMemo(() => Array.from({ length: bars }, (_, i) => {
    const x = i / Math.max(1, bars - 1);
    return 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * x), 0.8);
  }), [bars]);
  useEffect(() => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phase = env.map((_, i) => i * 0.7 + Math.random() * 2);
    const cur = env.map(() => 0.12);
    let raf = 0;
    let t = 0;
    const hasLevel = level !== undefined;
    const tick = () => {
      t += 1;
      for (let i = 0; i < env.length; i++) {
        let target: number;
        if (active) {
          const drive = hasLevel ? Math.min(1, 0.08 + lvl.current * 1.6) : 0.55 + 0.25 * Math.sin(t / 9 + i);
          const wobble = 0.55 + 0.45 * Math.abs(Math.sin(t / (5 + (i % 4)) + phase[i]));
          target = Math.max(0.1, env[i] * drive * wobble);
        } else if (idle && !reduce) {
          target = 0.12 + 0.16 * env[i] * (0.5 + 0.5 * Math.sin(t / 22 + i * 0.45));
        } else {
          target = 0.1 + 0.06 * env[i];
        }
        cur[i] += (target - cur[i]) * (active ? 0.35 : 0.12);
        const el = refs.current[i];
        if (el) el.style.transform = `scaleY(${cur[i].toFixed(3)})`;
      }
      if (active || idle) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [active, idle, env, level === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className={`lw ${active ? 'is-active' : ''} ${className}`} aria-hidden="true" style={{ height, gap, color }}>
      {env.map((_, i) => (
        <span key={i} ref={(el) => { refs.current[i] = el; }} className="lw-bar" style={{ width: barWidth, height }} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* MicOrb                                                              */
/* ------------------------------------------------------------------ */

interface MicOrbProps {
  listening: boolean;
  level?: number;
  onClick: () => void;
  /** Accessible label (changes with state). */
  label: string;
  size?: number;
  tone?: 'brand' | 'lap' | 'study';
  disabled?: boolean;
  className?: string;
}

/** The round speak button. Rings swell with the voice while listening; a slow halo invites a tap when idle. */
export function MicOrb({ listening, level = 0, onClick, label, size = 64, tone = 'brand', disabled, className = '' }: MicOrbProps) {
  const l = Math.min(1, level * 1.5);
  return (
    <button
      type="button"
      className={`orb orb-${tone} ${listening ? 'is-on' : ''} ${className}`}
      onClick={onClick}
      aria-pressed={listening}
      aria-label={label}
      disabled={disabled}
      style={{ width: size, height: size, ['--lvl' as string]: l.toFixed(3) }}
    >
      <span className="orb-ring orb-ring-1" aria-hidden="true" />
      <span className="orb-ring orb-ring-2" aria-hidden="true" />
      <span className="orb-core" aria-hidden="true">
        {listening ? <span className="orb-stop" /> : <Icon name="mic" size={Math.round(size * 0.36)} />}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* AudioWave                                                           */
/* ------------------------------------------------------------------ */

const peakCache = new Map<string, number[]>();

async function peaksOf(blob: Blob, n: number): Promise<number[]> {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / n));
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      let max = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) max = Math.max(max, Math.abs(data[j]));
      out.push(max);
    }
    void ctx.close();
    const top = Math.max(0.05, ...out);
    return out.map((v) => Math.max(0.08, v / top));
  } catch {
    return Array.from({ length: n }, (_, i) => 0.25 + 0.6 * Math.abs(Math.sin(i * 1.3)) * Math.sin((Math.PI * i) / n));
  }
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Plays a saved recording (by audio id) with a waveform drawn from the sound itself. Tap the wave to jump. */
export function AudioWave({ audioId, bars = 48, tone = 'lap', playLabel, pauseLabel, className = '' }: { audioId: string; bars?: number; tone?: 'lap' | 'brand'; playLabel: string; pauseLabel: string; className?: string }) {
  const [peaks, setPeaks] = useState<number[] | null>(peakCache.get(audioId) ?? null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    let u: string | null = null;
    api.audio.get(audioId).then(async (blob) => {
      if (!alive || !blob) return;
      u = URL.createObjectURL(blob);
      setUrl(u);
      if (!peakCache.has(audioId)) {
        const p = await peaksOf(blob, bars);
        peakCache.set(audioId, p);
        if (alive) setPeaks(p);
      }
    });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); audio.current?.pause(); };
  }, [audioId, bars]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => { const a = audio.current; if (a) setPos(a.currentTime); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { void a.play(); } else a.pause();
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * dur;
    setPos(a.currentTime);
  };
  const p = dur ? pos / dur : 0;
  const shape = peaks ?? Array.from({ length: bars }, () => 0.15);

  return (
    <div className={`aw aw-${tone} ${playing ? 'is-playing' : ''} ${className}`}>
      <button type="button" className="aw-btn" onClick={toggle} disabled={!url} aria-label={playing ? pauseLabel : playLabel}>
        <Icon name={playing ? 'pause' : 'play'} size={15} />
      </button>
      <div className="aw-wave" onClick={seek} role="presentation">
        {shape.map((v, i) => (
          <span key={i} className={`aw-bar ${i / shape.length < p ? 'is-past' : ''}`} style={{ transform: `scaleY(${v.toFixed(3)})` }} />
        ))}
      </div>
      <span className="aw-time">{fmt(playing || pos ? pos : dur)}</span>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d)) setDur(d); }}
          onDurationChange={(e) => { const d = e.currentTarget.duration; if (isFinite(d)) setDur(d); }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setPos(0); }}
        />
      )}
    </div>
  );
}
