/**
 * The Review report. Everything here finds, counts and compares the author's own words and
 * notes; nothing judges, and nothing writes. A report is plain JSON (saved as a 'review' entity),
 * holding i18n keys + values rather than sentences, so it reads in either interface language.
 *
 * Helpers are copied from the older Revise / Checks tabs so this folder stands alone.
 */
import type { BookLang, Chapter, Entity, Lap } from '@/data/types';
import { countWords, escapeRegExp, splitSentences, toParagraphs } from '@/lib/text';
import { findNameVariants, proofreadChapter } from '@/lib/proofread';
import { plainOf, toPlain } from '@/lib/markdown';

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export interface RLink { chapterId: string; n: number; title: string; para?: number; find?: string; quote?: string }

export type SectionKey = 'plot' | 'characters' | 'pacing' | 'language';

export type FindingKind =
  // plot
  | 'timelineOrder' | 'onlyOnce' | 'twistOpen' | 'neverMentioned'
  // characters
  | 'describedTwo' | 'spelledTwo' | 'absent'
  // pacing
  | 'chapterLong' | 'chapterShort' | 'longPara' | 'longRun'
  // language
  | 'longSentence' | 'echo';

export interface Finding {
  kind: FindingKind;
  vars: Record<string, string | number>;
  links: RLink[];
  /** A workspace tab where the thing lives (timeline, laps, characters, world). */
  tab?: 'timeline' | 'laps' | 'characters' | 'world';
  quote?: string;
}

export interface ChapterStat { chapterId: string; n: number; title: string; words: number; slips: number }

export interface Report {
  v: 1;
  scope: 'book' | 'chapter';
  chapterId?: string;
  chapterTitle?: string;
  words: number;
  chapterCount: number;
  avgWords: number;
  stats: ChapterStat[];
  plot: Finding[];
  characters: Finding[];
  pacing: Finding[];
  language: Finding[];
}

export const SECTIONS: SectionKey[] = ['plot', 'characters', 'pacing', 'language'];

export const LIMITS = { longPara: 250, longSentence: 45, runSentence: 30, runLength: 3, gap: 3, spread: 0.6, echoWindow: 40 };
const CAP = 80;

/* ------------------------------------------------------------------ */
/* Names                                                               */
/* ------------------------------------------------------------------ */

const B = '(?<![\\p{L}\\p{M}\\p{N}])';
const A = '(?![\\p{L}\\p{M}\\p{N}])';

/** The ways an entry's name may be written: full name, aliases (fields.aliases), first word. */
export function termsFor(e: Pick<Entity, 'name' | 'fields'>): string[] {
  const name = e.name.trim();
  const out = new Set<string>();
  if (name.length >= 2) out.add(name);
  for (const a of (e.fields?.aliases ?? '').split(',')) if (a.trim().length >= 2) out.add(a.trim());
  const first = name.split(/\s+/)[0];
  if (name.includes(' ') && first && [...first].length >= 3) out.add(first);
  return [...out];
}

export function termsRegex(terms: string[], flags = 'giu'): RegExp | null {
  const list = terms.map((t) => t.trim()).filter((t) => t.length >= 2).sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  try { return new RegExp(`${B}(?:${list.map(escapeRegExp).join('|')})${A}`, flags); } catch { return null; }
}

const countIn = (re: RegExp | null, s: string) => { if (!re || !s) return 0; re.lastIndex = 0; return (s.match(re) ?? []).length; };
const testIn = (re: RegExp | null, s: string) => { if (!re) return false; re.lastIndex = 0; return re.test(s); };

/** A readable window of a paragraph around a position. */
export function around(p: string, at: number, before = 80, after = 120): string {
  const s0 = Math.max(0, at - before);
  const start = s0 === 0 ? 0 : Math.max(0, p.indexOf(' ', s0) + 1);
  const e0 = Math.min(p.length, at + after);
  const end = e0 >= p.length ? p.length : Math.max(at + 1, p.lastIndexOf(' ', e0));
  return (start > 0 ? '…' : '') + p.slice(start, end).trim() + (end < p.length ? '…' : '');
}

