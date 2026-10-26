/**
 * Voice editing: the author says what to change and where, in their own words.
 * BolToBook finds the place and prepares exactly that change for approval.
 * It never invents text: inserted or replacement words always come from the instruction.
 *
 * Supported instructions (English):
 *   "Go to where Ram tells Cam the truth and add: he had known for three years"
 *   "Find the scene where they reach the station and add that it was raining"
 *   "After 'the clock had stopped' add it was ten past four"
 *   "Before 'She sat down' add Nobody looked at her"
 *   "Replace 'early' with 'late'"   ·   "Change the platform to Platform Four"
 *   "Delete 'which Cam took as a kind of permission'"
 * Hindi:
 *   "जहाँ राम कैम को सच बताता है, वहाँ जोड़ो कि उसे तीन साल से पता था"
 *   "'जल्दी' को 'देर से' से बदलो"   ·   "'बहुत भीड़ थी' हटाओ"
 *   "'घड़ी रुकी थी' के बाद जोड़ो कि सवा चार बजे थे"
 */
import type { Chapter, Entity } from '@/data/types';
import { asSentence, escapeRegExp, fromParagraphs, isDevanagari, splitSentences, toParagraphs } from './text';
import { searchBook, tokenize, type Hit } from './search';
import { applyPlainEdit, plainOf } from './markdown';

export type EditKind = 'add' | 'insert-after' | 'insert-before' | 'replace' | 'delete';

export interface ParsedCommand {
  kind: EditKind;
  /** Description of where (for 'add'). */
  locator?: string;
  /** Exact words to find (replace / delete / insert-after / insert-before). */
  target?: string;
  /** The author's words to put in. */
  payload?: string;
}

export interface Proposal {
  command: ParsedCommand;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  paraIndex: number;
  /** The block as stored (Markdown). */
  before: string;
  /** The block after the change (Markdown, formatting kept). Show it with `plainOf`. */
  after: string;
  /** Other places it might mean, so the author can redirect with one tap. */
  alternatives: Hit[];
}

export type EditResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; reason: 'unparsed' | 'not-found' | 'empty-book'; command?: ParsedCommand };

const Q = `["“'‘]?`;
const QE = `["”'’]?`;

