/**
 * Find passages in the author's own manuscript by describing them.
 * Local ranking (BM25 over paragraphs + phrase and name bonuses). When the backend
 * ships semantic search, replace `searchBook` with an API call returning the same Hit[].
 */
import type { Chapter, Entity } from '@/data/types';
import { toParagraphs } from './text';
import { plainOf } from './markdown';

export interface Hit {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  paraIndex: number;
  score: number;
  text: string;
  /** Character ranges within `text` that matched. */
  ranges: [number, number][];
}

const STOP_EN = new Set(('a an the and or but if then of to in on at by for with from into onto about as is are was were be been being it its this that these those there here where when what which who whom whose why how i me my we our you your he him his she her they them their do does did done have has had not no so very just also only can could would should will shall may might must up down out over under again once all any both each few more most other some such own same than too s t go take show find me first time scene part place moment chapter book mention mentioned did where says said tell tells told').split(' '));
const STOP_HI = new Set('का की के को में से पर और या है हैं था थी थे हो तो ने भी ही यह वह ये वो जो कि एक इस उस किस कहाँ कहां जहाँ जहां वहाँ वहां मैंने मुझे मेरा मेरी हम आप पहली बार दिखाओ दिखाइए ढूँढो ढूंढो बताओ जाओ चलो सीन हिस्सा अध्याय'.split(' '));

function stem(w: string): string {
  if (/[ऀ-ॿ]/.test(w)) return w.replace(/(ों|ें|ाएँ|ाएं|ियाँ|ियां|ाओं|ओं)$/u, '');
  return w
    .replace(/['’]s$/, '')
    .replace(/(ies)$/, 'y')
    .replace(/(ing|ed|es|s)$/, (m, _g, off, str) => (str.length - m.length >= 3 ? '' : m));
}

export function tokenize(s: string): string[] {
  const words = s.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’]*/gu) ?? [];
  return words.filter((w) => !STOP_EN.has(w) && !STOP_HI.has(w) && w.length > 1).map(stem);
}

interface Doc { chapter: Chapter; paraIndex: number; text: string; tokens: string[] }

export function searchBook(query: string, chapters: Chapter[], opts: { entities?: Entity[]; limit?: number } = {}): Hit[] {
  const qTokens = Array.from(new Set(tokenize(query)));
  if (!qTokens.length) return [];
  const docs: Doc[] = [];
  for (const ch of chapters) {
    // Paragraph indexes are Markdown block indexes; the text searched and shown is the plain words.
    toParagraphs(ch.content).forEach((raw, i) => { const p = plainOf(raw); if (p.trim()) docs.push({ chapter: ch, paraIndex: i, text: p, tokens: tokenize(p) }); });
  }
  if (!docs.length) return [];
  const N = docs.length;
  const avgLen = docs.reduce((s, d) => s + d.tokens.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  const names = new Set((opts.entities ?? []).flatMap((e) => tokenize(e.name)));
  const quoted = [...query.matchAll(/["“']([^"”']{3,})["”']/g)].map((m) => m[1].toLowerCase());
  const k1 = 1.4, b = 0.75;

  const scored = docs.map((d) => {
    let score = 0;
    const tf = new Map<string, number>();
    d.tokens.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    let matched = 0;
    for (const q of qTokens) {
      const f = tf.get(q) ?? 0;
      if (!f) continue;
      matched++;
      const idf = Math.log(1 + (N - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.tokens.length) / avgLen))) * (names.has(q) ? 1.6 : 1);
    }
    score *= 0.6 + 0.4 * (matched / qTokens.length);
    const low = d.text.toLowerCase();
    for (const q of quoted) if (low.includes(q)) score += 6;
    for (let i = 0; i < qTokens.length - 1; i++) {
      const a = d.tokens.indexOf(qTokens[i]);
      if (a >= 0 && d.tokens[a + 1] === qTokens[i + 1]) score += 1.2;
    }
    return { d, score };
  }).filter((x) => x.score > 0.4);

  scored.sort((a, b2) => b2.score - a.score);
  const limit = opts.limit ?? 8;
  return scored.slice(0, limit).map(({ d, score }) => ({
    chapterId: d.chapter.id, chapterTitle: d.chapter.title, chapterOrder: d.chapter.order, paraIndex: d.paraIndex,
    score, text: d.text, ranges: matchRanges(d.text, qTokens),
  }));
}

/** True if the query asks for the first occurrence ("first mention", "पहली बार"). */
export const asksForFirst = (q: string) => /\b(first|earliest|introduce[ds]?)\b|पहली बार|सबसे पहले/i.test(q);

export function matchRanges(text: string, qTokens: string[]): [number, number][] {
  const out: [number, number][] = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’]*/gu;
  let m: RegExpExecArray | null;
  const set = new Set(qTokens);
  while ((m = re.exec(text))) if (set.has(stem(m[0].toLowerCase()))) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** Cuts a readable snippet around the first match. */
export function snippet(hit: Pick<Hit, 'text' | 'ranges'>, radius = 90): { pre: string; parts: { t: string; hit: boolean }[]; post: string } {
  const { text, ranges } = hit;
  const first = ranges[0]?.[0] ?? 0;
  const start = Math.max(0, first - radius);
  const end = Math.min(text.length, (ranges[ranges.length - 1]?.[1] ?? 0) + radius, start + radius * 3);
  const parts: { t: string; hit: boolean }[] = [];
  let pos = start;
  for (const [a, z] of ranges) {
    if (a < start || z > end) continue;
    if (a > pos) parts.push({ t: text.slice(pos, a), hit: false });
    parts.push({ t: text.slice(a, z), hit: true });
    pos = z;
  }
  if (pos < end) parts.push({ t: text.slice(pos, end), hit: false });
  return { pre: start > 0 ? '…' : '', parts, post: end < text.length ? '…' : '' };
}
