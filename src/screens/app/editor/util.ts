import type { Chapter, Entity } from '@/data/types';
import { escapeRegExp, isDevanagari, toParagraphs } from '@/lib/text';
import { parseCommand, type ParsedCommand, type Proposal } from '@/lib/voiceEdit';
import type { Hit } from '@/lib/search';

/** Character offset where each paragraph starts (consistent with toParagraphs). */
export function paraOffsets(text: string): number[] {
  const starts = [0];
  const re = /\n{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) starts.push(m.index + m[0].length);
  return starts;
}

/** Which paragraph a character offset falls in. */
export function paraAt(text: string, offset: number): number {
  const starts = paraOffsets(text);
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= offset) i++;
  return i;
}

const MIRROR_PROPS = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-left-width',
  'border-right-width', 'border-bottom-width', 'text-indent', 'tab-size', 'text-transform', 'font-variant-ligatures',
];

/** Pixel offset (from the textarea's top edge) of the line containing `offset`. */
export function caretTop(ta: HTMLTextAreaElement, offset: number): number {
  const cs = getComputedStyle(ta);
  const div = document.createElement('div');
  for (const p of MIRROR_PROPS) div.style.setProperty(p, cs.getPropertyValue(p));
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.top = '0';
  div.style.left = '-9999px';
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflowWrap = 'break-word';
  div.style.boxSizing = 'border-box';
  div.style.borderStyle = 'solid';
  div.style.borderColor = 'transparent';
  div.style.width = `${ta.offsetWidth}px`;
  div.textContent = ta.value.slice(0, offset);
  const mark = document.createElement('span');
  mark.textContent = '​';
  div.appendChild(mark);
  document.body.appendChild(div);
  const top = mark.offsetTop;
  div.remove();
  return top;
}

/** A copy of the chapter where every paragraph except `paraIndex` is blanked, so a lookup can only land there. */
export function isolateChapter(ch: Chapter, paraIndex: number): Chapter {
  const paras = toParagraphs(ch.content);
  return { ...ch, content: paras.map((p, i) => (i === paraIndex ? p : '​')).join('\n\n') };
}

export function proposalAsHit(p: Proposal): Hit {
  return { chapterId: p.chapterId, chapterTitle: p.chapterTitle, chapterOrder: p.chapterOrder, paraIndex: p.paraIndex, score: 1, text: p.before, ranges: [] };
}

const EN_START = /^(?:please\s+)?(?:go to|find|take me|jump|open|replace|change|swap|delete|remove|cut|take out|after|before|add|write|insert|put|the (?:scene|part|place|moment)|where|when)\b/i;

/** Re-says the author's instruction with new words (same place, same kind of change). */
export function rebuildInstruction(original: string, cmd: ParsedCommand, payload: string): string {
  const hindi = !EN_START.test(original.trim());
  const p = payload.trim();
  const tgt = cmd.target ?? '';
  let hi = '', en = '';
  switch (cmd.kind) {
    case 'add':
      hi = `जहाँ ${cmd.locator} वहाँ जोड़ो कि ${p}`;
      en = `Go to where ${cmd.locator} and add: ${p}`;
      break;
    case 'replace':
      hi = `"${tgt}" को "${p}" से बदलो`;
      en = `Replace "${tgt}" with "${p}"`;
      break;
    case 'insert-after':
      hi = `"${tgt}" के बाद जोड़ो कि ${p}`;
      en = `After "${tgt}" add ${p}`;
      break;
    case 'insert-before':
      hi = `"${tgt}" के पहले जोड़ो कि ${p}`;
      en = `Before "${tgt}" add ${p}`;
      break;
    case 'delete':
      hi = `"${tgt}" हटाओ`;
      en = `Delete "${tgt}"`;
      break;
  }
  if (hindi && parseCommand(hi)) return hi;
  return en;
}

/** Names from the book bible that appear in this text. */
export function entitiesIn(text: string, entities: Entity[]): Entity[] {
  if (!text.trim()) return [];
  const low = text.toLowerCase();
  return entities.filter((e) => {
    if (e.kind !== 'character' && e.kind !== 'place') return false;
    const name = e.name.trim();
    if (name.length < 2) return false;
    if (isDevanagari(name)) return text.includes(name);
    if (!low.includes(name.toLowerCase())) return false;
    const re = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{M}\\p{N}])`, 'iu');
    return re.test(text);
  });
}

export interface Seg { t: string; cls?: string; caret?: boolean }

/** Splits styled segments into paragraphs on blank lines, keeping each segment's style. */
export function segsToParas(segs: Seg[]): Seg[][] {
  const paras: Seg[][] = [[]];
  for (const s of segs) {
    if (s.caret) { paras[paras.length - 1].push(s); continue; }
    const parts = s.t.split(/\n{2,}/);
    parts.forEach((part, i) => {
      if (i > 0) paras.push([]);
      if (part) paras[paras.length - 1].push({ t: part, cls: s.cls });
    });
  }
  return paras;
}

export const LEAD_PARA = /^\s*(?:new paragraph|next paragraph|नया पैराग्राफ़?|नया अनुच्छेद|अगला पैराग्राफ़?)\b/i;
export const TRAIL_PARA = /(?:new paragraph|next paragraph|नया पैराग्राफ़?|नया अनुच्छेद|अगला पैराग्राफ़?)\s*$/i;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, prefersReducedMotion() ? Math.min(ms, 60) : ms));

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function clip(s: string, n = 60) {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
