/**
 * Cover design jobs.
 *
 * A "run" takes what the author gave (their Brief, themes, the cover they describe, preferences and the
 * words on the cover) and designs N covers. The UI only talks to `runCoverJob(context, onProgress)`, so the
 * place the work happens can change without touching the page:
 *
 *  - LocalCoverGenerator (today): picks imagery and colour by matching the author's own words (coverWords),
 *    varies direction / palette / type / layout into N distinct CoverSpecs, draws each with <CoverArt>
 *    (SVG → canvas → PNG, via lib/exporters) and keeps every PNG with api.media.put, so the history holds
 *    the actual images that were made.
 *
 *  - A backend generator plugs in by implementing the same `CoverGenerator` interface, e.g.
 *
 *      class HttpCoverGenerator implements CoverGenerator {
 *        async run(ctx, onProgress, signal) {
 *          // 1. POST /books/:bookId/cover-runs  { runId, context: ctx }  → 202 { runId }
 *          //    (the server charges and refunds; the client then skips useCharge for this generator)
 *          // 2. open  WS /ws/cover-runs/:runId  and map messages onto onProgress:
 *          //      { type: 'step',  step: 'read' | 'imagery' | 'type' | 'finish', fraction }
 *          //      { type: 'image', index, spec, mediaId }   → onProgress({ ..., result })
 *          //      { type: 'done',  results }                → resolve(results)
 *          //      { type: 'error', refunded }               → reject(new CoverJobError(refunded))
 *          // 3. on signal.abort: DELETE /cover-runs/:runId and close the socket.
 *        }
 *      }
 *      setCoverGenerator(new HttpCoverGenerator());
 *
 *    Media ids returned by the server resolve through api.media.get like local ones, so the history UI
 *    stays the same.
 */
import { api } from '@/data/api';
import type { CoverSpec } from '@/data/types';
import { coverPng } from '@/lib/exporters';
import { pickFromWords, type WordMatch } from '@/screens/tabs/finish/coverWords';
import { LAYOUT_KEYS, MOOD_KEYS, MOTIF_KEYS, TYPE_KEYS } from './presets';

export type Auto = 'auto';
export interface CoverPrefs {
  mood: CoverSpec['mood'] | Auto;
  type: CoverSpec['type'] | Auto;
  motif: CoverSpec['motif'] | Auto;
}
export const AUTO_PREFS: CoverPrefs = { mood: 'auto', type: 'auto', motif: 'auto' };

/** Everything the author gave for one run. Stored with the run, so the history shows exactly what was asked. */
export interface CoverContext {
  bookId: string;
  runId: string;
  title: string;
  subtitle?: string;
  author: string;
  /** Book summary (book.fields.brief). */
  brief: string;
  themes: string[];
  /** "Describe the cover you imagine" (book.fields.cover_brief). */
  coverBrief: string;
  prefs: CoverPrefs;
  count: number;
  /** Devanagari title. */
  deva: boolean;
}

export interface CoverResult {
  index: number;
  spec: CoverSpec;
  /** The stored PNG (api.media). Missing when this one couldn't be drawn. */
  mediaId?: string;
}

export const STEPS = ['read', 'imagery', 'type', 'finish'] as const;
export type StepKey = typeof STEPS[number];

export interface CoverProgress {
  step: StepKey;
  /** 0..1 over the whole run. */
  fraction: number;
  /** Set when one more cover is ready. */
  result?: CoverResult;
  /** The words of the author's that matched (shown while "Choosing imagery"). */
  matched?: WordMatch[];
}

export interface CoverGenerator {
  run(ctx: CoverContext, onProgress: (p: CoverProgress) => void, signal?: AbortSignal): Promise<CoverResult[]>;
}

/* ------------------------------------------------------------------ */
/* Planning: N distinct covers from the author's words                 */
/* ------------------------------------------------------------------ */

type Motif = CoverSpec['motif'];
type Mood = CoverSpec['mood'];
const MOOD_FOR: Record<Exclude<Motif, 'none'>, Mood> = { rail: 'night', letter: 'paper', hills: 'monsoon', sun: 'ember' };
const MOTIF_FOR: Record<Mood, Exclude<Motif, 'none'>> = { night: 'rail', paper: 'letter', monsoon: 'hills', ember: 'sun' };
const TYPE_FOR: Record<Mood, CoverSpec['type']> = { night: 'serif', paper: 'italic', monsoon: 'serif', ember: 'sans' };
const LAYOUT_FOR: Record<Motif, CoverSpec['layout']> = { rail: 'bottom', letter: 'top', hills: 'top', sun: 'center', none: 'center' };

/** Rotate a list so `first` leads (keeps the rest in order). */
const lead = <T,>(list: readonly T[], first?: T) => (first === undefined || !list.includes(first) ? [...list] : [first, ...list.filter((x) => x !== first)]);

export function matchContext(ctx: Pick<CoverContext, 'coverBrief' | 'themes' | 'brief'>) {
  // The cover description and themes speak loudest; the summary breaks ties.
  return pickFromWords(`${ctx.coverBrief}\n${ctx.coverBrief}\n${ctx.themes.join(', ')}\n${ctx.brief}`);
}

/**
 * The designs for a run: the first follows the author's words most closely, the rest move one step
 * away each (palette, imagery, type, layout) while honouring every preference the author fixed.
 */
