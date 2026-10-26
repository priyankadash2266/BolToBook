/**
 * Read-only detections for the simple workspace. They only look at the author's own words
 * (boxes and manuscript) and never change anything.
 */
import type { Chapter, Entity } from '@/data/types';
import { nameRegex } from '@/lib/book';
import { toParagraphs } from '@/lib/text';
import { plainOf } from '@/lib/markdown';

export const byOrder = (a: Entity, b: Entity) =>
  (Number(a.fields.order ?? 0) - Number(b.fields.order ?? 0)) || a.createdAt.localeCompare(b.createdAt);

/* ------------------------------------------------------------------ */
/* Characters: who is connected to whom                                */
/* ------------------------------------------------------------------ */

export interface Connection { id: string; named: boolean; scenes: number }

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'madam', 'shri', 'smt', 'श्री', 'श्रीमती', 'डॉ', 'डॉ.', 'कुमारी']);

/** Regexes for each character: the full name, plus the first name when it is unambiguous. */
function aliasRegexes(chars: Entity[]): Map<string, RegExp[]> {
  const firstOf = (n: string) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length < 2) return '';
    const f = parts[0].replace(/\.$/, '');
    return HONORIFICS.has(f.toLowerCase()) ? '' : f;
  };
  const fulls = new Set(chars.map((c) => c.name.trim().toLowerCase()).filter(Boolean));
  const firstCount = new Map<string, number>();
  for (const c of chars) {
    const f = firstOf(c.name).toLowerCase();
    if (f) firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
  }
  const out = new Map<string, RegExp[]>();
  for (const c of chars) {
    const res: RegExp[] = [];
    const full = nameRegex(c.name);
    if (full) res.push(full);
    const f = firstOf(c.name);
    if (f && firstCount.get(f.toLowerCase()) === 1 && !fulls.has(f.toLowerCase())) {
      const r = nameRegex(f);
      if (r) res.push(r);
    }
    out.set(c.id, res);
  }
  return out;
}

const hits = (res: RegExp[] | undefined, text: string) => !!res && res.some((r) => { r.lastIndex = 0; return r.test(text); });

/**
 * Connections derived from the author's words:
 *  - a character's name is written in another character's description or notes;
 *  - two characters are written in the same manuscript paragraph at least twice.
 */
export function findConnections(chars: Entity[], chapters: Chapter[]): Map<string, Connection[]> {
  const named = chars.filter((c) => c.name.trim().length >= 2);
  const alias = aliasRegexes(named);
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairs = new Map<string, { named: boolean; scenes: number }>();
  const pair = (a: string, b: string) => {
    const k = key(a, b);
    let p = pairs.get(k);
    if (!p) { p = { named: false, scenes: 0 }; pairs.set(k, p); }
    return p;
  };

  for (const c of named) {
    const own = `${c.fields.description ?? ''}\n${c.fields.notes ?? ''}`;
    if (!own.trim()) continue;
    for (const d of named) {
      if (d.id === c.id) continue;
      if (hits(alias.get(d.id), own)) pair(c.id, d.id).named = true;
    }
  }

  if (named.length >= 2) {
    for (const ch of chapters) {
      if (!ch.content) continue;
      for (const para of toParagraphs(ch.content).map(plainOf)) {
        if (!para.trim()) continue;
        const here = named.filter((c) => hits(alias.get(c.id), para)).map((c) => c.id);
        for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) pair(here[i], here[j]).scenes++;
      }
    }
  }

  const out = new Map<string, Connection[]>();
  for (const [k, p] of pairs) {
    if (!p.named && p.scenes < 2) continue;
    const [a, b] = k.split('|');
    (out.get(a) ?? out.set(a, []).get(a)!).push({ id: b, ...p });
    (out.get(b) ?? out.set(b, []).get(b)!).push({ id: a, ...p });
  }
  for (const list of out.values()) list.sort((x, y) => (y.scenes - x.scenes) || Number(y.named) - Number(x.named));
  return out;
}

/** One or two letters for a name; Devanagari-safe (keeps whole letters). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const firstLetter = (w: string) => {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
    if (Seg) for (const s of new Seg(undefined, { granularity: 'grapheme' }).segment(w)) return s.segment;
    return Array.from(w)[0] ?? '';
  };
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return letters.map(firstLetter).join('').toUpperCase() || '?';
}

/* ------------------------------------------------------------------ */
/* Timeline: years out of order, the same "when" written twice         */
/* ------------------------------------------------------------------ */

export interface EventMark {
  /** Later-placed event with an earlier year, or the event it clashes with. */
  order?: { year: number; otherYear: number; otherN: number };
  /** 1-based positions of other events with the same "when". */
  same?: number[];
}

const DEVA_DIGITS = /[०-९]/g;
/** The first four-digit year written in a "when" (Devanagari digits too), or null. */
export function yearIn(when: string): number | null {
  const s = when.replace(DEVA_DIGITS, (d) => String(d.charCodeAt(0) - 0x0966));
  const m = s.match(/(?<!\d)(\d{4})(?!\d)/);
  return m ? Number(m[1]) : null;
}
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!?।]+$/u, '');

export function timelineMarks(events: Entity[]): { marks: Map<string, EventMark>; outOfOrder: number; sameWhen: number } {
  const marks = new Map<string, EventMark>();
  const mark = (id: string) => marks.get(id) ?? marks.set(id, {}).get(id)!;
  let outOfOrder = 0;

  // Year order: each event against the latest year placed before it.
  let maxYear = -Infinity;
  let maxIdx = -1;
  events.forEach((e, i) => {
    const y = yearIn(e.name);
    if (y === null) return;
    if (y < maxYear) {
      outOfOrder++;
      mark(e.id).order = { year: y, otherYear: maxYear, otherN: maxIdx + 1 };
      const other = mark(events[maxIdx].id);
      other.order ??= { year: maxYear, otherYear: y, otherN: i + 1 };
    } else {
      maxYear = y;
      maxIdx = i;
    }
  });

  // The same "when" written twice.
  const groups = new Map<string, number[]>();
  events.forEach((e, i) => {
    const k = norm(e.name);
    if (k) (groups.get(k) ?? groups.set(k, []).get(k)!).push(i);
  });
  let sameWhen = 0;
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    sameWhen += idx.length;
    for (const i of idx) mark(events[i].id).same = idx.filter((j) => j !== i).map((j) => j + 1);
  }
  return { marks, outOfOrder, sameWhen };
}
