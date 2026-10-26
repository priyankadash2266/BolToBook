import type { BookLang } from '@/data/types';

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu;

/** Counts words. Formatting marks (see `@/lib/markdown`) are not words: alignment markers and list numbers are skipped. */
export function countWords(s: string): number {
  if (!s) return 0;
  if (s.includes('{') || /^[ \t]*\d{1,3}[.)][ \t]/m.test(s)) s = s.replace(/^[ \t]*\{[lcrj]\}[ \t]+/gm, '').replace(/^[ \t]*\d{1,3}[.)][ \t]+/gm, '');
  const m = s.match(WORD);
  return m ? m.length : 0;
}

export function toParagraphs(content: string): string[] {
  return content.split(/\n{2,}/).map((p) => p.replace(/\s+$/g, ''));
}
export function fromParagraphs(paras: string[]): string {
  return paras.join('\n\n');
}

export const isDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);
export const usesDevanagari = (lang: BookLang) => lang === 'hi' || lang === 'mr' || lang === 'mix';

/** Speech recognition locale for a book language. */
export function speechLocale(lang: BookLang, country: string): string {
  if (lang === 'hi' || lang === 'mix') return 'hi-IN';
  if (lang === 'mr') return 'mr-IN';
  switch (country) {
    case 'IN': return 'en-IN';
    case 'GB': return 'en-GB';
    case 'AU': return 'en-AU';
    case 'CA': return 'en-CA';
    case 'SG': return 'en-SG';
    default: return 'en-US';
  }
}

interface SpokenMark { re: RegExp; out: string }
const SPOKEN_EN: SpokenMark[] = [
  { re: /\s*\b(new paragraph|next paragraph)\b\s*/gi, out: '\n\n' },
  { re: /\s*\bnew line\b\s*/gi, out: '\n' },
  { re: /\s*\b(full stop|period)\b/gi, out: '.' },
  { re: /\s*\bcomma\b/gi, out: ',' },
  { re: /\s*\bquestion mark\b/gi, out: '?' },
  { re: /\s*\bexclamation (mark|point)\b/gi, out: '!' },
  { re: /\s*\bsemicolon\b/gi, out: ';' },
  { re: /\s*\bcolon\b/gi, out: ':' },
  { re: /\s*\b(dash|em dash)\b\s*/gi, out: ' — ' },
  { re: /\b(open quote|begin quote)\b\s*/gi, out: '“' },
  { re: /\s*\b(close quote|end quote|unquote)\b/gi, out: '”' },
];
const SPOKEN_HI: SpokenMark[] = [
  { re: /\s*(नया पैराग्राफ़?|नया अनुच्छेद|अगला पैराग्राफ़?)\s*/g, out: '\n\n' },
  { re: /\s*(नई लाइन|नई पंक्ति)\s*/g, out: '\n' },
  { re: /\s*(पूर्ण ?विराम|फ़ुल ?स्टॉप|फुल ?स्टॉप)/g, out: '।' },
  { re: /\s*(अल्प ?विराम|कॉमा|कोमा)/g, out: ',' },
  { re: /\s*(प्रश्न ?चिह्न|प्रश्नवाचक ?चिह्न|सवालिया ?निशान)/g, out: '?' },
  { re: /\s*(विस्मयादिबोधक ?चिह्न)/g, out: '!' },
];
const FILLERS_EN = /\b(um+|uh+|erm+|er|hmm+|mm+)\b[,]?\s*/gi;
const FILLERS_HI = /(^|\s)(उम्म+|हम्म+|अं+)(?=\s|$)/g;

export interface CleanResult { text: string; changes: string[] }

/**
 * Turns what the microphone heard into clean text, without changing the author's words:
 * spoken punctuation becomes punctuation, fillers and accidental repeats go, sentences
 * get a capital and an ending. Every change is listed so the UI can show it.
 */
export function cleanTranscript(raw: string, lang: BookLang, opts: { capitalizeStart?: boolean; endSentence?: boolean } = {}): CleanResult {
  const changes: string[] = [];
  let s = ' ' + raw.trim() + ' ';
  const deva = usesDevanagari(lang) && isDevanagari(raw);
  const marks = [...SPOKEN_EN, ...(usesDevanagari(lang) ? SPOKEN_HI : [])];
  for (const m of marks) {
    if (m.re.test(s)) { changes.push('punctuation'); s = s.replace(m.re, m.out); }
    m.re.lastIndex = 0;
  }
  const beforeFill = s;
  s = s.replace(FILLERS_EN, '').replace(FILLERS_HI, '$1');
  if (s !== beforeFill) changes.push('fillers');
  const beforeRep = s;
  s = s.replace(/\b([\p{L}\p{M}]+)(\s+\1\b)+/giu, '$1');
  if (s !== beforeRep) changes.push('repeats');
  s = s.replace(/[ \t]+/g, ' ').replace(/ +([,.;:!?।])/g, '$1').replace(/([,.;:!?।])(?=[\p{L}])/gu, '$1 ').replace(/ *\n */g, '\n').trim();
  if (opts.capitalizeStart !== false && /^[a-z]/.test(s)) { s = s[0].toUpperCase() + s.slice(1); changes.push('capitals'); }
  const beforeCap = s;
  s = s.replace(/([.!?]\s+|\n)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  s = s.replace(/\bi\b/g, 'I');
  if (s !== beforeCap) changes.push('capitals');
  if (opts.endSentence !== false && s && !/[.!?।…”"':;,—-]$/.test(s)) {
    s += deva ? '।' : '.';
    changes.push('punctuation');
  }
  return { text: s, changes: Array.from(new Set(changes)) };
}

/** Joins dictated text onto existing text with sensible spacing. */
export function joinText(before: string, insert: string): string {
  if (!before) return insert;
  if (insert.startsWith('\n')) return before.replace(/\s+$/, '') + insert;
  if (/\s$/.test(before)) return before + insert;
  return before + ' ' + insert;
}

/** First letter upper-cased, ends with sentence punctuation. Used to place the author's spoken words as a sentence. */
export function asSentence(words: string, deva = false): string {
  let s = words.trim().replace(/^["“'‘]+|["”'’]+$/g, '');
  if (!s) return s;
  if (/^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  if (!/[.!?।…]$/.test(s)) s += deva || isDevanagari(s) ? '।' : '.';
  return s;
}

export function splitSentences(p: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const re = /[^.!?।]+(?:[.!?।]+["”’']?|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p))) {
    if (!m[0].trim()) { if (re.lastIndex === m.index) re.lastIndex++; continue; }
    const lead = m[0].length - m[0].trimStart().length;
    out.push({ text: m[0].trim(), start: m.index + lead, end: m.index + m[0].trimEnd().length });
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return out;
}

export function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function formatDuration(ms?: number) {
  if (!ms) return '0:00';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
