/**
 * Chapter text format: a small, documented Markdown subset.
 *
 * `Chapter.content` stays ONE string. Blocks are separated by a blank line ("\n\n"), exactly
 * like plain paragraphs always were, so every block-by-block tool (find, voice edits, review
 * checks, deep links `?para=`, layout keys `ch:<id>:p:<n>`) keeps its indexes. Plain text written
 * before formatting existed is valid content and reads the same.
 *
 * Blocks (the first line decides the kind):
 *   paragraph        any text. A single "\n" inside a block is a line break.
 *   `## Heading`     section heading            `### Subheading`   smaller heading
 *   `> Quote`        block quote (every line of the block may start with "> ")
 *   `- item`         bulleted list  ┐ consecutive lines are items of ONE list (one block).
 *   `1. item`        numbered list  ┘ Two-space indent = nested one level ("  - sub").
 *                    A line without a marker continues the item above (a line break in it).
 *   `***`            scene break (also `* * *`, `⁂`, `#`, `~`, `—`, `---` on their own)
 *   `{c} ` `{r} ` `{j} ` `{l} `  alignment, written FIRST: `{c} ## Heading`, `{r} > quote`, `{c} text`.
 *                    No marker = the book's own alignment.
 *
 * Inline:  **bold**  *italic*  __underline__  ~~strike~~  ==highlight==
 *   A delimiter opens only before a non-space and closes only after a non-space, and only when
 *   its partner exists, so "5 * 3" or "a == b" stay literal.
 *
 * Escapes: a backslash before any ASCII punctuation makes it literal (`\*`, `\#`, `\{`, `\\`).
 *   The serializer escapes every `*`, doubled `_ ~ =`, a backslash that precedes punctuation,
 *   and a block's first characters when they would read as a marker ("\- ", "\## ", "1\. ").
 *
 * This module has no dependencies; the editor's ProseMirror bridge lives in the editor folder.
 */

export type Align = 'left' | 'center' | 'right' | 'justify';
export type MarkName = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight';
export const MARKS: MarkName[] = ['bold', 'italic', 'underline', 'strike', 'highlight'];

/** A stretch of text with the same marks. `text` may contain "\n" (a line break). */
export interface Run { text: string; marks: MarkName[] }

export interface ListItem { ordered: boolean; depth: 0 | 1; runs: Run[] }

export type Block =
  | { type: 'paragraph' | 'heading' | 'subheading' | 'quote'; align?: Align; runs: Run[] }
  | { type: 'list'; items: ListItem[] }
  | { type: 'break' }
  | { type: 'empty' };

const DELIM: Record<MarkName, string> = { bold: '**', italic: '*', underline: '__', strike: '~~', highlight: '==' };
const ALIGN_CODE: Record<string, Align> = { l: 'left', c: 'center', r: 'right', j: 'justify' };
const CODE_OF: Record<Align, string> = { left: 'l', center: 'c', right: 'r', justify: 'j' };