export const lead = (text: string, n = 6) => text.trim().split(/\s+/).slice(0, n).join(' ').replace(/[,.;:!?।"“”'‘’]+$/u, '');

/** First paragraph in a chapter where the regex matches. */
function firstHit(re: RegExp | null, ch: Chapter): { para: number; find: string; quote: string } | undefined {
  if (!re) return undefined;
  const paras = toParagraphs(ch.content).map(plainOf);
  for (let i = 0; i < paras.length; i++) {
    re.lastIndex = 0;
    const m = re.exec(paras[i]);
    if (m) return { para: i, find: m[0], quote: around(paras[i], m.index) };
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Years (timeline)                                                    */
/* ------------------------------------------------------------------ */

const asciiDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966));
const YEAR_RE = /(?<![\p{N}\p{L}])(1[0-9]\d\d|20\d\d)(?![\p{N}\p{L}])/u;
export const yearOf = (s: string): number | undefined => { const m = asciiDigits(s).match(YEAR_RE); return m ? Number(m[1]) : undefined; };

/* ------------------------------------------------------------------ */
/* Descriptions that differ                                            */
/* ------------------------------------------------------------------ */

type Dim = 'colour' | 'shape' | 'length' | 'height' | 'side';
export type Feature = 'eyes' | 'hair' | 'height' | 'scar' | 'beard' | 'glasses';

const FEATURE_WORDS: Record<Feature, string[]> = {
  eyes: ['eyes', 'eye', 'आँखें', 'आंखें', 'आँख', 'आंख', 'आँखों', 'आंखों'],
  hair: ['hair', 'बाल', 'बालों', 'ज़ुल्फ़ें', 'जुल्फें'],
  height: ['height', 'tall', 'कद', 'क़द'],
  scar: ['scar', 'निशान', 'दाग़', 'दाग'],
  beard: ['beard', 'moustache', 'mustache', 'दाढ़ी', 'मूँछ', 'मूंछ', 'मूँछें', 'मूंछें'],
  glasses: ['glasses', 'spectacles', 'चश्मा', 'चश्मे'],
};

const DESCRIPTORS: { id: string; dim: Dim; words: string[] }[] = [
  { id: 'grey', dim: 'colour', words: ['grey', 'gray', 'स्लेटी', 'सलेटी'] },
  { id: 'brown', dim: 'colour', words: ['brown', 'भूरी', 'भूरे', 'भूरा'] },
  { id: 'blue', dim: 'colour', words: ['blue', 'नीली', 'नीले', 'नीला'] },
  { id: 'green', dim: 'colour', words: ['green', 'हरी', 'हरे', 'हरा'] },
  { id: 'black', dim: 'colour', words: ['black', 'काली', 'काले', 'काला'] },
  { id: 'hazel', dim: 'colour', words: ['hazel'] },
  { id: 'red', dim: 'colour', words: ['red', 'लाल'] },
  { id: 'blonde', dim: 'colour', words: ['blonde', 'blond', 'golden', 'सुनहरे', 'सुनहरी'] },
  { id: 'white', dim: 'colour', words: ['white', 'silver', 'सफ़ेद', 'सफेद'] },
  { id: 'curly', dim: 'shape', words: ['curly', 'घुँघराले', 'घुंघराले'] },
  { id: 'straight', dim: 'shape', words: ['straight', 'सीधे'] },
  { id: 'wavy', dim: 'shape', words: ['wavy'] },
  { id: 'long', dim: 'length', words: ['long'] },
  { id: 'cropped', dim: 'length', words: ['cropped'] },
  { id: 'tall', dim: 'height', words: ['tall', 'लंबा', 'लंबी', 'लम्बा', 'लम्बी', 'ऊँचा'] },
  { id: 'short', dim: 'height', words: ['short', 'नाटा', 'नाटी', 'ठिगना', 'ठिगनी'] },
  { id: 'left', dim: 'side', words: ['left', 'बाएँ', 'बाएं', 'बायें'] },
  { id: 'right', dim: 'side', words: ['right', 'दाएँ', 'दाएं', 'दायें'] },
];

const DIMS_FOR: Record<Feature, Dim[]> = {
  eyes: ['colour'], hair: ['colour', 'shape', 'length'], height: ['height'], scar: ['side'], beard: ['colour'], glasses: ['colour'],
};

const WORD_TO_DESC = new Map<string, { id: string; dim: Dim }>();
for (const d of DESCRIPTORS) for (const w of d.words) if (!WORD_TO_DESC.has(w)) WORD_TO_DESC.set(w, { id: d.id, dim: d.dim });
const WORD_TO_FEATURE = new Map<string, Feature>();
for (const [f, ws] of Object.entries(FEATURE_WORDS) as [Feature, string[]][]) for (const w of ws) WORD_TO_FEATURE.set(w, f);

const TOKEN = /[\p{L}\p{M}][\p{L}\p{M}'’]*/gu;
const tokens = (s: string) => (s.match(TOKEN) ?? []).map((w) => w.toLowerCase());

interface Use { word: string; chapters: Set<number>; link: RLink }

function describedTwo(characters: Entity[], chapters: Chapter[], ref: (i: number) => RLink): Finding[] {
  const out: Finding[] = [];
  const all = characters.map((e) => ({ e, re: termsRegex(termsFor(e)) }));
  for (const { e, re } of all) {
    if (!re) continue;
    const found = new Map<string, Map<string, Use>>();
    chapters.forEach((c, ci) => {
      toParagraphs(c.content).map(plainOf).forEach((p, para) => {
        if (!testIn(re, p)) return;
        const others = all.some((o) => o.e.id !== e.id && testIn(o.re, p));
        for (const s of splitSentences(p)) {
          if (others && !testIn(re, s.text)) continue;
          const toks = tokens(s.text);
          const feats = new Set<Feature>();
          for (const tk of toks) { const f = WORD_TO_FEATURE.get(tk); if (f) feats.add(f); }
          if (feats.has('hair') || feats.has('beard')) feats.delete('height');
          for (const f of feats) {
            for (const tk of toks) {
              const d = WORD_TO_DESC.get(tk);
              if (!d || !DIMS_FOR[f].includes(d.dim)) continue;
              const k = `${f}|${d.dim}`;
              const byDesc = found.get(k) ?? new Map<string, Use>();
              const cur = byDesc.get(d.id);
              if (cur) cur.chapters.add(ci);
              else byDesc.set(d.id, { word: tk, chapters: new Set([ci]), link: { ...ref(ci), para, find: lead(s.text), quote: s.text } });
              found.set(k, byDesc);
            }
          }
        }
      });
    });
    for (const [k, byDesc] of found) {
      if (byDesc.size < 2) continue;
      const allCh = new Set([...byDesc.values()].flatMap((v) => [...v.chapters]));
      if (allCh.size < 2) continue;
      const [feature] = k.split('|') as [Feature, Dim];
      const uses = [...byDesc.values()].sort((a, b) => Math.min(...a.chapters) - Math.min(...b.chapters));
      const [u1, u2] = uses;
      out.push({
        kind: 'describedTwo',
        vars: { name: e.name, feature, a: u1.word, ca: u1.link.n, b: u2.word, cb: u2.link.n },
        links: uses.slice(0, 3).map((u) => u.link),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Words repeated close together                                       */
/* ------------------------------------------------------------------ */

const COMMON = new Set((
  'that this with have from they were been said what when there their them then than will would could should about ' +
  'into over just like only some your more very which while where these those because before after again even ' +
  'still back down know think come came going went make made take took look looked here away much many such each ' +
  'every other another through being does didn doesn also around never always something nothing anything everything ' +
  'someone people time once upon want wanted thing things well last first long little good great right left same ' +
  'though thought asked told tell between under against without within along across behind himself herself myself ' +
  'itself themselves yourself whose whom might must shall onto until really ' +
  'हमने उसने उसका उसकी उसके उनका उनकी उनके मेरा मेरी मेरे तुम्हारा अपना अपनी अपने लेकिन क्योंकि इसलिए जैसे वैसे ' +
  'कभी सभी सबसे किसी कुछ बहुत थोड़ा साथ बाद पहले यहाँ वहाँ होता होती होते रहा रही रहे गया गई गए किया ' +
  'करना करते करती करता कहा कहती कहते कहता लिए वाला वाली वाले नहीं'
).split(/\s+/));

function echoes(p: string): { word: string; at: number }[] {
  const last = new Map<string, number>();
  const hits = new Map<string, number>();
  let i = 0;
  for (const m of p.matchAll(TOKEN)) {
    const raw = m[0].replace(/['’]s$/i, '');
    const w = raw.toLowerCase();
    if ([...w].length >= 4 && !COMMON.has(w) && !/^\p{Lu}/u.test(raw)) {
      const prev = last.get(w);
      if (prev !== undefined && i - prev <= LIMITS.echoWindow && !hits.has(raw)) hits.set(raw, m.index ?? 0);
      last.set(w, i);
    }
    i++;
  }
  return [...hits.entries()].map(([word, at]) => ({ word, at }));
}

/* ------------------------------------------------------------------ */
/* The report                                                          */
/* ------------------------------------------------------------------ */

export interface ReportInput {
  chapters: Chapter[];
  lang: BookLang;
  characters: Entity[];
  places: Entity[];
  events: Entity[];
  laps: Lap[];
  /** Untitled chapter label maker, e.g. "Chapter 3". */
  chapterLabel: (n: number) => string;
  /** Only this chapter (the others still count towards the average). */
  onlyChapterId?: string;
}

const cap = <T,>(a: T[]) => a.slice(0, CAP);
const byOrder = (a: Entity, b: Entity) => (Number(a.fields.order ?? 0) - Number(b.fields.order ?? 0)) || a.createdAt.localeCompare(b.createdAt);

export function buildReport(inp: ReportInput): Report {
  const chapters = [...inp.chapters].sort((a, b) => a.order - b.order);
  const written = chapters.map((c) => c.content.trim().length > 0);
  const title = (c: Chapter, i: number) => c.title.trim() || inp.chapterLabel(i + 1);
  const ref = (i: number): RLink => ({ chapterId: chapters[i].id, n: i + 1, title: title(chapters[i], i) });
  const writtenIdx = chapters.map((_, i) => i).filter((i) => written[i]);
  const wordsOf = chapters.map((c) => countWords(toPlain(c.content)));
  const words = wordsOf.reduce((s, n) => s + n, 0);
  const avg = writtenIdx.length ? Math.round(words / writtenIdx.length) : 0;

  const stats: ChapterStat[] = chapters.map((c, i) => ({ ...ref(i), words: wordsOf[i], slips: written[i] ? proofreadChapter(c, inp.lang).length : 0 }));

  /* ---- plot ---- */
  const plot: Finding[] = [];
  const events = [...inp.events].sort(byOrder);
  let maxYear: { year: number; name: string } | undefined;
  for (const e of events) {
    const y = yearOf(e.name);
    if (y === undefined) continue;
    if (maxYear && y < maxYear.year) {
      const ci = chapters.findIndex((c) => c.id === e.fields.chapterId);
      plot.push({ kind: 'timelineOrder', vars: { a: e.name, b: maxYear.name, what: lead(e.fields.description ?? '', 10) }, links: ci >= 0 ? [ref(ci)] : [], tab: 'timeline' });
    }
    if (!maxYear || y >= maxYear.year) maxYear = { year: y, name: e.name };
  }
  const named = [...inp.characters.map((e) => ({ e, tab: 'characters' as const })), ...inp.places.map((e) => ({ e, tab: 'world' as const }))].filter((x) => x.e.name.trim().length >= 2);
  for (const { e, tab } of named) {
    const re = termsRegex(termsFor(e));
    const counts = chapters.map((c) => countIn(re, c.content));
    const total = counts.reduce((s, n) => s + n, 0);
    const inCh = counts.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
    if (total === 0 && e.kind === 'character' && writtenIdx.length > 0) {
      plot.push({ kind: 'neverMentioned', vars: { name: e.name }, links: [], tab });
    } else if (inCh.length === 1 && writtenIdx.length >= 3) {
      const i = inCh[0];
      const hit = firstHit(re, chapters[i]);
      plot.push({ kind: 'onlyOnce', vars: { name: e.name, ch: i + 1 }, links: [{ ...ref(i), para: hit?.para, find: hit?.find, quote: hit?.quote }], tab });
    }
  }
  for (const l of inp.laps) {
    if (!l.twist || l.status === 'placed' || l.status === 'discarded') continue;
    const text = (l.title?.trim() || l.text.trim());
    plot.push({ kind: 'twistOpen', vars: { text: lead(text, 12) }, links: [], tab: 'laps', quote: l.title?.trim() ? l.text.trim().slice(0, 220) : undefined });
  }

  /* ---- characters ---- */
  const characters: Finding[] = [...describedTwo(inp.characters.filter((e) => e.name.trim()), chapters, ref)];
  for (const v of findNameVariants(chapters)) {
    const links: RLink[] = [];
    for (const w of [v.variant, v.preferred]) {
      const re = termsRegex([w], 'gu');
      const i = chapters.findIndex((c) => testIn(re, c.content));
      if (i >= 0) { const hit = firstHit(re, chapters[i]); links.push({ ...ref(i), para: hit?.para, find: w, quote: hit?.quote }); }
    }
    characters.push({ kind: 'spelledTwo', vars: { a: v.preferred, na: v.preferredCount, b: v.variant, nb: v.variantCount }, links });
  }
  for (const e of inp.characters) {
    const re = termsRegex(termsFor(e));
    if (!re) continue;
    const counts = chapters.map((c) => countIn(re, c.content));
    const first = counts.findIndex((c) => c > 0);
    if (first < 0) continue;
    let last = first;
    counts.forEach((c, i) => { if (c > 0) last = i; });
    let best: { from: number; to: number; len: number } | undefined;
    let run = 0, start = -1;
    for (let i = first; i <= last; i++) {
      if (counts[i] === 0 && written[i]) { if (run === 0) start = i; run++; if (!best || run > best.len) best = { from: start, to: i, len: run }; }
      else if (counts[i] > 0) run = 0;
    }
    if (best && best.len >= LIMITS.gap) {
      const before = best.from - 1, after = best.to + 1;
      const links: RLink[] = [];
      for (const i of [before, after]) {
        if (i < 0 || i >= chapters.length) continue;
        const hit = firstHit(re, chapters[i]);
        links.push({ ...ref(i), para: hit?.para, find: hit?.find });
      }
      characters.push({ kind: 'absent', vars: { name: e.name, from: best.from + 1, to: best.to + 1, n: best.len }, links });
    }
  }

  /* ---- pacing ---- */
  const pacing: Finding[] = [];
  if (writtenIdx.length >= 3 && avg > 0) {
    for (const i of writtenIdx) {
      const pct = Math.round(((wordsOf[i] - avg) / avg) * 100);
      if (wordsOf[i] > avg * (1 + LIMITS.spread)) pacing.push({ kind: 'chapterLong', vars: { ch: i + 1, words: wordsOf[i], pct }, links: [ref(i)] });
      else if (wordsOf[i] < avg * (1 - LIMITS.spread)) pacing.push({ kind: 'chapterShort', vars: { ch: i + 1, words: wordsOf[i], pct: -pct }, links: [ref(i)] });
    }
  }
  const longParas: Finding[] = [], runs: Finding[] = [], longSent: Finding[] = [], echo: Finding[] = [];
  chapters.forEach((c, i) => {
    if (!written[i]) return;
    let runLen = 0, runStart: { para: number; text: string } | undefined;
    const flush = () => {
      if (runLen >= LIMITS.runLength && runStart) runs.push({ kind: 'longRun', vars: { ch: i + 1, n: runLen }, links: [{ ...ref(i), para: runStart.para, find: lead(runStart.text), quote: runStart.text }] });
      runLen = 0; runStart = undefined;
    };
    toParagraphs(c.content).map(plainOf).forEach((p, para) => {
      const pw = countWords(p);
      if (pw > LIMITS.longPara) longParas.push({ kind: 'longPara', vars: { ch: i + 1, words: pw }, links: [{ ...ref(i), para, find: lead(p), quote: around(p, 0, 0, 160) }] });
      for (const s of splitSentences(p)) {
        const sw = countWords(s.text);
        if (sw > LIMITS.longSentence) longSent.push({ kind: 'longSentence', vars: { ch: i + 1, words: sw }, links: [{ ...ref(i), para, find: lead(s.text), quote: s.text.length > 260 ? s.text.slice(0, 260) + '…' : s.text }] });
        if (sw > LIMITS.runSentence) { if (!runLen) runStart = { para, text: s.text }; runLen++; } else flush();
      }
      for (const h of echoes(p)) echo.push({ kind: 'echo', vars: { ch: i + 1, word: h.word }, links: [{ ...ref(i), para, find: h.word, quote: around(p, h.at, 60, 120) }] });
    });
    flush();
  });
  pacing.push(...cap(longParas), ...cap(runs));
  const language: Finding[] = [...cap(longSent), ...cap(echo)];

  let report: Report = {
    v: 1, scope: inp.onlyChapterId ? 'chapter' : 'book', words, chapterCount: writtenIdx.length, avgWords: avg, stats,
    plot: cap(plot), characters: cap(characters), pacing, language,
  };
  if (inp.onlyChapterId) {
    const id = inp.onlyChapterId;
    const ci = chapters.findIndex((c) => c.id === id);
    const keep = (f: Finding) => f.links.some((l) => l.chapterId === id);
    report = {
      ...report, chapterId: id, chapterTitle: ci >= 0 ? title(chapters[ci], ci) : undefined,
      plot: report.plot.filter(keep), characters: report.characters.filter(keep), pacing: report.pacing.filter(keep), language: report.language.filter(keep),
    };
  }
  return report;
}

export function parseReport(json?: string): Report | undefined {
  if (!json) return undefined;
  try { const r = JSON.parse(json) as Report; return r && r.v === 1 ? r : undefined; } catch { return undefined; }
}

export const totalFindings = (r: Report) => r.plot.length + r.characters.length + r.pacing.length + r.language.length;