export function planCovers(ctx: CoverContext, seedBase = Date.now() % 100000): CoverSpec[] {
  const pick = matchContext(ctx);
  const p = ctx.prefs;
  const motif0: Motif = p.motif !== 'auto' ? p.motif : pick.motif ?? (pick.mood ? MOTIF_FOR[pick.mood] : 'rail');
  const mood0: Mood = p.mood !== 'auto' ? p.mood : pick.mood ?? (motif0 !== 'none' ? MOOD_FOR[motif0] : 'night');
  const type0 = p.type !== 'auto' ? p.type : TYPE_FOR[mood0];
  const fromWords = !!(pick.motif || pick.mood);

  const motifs = p.motif !== 'auto' ? [p.motif] : lead(MOTIF_KEYS, motif0);
  const moods = p.mood !== 'auto' ? [p.mood] : lead(MOOD_KEYS, mood0);
  const types = p.type !== 'auto' ? [p.type] : lead(TYPE_KEYS, type0);

  const out: CoverSpec[] = [];
  const seen = new Set<string>();
  const add = (motif: Motif, mood: Mood, type: CoverSpec['type'], layout: CoverSpec['layout']) => {
    const key = `${motif}|${mood}|${type}|${layout}`;
    if (seen.has(key) || out.length >= ctx.count) return;
    seen.add(key);
    const i = out.length;
    out.push({ direction: i === 0 && fromWords ? 'words' : motif === 'none' ? 'type' : motif, motif, mood, type, layout, seed: seedBase * 10 + i + 1 });
  };

  // 1. The closest reading of the words.
  add(motif0, mood0, type0, LAYOUT_FOR[motif0]);
  // 2. Walk outward: one dimension at a time, then combinations.
  for (let step = 1; out.length < ctx.count && step < 40; step++) {
    const mo = motifs[step % motifs.length];
    const md = moods[Math.floor(step / 2) % moods.length];
    const ty = types[Math.floor(step / 3) % types.length];
    const la = step % 3 === 0 ? LAYOUT_KEYS[(LAYOUT_KEYS.indexOf(LAYOUT_FOR[mo]) + 1) % LAYOUT_KEYS.length] : LAYOUT_FOR[mo];
    add(mo, md, ty, la);
  }
  // 3. Everything fixed by preferences: vary layout, then imagery seed.
  for (let i = 0; out.length < ctx.count && i < 12; i++) add(motifs[i % motifs.length], moods[i % moods.length], types[i % types.length], LAYOUT_KEYS[i % 3]);
  while (out.length < ctx.count) {
    const base = out[out.length % Math.max(1, out.length)];
    out.push({ ...base, direction: base.direction, seed: seedBase * 10 + out.length + 1 });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Local generator                                                     */
/* ------------------------------------------------------------------ */

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  if (signal?.aborted) return rej(new DOMException('aborted', 'AbortError'));
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
});

export class LocalCoverGenerator implements CoverGenerator {
  /** Minimum pacing so each step can be read (the drawing itself is fast). */
  constructor(private pace = { read: 450, imagery: 550, perCover: 320, finish: 300 }) {}

  async run(ctx: CoverContext, onProgress: (p: CoverProgress) => void, signal?: AbortSignal): Promise<CoverResult[]> {
    const n = ctx.count;
    const total = 3 + n; // read, imagery, n covers, finish
    const frac = (done: number) => Math.min(1, done / total);

    onProgress({ step: 'read', fraction: 0.02 });
    await wait(this.pace.read, signal);

    const pick = matchContext(ctx);
    onProgress({ step: 'imagery', fraction: frac(1), matched: pick.matches.slice(0, 8) });
    const specs = planCovers(ctx);
    await wait(this.pace.imagery, signal);

    onProgress({ step: 'type', fraction: frac(2) });
    const results: CoverResult[] = [];
    for (let i = 0; i < specs.length; i++) {
      const t0 = performance.now();
      let mediaId: string | undefined;
      try {
        const png = await coverPng({ title: ctx.title, subtitle: ctx.subtitle, author: ctx.author, spec: specs[i], deva: ctx.deva }, 900);
        mediaId = await api.media.put(png, { name: `cover-${ctx.runId}-${i + 1}.png`, bookId: ctx.bookId });
      } catch {
        mediaId = undefined;
      }
      const r: CoverResult = { index: i, spec: specs[i], mediaId };
      results.push(r);
      const left = this.pace.perCover - (performance.now() - t0);
      if (left > 0) await wait(left, signal);
      onProgress({ step: 'type', fraction: frac(3 + i), result: r });
    }

    onProgress({ step: 'finish', fraction: frac(total - 0.5) });
    await wait(this.pace.finish, signal);
    onProgress({ step: 'finish', fraction: 1 });
    return results;
  }
}

let generator: CoverGenerator = new LocalCoverGenerator();
/** Swap the generator (e.g. for the HTTP/WebSocket backend). */
export const setCoverGenerator = (g: CoverGenerator) => { generator = g; };

export function runCoverJob(context: CoverContext, onProgress: (p: CoverProgress) => void, signal?: AbortSignal): Promise<CoverResult[]> {
  return generator.run(context, onProgress, signal);
}