const PUNCT = /[!-/:-@[-`{-~]/;
const isWs = (c: string | undefined) => c === undefined || /\s/.test(c);

export const SCENE_BREAK = /^\s*(?:(?:\*\s*){3}|⁂|#|~|—|-{3,})\s*$/;
const LIST_LINE = /^( *)(?:([-•+])|(\d{1,3})[.)])[ \t]+(.*)$/;
const ALIGN_LEAD = /^\{([lcrj])\}[ \t]+/;

// ---------------------------------------------------------------- inline

/** Parses inline marks into runs. */
export function parseInline(src: string): Run[] {
  const runs: Run[] = [];
  const open = new Set<MarkName>();
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const marks = MARKS.filter((m) => open.has(m));
    const last = runs[runs.length - 1];
    if (last && sameMarks(last.marks, marks)) last.text += buf;
    else runs.push({ text: buf, marks });
    buf = '';
  };
  /** Is there a closing `d` after position `from`? (`*` runs of length 2 are bold, not italic.) */
  const hasCloser = (d: string, from: number) => {
    for (let j = from; j < src.length; j++) {
      const c = src[j];
      if (c === '\\' && j + 1 < src.length && PUNCT.test(src[j + 1])) { j++; continue; }
      if (c !== d[0]) continue;
      let k = j;
      while (k < src.length && src[k] === c) k++;
      const n = k - j;
      const ok = d === '*' ? (n === 1 || n >= 3) : n >= 2;
      if (ok && !isWs(src[j - 1])) return true;
      j = k - 1;
    }
    return false;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length && PUNCT.test(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
    let handled = false;
    if (c === '*' || c === '_' || c === '~' || c === '=') {
      const dbl = src[i + 1] === c;
      const tries: MarkName[] = c === '*' ? (dbl ? ['bold', 'italic'] : ['italic']) : c === '_' ? (dbl ? ['underline'] : []) : c === '~' ? (dbl ? ['strike'] : []) : dbl ? ['highlight'] : [];
      for (const m of tries) {
        const d = DELIM[m];
        const after = src[i + d.length];
        if (open.has(m)) {
          if (!isWs(src[i - 1]) && i > 0) { flush(); open.delete(m); i += d.length; handled = true; break; }
        } else if (!isWs(after) && hasCloser(d, i + d.length)) {
          flush(); open.add(m); i += d.length; handled = true; break;
        }
      }
    }
    if (!handled) { buf += c; i++; }
  }
  flush();
  return runs;
}

function sameMarks(a: MarkName[], b: MarkName[]) {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

/** Escapes plain text so it reads back literally. */
export function escapeText(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1], p = s[i - 1];
    if (c === '\\') out += n !== undefined && PUNCT.test(n) ? '\\\\' : '\\';
    else if (c === '*') out += '\\*';
    else if ((c === '_' || c === '~' || c === '=') && (n === c || p === c)) out += '\\' + c;
    else out += c;
  }
  return out;
}

/** Writes runs back as inline Markdown (whitespace never sits inside a delimiter). */
export function serializeInline(runsIn: Run[]): string {
  // Split into pieces at whitespace edges so marks can be trimmed off spaces and line breaks.
  type Piece = { text: string; marks: Set<MarkName>; ws: boolean };
  const pieces: Piece[] = [];
  for (const r of runsIn) {
    for (const part of r.text.split(/(\s+)/)) {
      if (!part) continue;
      pieces.push({ text: part, marks: new Set(r.marks), ws: /^\s+$/.test(part) });
    }
  }
  pieces.forEach((p, i) => {
    if (!p.ws) return;
    if (p.text.includes('\n')) { p.marks = new Set(); return; }
    let a = i - 1; while (a >= 0 && pieces[a].ws) a--;
    let z = i + 1; while (z < pieces.length && pieces[z].ws) z++;
    const prev = a >= 0 && !pieces[a].text.includes('\n') ? pieces[a].marks : null;
    const next = z < pieces.length ? pieces[z].marks : null;
    if (!prev || !next || pieces.slice(a + 1, z).some((x) => x.text.includes('\n'))) { p.marks = new Set(); return; }
    p.marks = new Set([...p.marks].filter((m) => prev.has(m) && next.has(m)));
  });
  let out = '';
  let cur = new Set<MarkName>();
  for (const p of pieces) {
    const closing = MARKS.filter((m) => cur.has(m) && !p.marks.has(m)).reverse();
    const opening = MARKS.filter((m) => !cur.has(m) && p.marks.has(m));
    out += closing.map((m) => DELIM[m]).join('') + opening.map((m) => DELIM[m]).join('');
    out += escapeText(p.text);
    cur = p.marks;
  }
  out += MARKS.filter((m) => cur.has(m)).reverse().map((m) => DELIM[m]).join('');
  return out;
}

export const runsText = (runs: Run[]) => runs.map((r) => r.text).join('');

// ---------------------------------------------------------------- blocks

/** Splits content into raw blocks (same split, same indexes as `toParagraphs`). */
export const splitBlocks = (md: string): string[] => md.split(/\n{2,}/).map((p) => p.replace(/\s+$/g, ''));

export function parseBlock(raw: string): Block {
  const src = raw.replace(/\s+$/, '').replace(/^\n+/, '');
  if (!src.trim()) return { type: 'empty' };
  if (!src.includes('\n') && SCENE_BREAK.test(src)) return { type: 'break' };
  let first = src;
  let align: Align | undefined;
  const am = first.match(ALIGN_LEAD);
  if (am) { align = ALIGN_CODE[am[1]]; first = first.slice(am[0].length); }

  const lm = !align ? first.split('\n')[0].match(LIST_LINE) : null;
  if (lm) {
    const items: ListItem[] = [];
    let cur: { ordered: boolean; depth: 0 | 1; text: string } | null = null;
    const push = () => { if (cur) items.push({ ordered: cur.ordered, depth: cur.depth, runs: parseInline(cur.text) }); };
    for (const line of first.split('\n')) {
      const m = line.match(LIST_LINE);
      if (m) {
        push();
        cur = { ordered: !!m[3], depth: m[1].length >= 2 && cur ? 1 : 0, text: m[4] };
      } else if (cur) {
        cur.text += '\n' + line.replace(/^\s+/, '');
      }
    }
    push();
    return { type: 'list', items };
  }
  let type: 'paragraph' | 'heading' | 'subheading' | 'quote' = 'paragraph';
  let body = first;
  if (/^### /.test(body)) { type = 'subheading'; body = body.slice(4); }
  else if (/^## /.test(body)) { type = 'heading'; body = body.slice(3); }
  else if (/^>( |$)/.test(body)) {
    type = 'quote';
    body = body.split('\n').map((l) => l.replace(/^> ?/, '')).join('\n');
  }
  return { type, align, runs: parseInline(body) };
}

export const parseBlocks = (md: string): Block[] => splitBlocks(md).map(parseBlock);

/** Would this text, at the start of a block or list line, be read as a marker? */
const LEAD_RISK = /^(?:#{2,3} |>|[-•+][ \t]|\d{1,3}[.)][ \t]|\{[lcrj]\}[ \t])/;

function guardLead(s: string): string {
  if (SCENE_BREAK.test(s) && !s.includes('\n')) return '\\' + s;
  if (!LEAD_RISK.test(s)) return s;
  const d = s.match(/^(\d{1,3})([.)])/);
  if (d) return d[1] + '\\' + d[2] + s.slice(d[0].length);
  return '\\' + s;
}

/** Inline text with line breaks; lines after a break never start a new block. */
const inlineLines = (runs: Run[]) => serializeInline(runs).replace(/\n{2,}/g, '\n');

export function serializeBlock(b: Block): string {
  switch (b.type) {
    case 'empty': return '';
    case 'break': return '***';
    case 'list': {
      const counters = [0, 0];
      let lastDepth = 0;
      return b.items.map((it) => {
        if (it.depth === 0 && lastDepth === 1) counters[1] = 0;
        lastDepth = it.depth;
        const n = ++counters[it.depth];
        const pad = it.depth ? '  ' : '';
        const marker = it.ordered ? `${n}. ` : '- ';
        const lines = inlineLines(it.runs).split('\n');
        return lines.map((l, i) => (i === 0 ? pad + marker + l : pad + '  ' + guardLead(l))).join('\n');
      }).filter((l) => l.trim()).join('\n');
    }
    default: {
      const text = inlineLines(b.runs).replace(/^\s+/, '');
      if (!text.trim()) return '';
      const lead = b.align && b.align !== 'left' ? `{${CODE_OF[b.align]}} ` : '';
      if (b.type === 'heading') return `${lead}## ${text}`;
      if (b.type === 'subheading') return `${lead}### ${text}`;
      if (b.type === 'quote') return `${lead}> ${text.split('\n').join('\n> ')}`;
      return lead + (lead ? text : guardLead(text));
    }
  }
}

