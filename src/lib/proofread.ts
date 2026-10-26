/**
 * Proofreading: spelling consistency and punctuation only. Never rewrites sentences.
 * Rule-based and local; a backend proofreader can return the same Issue[] later.
 */
import type { BookLang, Chapter } from '@/data/types';
import { fromParagraphs, toParagraphs } from './text';
import { applyPlainEdit, plainOf } from './markdown';

export type ProofRule =
  | 'double-space' | 'space-before-punct' | 'space-after-punct' | 'repeated-word' | 'lowercase-i'
  | 'sentence-capital' | 'ellipsis' | 'dash' | 'danda' | 'space-before-danda' | 'name-spelling';

export interface Issue {
  id: string;
  chapterId: string;
  paraIndex: number;
  start: number;
  end: number;
  original: string;
  replacement: string;
  rule: ProofRule;
  /** A few characters of context on each side, for display. */
  pre: string;
  post: string;
}

interface Rule { rule: ProofRule; re: RegExp; fix: (m: RegExpExecArray) => string; langs?: ('latin' | 'deva')[] }

const RULES: Rule[] = [
  { rule: 'double-space', re: /(?<=\S) {2,}(?=\S)/g, fix: () => ' ' },
  { rule: 'space-before-punct', re: / +(?=[,.;:!?](?:\s|$))/g, fix: () => '' },
  { rule: 'space-after-punct', re: /(?<=[a-zऀ-ॿ])([,;:!?])(?=[A-Za-zऀ-ॿ])/g, fix: (m) => m[1] + ' ' },
  { rule: 'repeated-word', re: /\b([\p{L}\p{M}]{2,})\s+\1\b/giu, fix: (m) => m[1] },
  { rule: 'lowercase-i', re: /(?<=^|\s)i(?=\s|[’']m\b|[’']ve\b|[’']d\b|[’']ll\b)/g, fix: () => 'I', langs: ['latin'] },
  { rule: 'sentence-capital', re: /(?<=[.!?]["”’]?\s+)([a-z])/g, fix: (m) => m[1].toUpperCase(), langs: ['latin'] },
  { rule: 'ellipsis', re: /\.{3}/g, fix: () => '…' },
  { rule: 'dash', re: /(?<=\S) -- ?(?=\S)| --(?=\S)/g, fix: () => ' — ' },
  { rule: 'danda', re: /(?<=[ऀ-ॿ])\s*\|(?=\s|$)/g, fix: () => '।', langs: ['deva'] },
  { rule: 'danda', re: /(?<=[ऀ-ॿ])\.(?=\s|$)/g, fix: () => '।', langs: ['deva'] },
  { rule: 'space-before-danda', re: / +(?=।)/g, fix: () => '', langs: ['deva'] },
];

let n = 0;
const nid = () => `i${++n}`;

export function proofreadChapter(ch: Chapter, lang: BookLang): Issue[] {
  const issues: Issue[] = [];
  const allowDeva = lang !== 'en';
  // Checks read the plain words of each block; offsets are in plain-text coordinates (see applyIssues).
  toParagraphs(ch.content).forEach((raw, paraIndex) => {
    const p = plainOf(raw);
    const isDeva = /[ऀ-ॿ]/.test(p);
    const taken: [number, number][] = [];
    for (const r of RULES) {
      if (r.langs && !r.langs.some((l) => (l === 'deva' ? isDeva && allowDeva : !isDeva || /[A-Za-z]/.test(p)))) continue;
      r.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = r.re.exec(p))) {
        const start = m.index, end = m.index + m[0].length;
        if (end === start) { r.re.lastIndex++; continue; }
        if (taken.some(([a, z]) => start < z && end > a)) continue;
        const replacement = r.fix(m);
        if (replacement === m[0]) continue;
        taken.push([start, end]);
        issues.push({ id: nid(), chapterId: ch.id, paraIndex, start, end, original: m[0], replacement, rule: r.rule, pre: p.slice(Math.max(0, start - 28), start), post: p.slice(end, end + 28) });
      }
    }
  });
  return issues.sort((a, b) => a.paraIndex - b.paraIndex || a.start - b.start);
}

/** Capitalised words spelled two ways across the book ("Nanaji" ×14, "Nanajee" ×2). */
export interface NameVariant { preferred: string; preferredCount: number; variant: string; variantCount: number }

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function findNameVariants(chapters: Chapter[]): NameVariant[] {
  const counts = new Map<string, number>();
  for (const ch of chapters) {
    for (const m of ch.content.matchAll(/(?<![.!?]\s|^)\b([A-Z][a-z]{3,})\b/gm)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  const words = [...counts.entries()].filter(([, c]) => c >= 1);
  const out: NameVariant[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
    const [a, ca] = words[i], [b, cb] = words[j];
    if (lev(a.toLowerCase(), b.toLowerCase()) !== 1) continue;
    if (Math.max(ca, cb) < 2) continue;
    const [pref, pc, vari, vc] = ca >= cb ? [a, ca, b, cb] : [b, cb, a, ca];
    const key = pref + '|' + vari;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ preferred: pref, preferredCount: pc, variant: vari, variantCount: vc });
  }
  return out;
}

/** Applies accepted issues to a chapter (right-to-left so offsets stay valid). */
export function applyIssues(ch: Chapter, accepted: Issue[]): string {
  const paras = toParagraphs(ch.content);
  const byPara = new Map<number, Issue[]>();
  accepted.filter((i) => i.chapterId === ch.id).forEach((i) => byPara.set(i.paraIndex, [...(byPara.get(i.paraIndex) ?? []), i]));
  byPara.forEach((list, idx) => {
    const raw = paras[idx];
    if (raw === undefined) return;
    let p = plainOf(raw);
    [...list].sort((a, b) => b.start - a.start).forEach((i) => {
      if (p.slice(i.start, i.end) === i.original) p = p.slice(0, i.start) + i.replacement + p.slice(i.end);
    });
    paras[idx] = applyPlainEdit(raw, p);
  });
  return fromParagraphs(paras);
}

export function replaceWordEverywhere(content: string, from: string, to: string): { text: string; count: number } {
  let count = 0;
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = content.replace(new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${esc}(?![\\p{L}\\p{M}\\p{N}])`, 'gu'), () => { count++; return to; });
  return { text, count };
}