const unquote = (s: string) => s.trim().replace(/^["“'‘]+|["”'’.,!?।]+$/g, '').trim();

export function parseCommand(input: string): ParsedCommand | null {
  const s = input.trim().replace(/\s+/g, ' ');
  let m: RegExpMatchArray | null;

  // ---- English ----
  if ((m = s.match(new RegExp(`^(?:please\\s+)?(?:replace|change|swap)\\s+${Q}(.+?)${QE}\\s+(?:with|to|for|into)\\s+${Q}(.+?)${QE}[.!]?$`, 'i'))))
    return { kind: 'replace', target: unquote(m[1]), payload: unquote(m[2]) };
  if ((m = s.match(new RegExp(`^(?:please\\s+)?(?:delete|remove|cut|take out)\\s+(?:the\\s+(?:words?|line|sentence|phrase)\\s+)?${Q}(.+?)${QE}[.!]?$`, 'i'))))
    return { kind: 'delete', target: unquote(m[1]) };
  if ((m = s.match(new RegExp(`^(?:please\\s+)?(after|before)\\s+${Q}(.+?)${QE}\\s*,?\\s*(?:add|write|insert|put)\\s*(?:that|:)?\\s*(.+)$`, 'i'))))
    return { kind: m[1].toLowerCase() === 'after' ? 'insert-after' : 'insert-before', target: unquote(m[2]), payload: unquote(m[3]) };
  if ((m = s.match(/^(?:please\s+)?(?:go to|find|take me to|jump to|open)?\s*(?:the\s+(?:scene|part|place|moment|bit|line|paragraph)\s+)?(?:where|when)\s+(.+?)\s*,?\s+(?:and\s+(?:then\s+)?)?(?:add|write|insert|say|put)\s*(?:that|this|in|:)?\s*[:,]?\s*(.+)$/i)))
    return { kind: 'add', locator: m[1].trim(), payload: unquote(m[2]) };
  if ((m = s.match(/^(?:please\s+)?(?:add|write|insert)\s*(?:that|:)?\s*(.+?)\s+(?:where|when)\s+(.+)$/i)))
    return { kind: 'add', locator: m[2].trim(), payload: unquote(m[1]) };

  // ---- Hindi ----
  if ((m = s.match(new RegExp(`^${Q}(.+?)${QE}\\s+को\\s+${Q}(.+?)${QE}\\s+(?:से|में)\\s+(?:बदल|बदली कर)(?:ो|ें|िए|दो|दें|दीजिए)`))))
    return { kind: 'replace', target: unquote(m[1]), payload: unquote(m[2]) };
  if ((m = s.match(new RegExp(`^${Q}(.+?)${QE}\\s+(?:को\\s+)?(?:हटा|मिटा|काट)(?:ो|ें|िए|दो|दें|ओ|दीजिए)`))))
    return { kind: 'delete', target: unquote(m[1]) };
  if ((m = s.match(new RegExp(`^${Q}(.+?)${QE}\\s+के\\s+(बाद|पहले)\\s+(?:जोड़|लिख)(?:ो|ें|िए|दो|दें|दीजिए)\\s*(?:कि|:)?\\s*(.+)$`))))
    return { kind: m[2] === 'बाद' ? 'insert-after' : 'insert-before', target: unquote(m[1]), payload: unquote(m[3]) };
  if ((m = s.match(/^(?:जहाँ|जहां|जिस जगह|जिस सीन में)\s+(.+?)\s*,?\s*(?:वहाँ|वहां|उसमें|वहीं)\s+(?:यह\s+|ये\s+)?(?:जोड़|लिख)(?:ो|ें|िए|दो|दें|दीजिए)\s*(?:कि|:)?\s*(.+)$/)))
    return { kind: 'add', locator: m[1].trim(), payload: unquote(m[2]) };

  return null;
}

/** Finds `target` in the book (case-insensitive, tolerant of quote styles). */
function findExact(target: string, chapters: Chapter[]): { ch: Chapter; paraIndex: number; index: number; match: string }[] {
  const norm = escapeRegExp(target).replace(/['’‘]/g, "['’‘]").replace(/["“”]/g, '["“”]').replace(/\s+/g, '\\s+');
  const re = new RegExp(norm, 'i');
  const out: { ch: Chapter; paraIndex: number; index: number; match: string }[] = [];
  for (const ch of chapters) {
    toParagraphs(ch.content).forEach((raw, i) => {
      const p = plainOf(raw);
      const m = p.match(re);
      if (m && m.index !== undefined) out.push({ ch, paraIndex: i, index: m.index, match: m[0] });
    });
  }
  return out;
}

function sentenceOf(p: string, locatorTokens: string[]): { start: number; end: number } {
  const sents = splitSentences(p);
  if (!sents.length) return { start: 0, end: p.length };
  let best = sents[sents.length - 1], bestScore = -1;
  for (const s of sents) {
    const toks = new Set(tokenize(s.text));
    const score = locatorTokens.filter((t) => toks.has(t)).length;
    if (score > bestScore) { best = s; bestScore = score; }
  }
  // Include a closing quote that belongs to the sentence.
  let end = best.end;
  while (end < p.length && /["”’']/.test(p[end])) end++;
  return { start: best.start, end };
}

/** Builds the proposal for a parsed command against the manuscript. */
export function proposeEdit(input: string, chapters: Chapter[], opts: { entities?: Entity[]; preferHit?: Hit } = {}): EditResult {
  if (!chapters.some((c) => c.content.trim())) return { ok: false, reason: 'empty-book' };
  const command = parseCommand(input);
  if (!command) return { ok: false, reason: 'unparsed' };

  // Matching and the change itself work on the plain words; the result is written back into the
  // block's Markdown so bold, italics, headings and lists around the change are kept.
  const make = (ch: Chapter, paraIndex: number, plainAfter: string, alternatives: Hit[] = []): EditResult => {
    const raw = toParagraphs(ch.content)[paraIndex];
    return {
      ok: true,
      proposal: { command, chapterId: ch.id, chapterTitle: ch.title, chapterOrder: ch.order, paraIndex, before: raw, after: applyPlainEdit(raw, plainAfter), alternatives },
    };
  };

  if (command.kind === 'add') {
    const hits = opts.preferHit ? [opts.preferHit] : searchBook(command.locator!, chapters, { entities: opts.entities, limit: 4 });
    if (!hits.length) return { ok: false, reason: 'not-found', command };
    const top = hits[0];
    const ch = chapters.find((c) => c.id === top.chapterId)!;
    const p = plainOf(toParagraphs(ch.content)[top.paraIndex]);
    const deva = isDevanagari(p) || isDevanagari(command.payload!);
    const { end } = sentenceOf(p, tokenize(command.locator!));
    const insert = asSentence(command.payload!, deva);
    const after = p.slice(0, end) + ' ' + insert + p.slice(end).replace(/^(?=\S)/, ' ');
    return make(ch, top.paraIndex, after.replace(/ {2,}/g, ' '), hits.slice(1));
  }

  const found = findExact(command.target!, chapters);
  if (!found.length) return { ok: false, reason: 'not-found', command };
  const f = found[0];
  const p = plainOf(toParagraphs(f.ch.content)[f.paraIndex]);
  const a = f.index, z = f.index + f.match.length;
  let after = p;
  if (command.kind === 'replace') after = p.slice(0, a) + command.payload + p.slice(z);
  if (command.kind === 'delete') after = (p.slice(0, a).replace(/[ ,]+$/, '') + p.slice(z)).replace(/ {2,}/g, ' ').replace(/ ([,.;:!?।])/g, '$1').trim();
  if (command.kind === 'insert-after') after = p.slice(0, z) + ' ' + command.payload + p.slice(z);
  if (command.kind === 'insert-before') after = p.slice(0, a) + command.payload + ' ' + p.slice(a);
  const alternatives: Hit[] = found.slice(1, 4).map((x) => ({
    chapterId: x.ch.id, chapterTitle: x.ch.title, chapterOrder: x.ch.order, paraIndex: x.paraIndex, score: 1,
    text: plainOf(toParagraphs(x.ch.content)[x.paraIndex]), ranges: [[x.index, x.index + x.match.length]],
  }));
  return make(f.ch, f.paraIndex, after.replace(/ {2,}/g, ' '), alternatives);
}

/** Applies an accepted proposal to the chapter text. */
export function applyProposal(chapter: Chapter, proposal: Pick<Proposal, 'paraIndex' | 'after'>): string {
  const paras = toParagraphs(chapter.content);
  paras[proposal.paraIndex] = proposal.after;
  return fromParagraphs(paras);
}