export const serializeBlocks = (blocks: Block[]): string => blocks.map(serializeBlock).filter((s) => s.trim()).join('\n\n');

// ---------------------------------------------------------------- plain text

/** The words of one block, without marks (list items and line breaks on their own lines). */
export function blockPlain(b: Block): string {
  if (b.type === 'empty' || b.type === 'break') return '';
  if (b.type === 'list') return b.items.map((i) => runsText(i.runs)).join('\n');
  return runsText(b.runs);
}

/** Plain text of one raw block. */
export const plainOf = (rawBlock: string): string => blockPlain(parseBlock(rawBlock));

/** The whole text without marks (for counting, speech and display). Blocks joined by blank lines. */
export function toPlain(md: string): string {
  if (!md) return '';
  if (!/[*_~=\\{}#>\-•+\d⁂]/.test(md)) return md;
  return splitBlocks(md).map(plainOf).filter((p) => p.trim()).join('\n\n');
}

/** Plain text (paragraphs separated by blank lines, "\n" = line break) → Markdown that reads back as the same words. */
export function plainToMd(text: string): string {
  return splitBlocks(text).map((p) => serializeBlock({ type: 'paragraph', runs: p ? [{ text: p, marks: [] }] : [] })).filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------- editing in plain coordinates

interface Ch { c: string; marks: MarkName[]; sep?: { ordered: boolean; depth: 0 | 1 } }

function toChars(runs: Run[]): Ch[] {
  const out: Ch[] = [];
  for (const r of runs) for (const c of r.text) out.push({ c, marks: r.marks });
  return out;
}
function fromChars(chars: Ch[]): Run[] {
  const runs: Run[] = [];
  for (const ch of chars) {
    const last = runs[runs.length - 1];
    if (last && sameMarks(last.marks, ch.marks)) last.text += ch.c;
    else runs.push({ text: ch.c, marks: ch.marks });
  }
  return runs;
}

/**
 * Replaces plain-text range [a, z) of a block with `insert` (plain), keeping the marks around it.
 * Offsets are in `blockPlain` coordinates (code units). New words take the marks of the words they replace,
 * or of the character before them.
 */
export function replacePlainRange(rawBlock: string, a: number, z: number, insert: string): string {
  const b = parseBlock(rawBlock);
  if (b.type === 'empty' || b.type === 'break') {
    return serializeBlock({ type: 'paragraph', runs: [{ text: insert, marks: [] }] }) || rawBlock;
  }
  let chars: Ch[];
  if (b.type === 'list') {
    chars = [];
    b.items.forEach((it, i) => {
      if (i > 0) chars.push({ c: '\n', marks: [], sep: { ordered: it.ordered, depth: it.depth } });
      chars.push(...toChars(it.runs));
    });
  } else chars = toChars(b.runs);
  // Code-unit offsets → char indexes (surrogate pairs count as two units in plain strings).
  const unitToIdx = (u: number) => { let acc = 0; for (let i = 0; i < chars.length; i++) { if (acc >= u) return i; acc += chars[i].c.length; } return chars.length; };
  const ia = unitToIdx(a), iz = Math.max(ia, unitToIdx(z));
  const ref = ia < iz ? chars[ia] : chars[ia - 1] ?? chars[ia];
  const marks = ref && !ref.sep && ref.c !== '\n' ? ref.marks : [];
  const ins: Ch[] = [...insert].map((c) => ({ c, marks }));
  const next = [...chars.slice(0, ia), ...ins, ...chars.slice(iz)];
  if (b.type === 'list') {
    const first = b.items[0];
    const items: ListItem[] = [];
    let meta = { ordered: first.ordered, depth: first.depth as 0 | 1 };
    let cur: Ch[] = [];
    for (const ch of next) {
      if (ch.sep) { items.push({ ...meta, runs: fromChars(cur) }); cur = []; meta = ch.sep; continue; }
      cur.push(ch);
    }
    items.push({ ...meta, runs: fromChars(cur) });
    return serializeBlock({ type: 'list', items });
  }
  return serializeBlock({ ...b, runs: fromChars(next) });
}

/** Applies a plain-text edit (old plain → new plain) to a block, keeping its formatting. */
export function applyPlainEdit(rawBlock: string, newPlain: string): string {
  const old = plainOf(rawBlock);
  if (old === newPlain) return rawBlock;
  let i = 0;
  const n = Math.min(old.length, newPlain.length);
  while (i < n && old[i] === newPlain[i]) i++;
  let j = 0;
  while (j < n - i && old[old.length - 1 - j] === newPlain[newPlain.length - 1 - j]) j++;
  return replacePlainRange(rawBlock, i, old.length - j, newPlain.slice(i, newPlain.length - j));
}

// ---------------------------------------------------------------- HTML

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface HtmlOpts {
  /** XHTML output (EPUB): `<br/>`, `&apos;`. */
  xhtml?: boolean;
  /** Class names per block kind (e.g. the print renderer's). */
  cls?: Partial<Record<'paragraph' | 'heading' | 'subheading' | 'quote' | 'list' | 'break', string>>;
  /** What a scene break shows. */
  ornament?: string;
}

const TAG: Record<MarkName, [string, string]> = {
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  strike: ['<s>', '</s>'],
  highlight: ['<mark>', '</mark>'],
};

/** Runs (optionally the plain range [from, to)) as safe inline HTML. */
export function runsHtml(runs: Run[], from = 0, to = Infinity, o: HtmlOpts = {}): string {
  let out = '';
  let pos = 0;
  const br = o.xhtml ? '<br/>' : '<br>';
  for (const r of runs) {
    const a = Math.max(from, pos), z = Math.min(to, pos + r.text.length);
    pos += r.text.length;
    if (z <= a) continue;
    const t = r.text.slice(a - (pos - r.text.length), z - (pos - r.text.length));
    let inner = escHtml(t);
    if (o.xhtml) inner = inner.replace(/'/g, '&apos;');
    inner = inner.replace(/\n/g, br);
    for (const m of [...r.marks].reverse()) inner = TAG[m][0] + inner + TAG[m][1];
    out += inner;
  }
  return out;
}

const alignCss = (a?: Align) => (a ? ` style="text-align:${a}"` : '');
const clsAttr = (c?: string) => (c ? ` class="${c}"` : '');

/** One block as HTML. */
export function blockHtml(b: Block, o: HtmlOpts = {}): string {
  const c = o.cls ?? {};
  switch (b.type) {
    case 'empty': return '';
    case 'break': return `<p${clsAttr(c.break ?? 'scene-break')}>${o.ornament ?? '⁂'}</p>`;
    case 'heading': return `<h2${clsAttr(c.heading)}${alignCss(b.align)}>${runsHtml(b.runs, 0, Infinity, o)}</h2>`;
    case 'subheading': return `<h3${clsAttr(c.subheading)}${alignCss(b.align)}>${runsHtml(b.runs, 0, Infinity, o)}</h3>`;
    case 'quote': return `<blockquote${clsAttr(c.quote)}${alignCss(b.align)}><p>${runsHtml(b.runs, 0, Infinity, o)}</p></blockquote>`;
    case 'paragraph': return `<p${clsAttr(c.paragraph)}${alignCss(b.align)}>${runsHtml(b.runs, 0, Infinity, o)}</p>`;
    case 'list': {
      // Group into one level of nesting.
      let html = '';
      const tagOf = (ordered: boolean) => (ordered ? 'ol' : 'ul');
      let top: string | null = null;
      let sub: string | null = null;
      let liOpen = false;
      for (const it of b.items) {
        const body = runsHtml(it.runs, 0, Infinity, o);
        if (it.depth === 0) {
          if (sub) { html += `</${sub}>`; sub = null; }
          if (liOpen) { html += '</li>'; liOpen = false; }
          if (top !== tagOf(it.ordered)) { if (top) html += `</${top}>`; top = tagOf(it.ordered); html += `<${top}${clsAttr(c.list)}>`; }
          html += `<li>${body}`; liOpen = true;
        } else {
          if (!top) { top = tagOf(it.ordered); html += `<${top}${clsAttr(c.list)}>`; }
          if (!liOpen) { html += '<li>'; liOpen = true; }
          if (sub !== tagOf(it.ordered)) { if (sub) html += `</${sub}>`; sub = tagOf(it.ordered); html += `<${sub}>`; }
          html += `<li>${body}</li>`;
        }
      }
      if (sub) html += `</${sub}>`;
      if (liOpen) html += '</li>';
      if (top) html += `</${top}>`;
      return html;
    }
  }
}

/** The whole content as safe HTML (blocks in order, empties skipped). */
export function toHtml(md: string, o: HtmlOpts = {}): string {
  return parseBlocks(md).map((b) => blockHtml(b, o)).filter(Boolean).join('\n');
}
