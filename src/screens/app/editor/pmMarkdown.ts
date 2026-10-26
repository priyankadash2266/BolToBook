/**
 * Bridge between the chapter's Markdown (see `@/lib/markdown`) and the editor's ProseMirror document.
 * One top-level editor node per Markdown block, in order, so block indexes line up
 * (empty paragraphs in the editor are simply not written out).
 */
import type { JSONContent } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  MARKS, parseBlocks, serializeBlock, splitBlocks, type Align, type Block, type ListItem, type MarkName, type Run,
} from '@/lib/markdown';

// ---------- Markdown → editor ----------

function inlineJson(runs: Run[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const r of runs) {
    const marks = r.marks.map((m) => ({ type: m }));
    r.text.split('\n').forEach((part, i) => {
      if (i > 0) out.push({ type: 'hardBreak' });
      if (part) out.push({ type: 'text', text: part, ...(marks.length ? { marks } : {}) });
    });
  }
  return out;
}

const para = (runs: Run[], extra: Record<string, unknown> = {}): JSONContent => {
  const content = inlineJson(runs);
  return { type: 'paragraph', ...(Object.keys(extra).length ? { attrs: extra } : {}), ...(content.length ? { content } : {}) };
};

function listJson(items: ListItem[]): JSONContent[] {
  const lists: JSONContent[] = [];
  let cur: JSONContent | null = null;
  for (const it of items) {
    const type = it.ordered ? 'orderedList' : 'bulletList';
    if (it.depth === 0 || !cur) {
      if (!cur || cur.type !== type) { cur = { type, content: [] }; lists.push(cur); }
      cur.content!.push({ type: 'listItem', content: [para(it.runs)] });
      continue;
    }
    const parent = cur.content![cur.content!.length - 1];
    const last = parent.content![parent.content!.length - 1];
    let sub = last.type === 'bulletList' || last.type === 'orderedList' ? last : null;
    if (!sub || sub.type !== type) { sub = { type, content: [] }; parent.content!.push(sub); }
    sub.content!.push({ type: 'listItem', content: [para(it.runs)] });
  }
  return lists;
}

function blockJson(b: Block): JSONContent[] {
  const align = (a?: Align) => (a && a !== 'left' ? { textAlign: a } : {});
  switch (b.type) {
    case 'empty': return [];
    case 'break': return [{ type: 'horizontalRule' }];
    case 'list': return listJson(b.items);
    case 'heading': case 'subheading': {
      const content = inlineJson(b.runs);
      return [{ type: 'heading', attrs: { level: b.type === 'heading' ? 2 : 3, ...align(b.align) }, ...(content.length ? { content } : {}) }];
    }
    case 'quote': {
      const content = inlineJson(b.runs);
      return [{ type: 'quote', ...(b.align ? { attrs: align(b.align) } : {}), ...(content.length ? { content } : {}) }];
    }
    default: return [para(b.runs, align(b.align))];
  }
}

export function mdToDoc(md: string): JSONContent {
  const content = parseBlocks(md).flatMap(blockJson);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

// ---------- editor → Markdown ----------

function runsOf(node: PMNode): Run[] {
  const runs: Run[] = [];
  node.forEach((child) => {
    if (child.type.name === 'hardBreak') { runs.push({ text: '\n', marks: [] }); return; }
    if (!child.isText || !child.text) return;
    const names = new Set(child.marks.map((m) => m.type.name));
    runs.push({ text: child.text, marks: MARKS.filter((m) => names.has(m)) as MarkName[] });
  });
  return runs;
}

const alignOf = (node: PMNode): Align | undefined => {
  const a = node.attrs.textAlign as string | null | undefined;
  return a === 'center' || a === 'right' || a === 'justify' ? a : undefined;
};

function listItems(list: PMNode, depth: number, out: ListItem[]) {
  const ordered = list.type.name === 'orderedList';
  list.forEach((li) => {
    const texts: Run[] = [];
    const nested: PMNode[] = [];
    li.forEach((child) => {
      if (child.type.name === 'bulletList' || child.type.name === 'orderedList') { nested.push(child); return; }
      if (child.isTextblock) {
        if (texts.length) texts.push({ text: '\n', marks: [] });
        texts.push(...runsOf(child));
      }
    });
    out.push({ ordered, depth: depth ? 1 : 0, runs: texts });
    for (const n of nested) listItems(n, depth + 1, out);
  });
}

export function nodeToBlock(node: PMNode): Block {
  switch (node.type.name) {
    case 'horizontalRule': return { type: 'break' };
    case 'heading': return { type: node.attrs.level >= 3 ? 'subheading' : 'heading', align: alignOf(node), runs: runsOf(node) };
    case 'quote': return { type: 'quote', align: alignOf(node), runs: runsOf(node) };
    case 'bulletList': case 'orderedList': {
      const items: ListItem[] = [];
      listItems(node, 0, items);
      return { type: 'list', items };
    }
    default:
      if (node.isTextblock) return { type: 'paragraph', align: alignOf(node), runs: runsOf(node) };
      return { type: 'paragraph', runs: [{ text: node.textContent, marks: [] }] };
  }
}

export function docToMd(doc: PMNode): string {
  const parts: string[] = [];
  doc.forEach((n) => {
    const s = serializeBlock(nodeToBlock(n));
    if (s.trim()) parts.push(s);
  });
  return parts.join('\n\n');
}

/** A slice of the document (e.g. the selection) as Markdown. */
export function sliceToMd(doc: PMNode, from: number, to: number): string {
  return docToMd(doc.cut(from, to));
}

// ---------- positions ----------

/** Top-level nodes that are written out, with their start positions (index = Markdown block ordinal). */
export function writtenBlocks(doc: PMNode): { node: PMNode; pos: number }[] {
  const out: { node: PMNode; pos: number }[] = [];
  doc.forEach((node, offset) => {
    if (serializeBlock(nodeToBlock(node)).trim()) out.push({ node, pos: offset });
  });
  return out;
}

/** Markdown block index (as `toParagraphs` counts, empties included) → ordinal among written blocks. */
export function ordinalOf(md: string, blockIndex: number): number {
  const raw = splitBlocks(md);
  let n = 0;
  for (let i = 0; i < Math.min(blockIndex, raw.length); i++) if (raw[i].trim()) n++;
  return n;
}

/** Markdown block index of the written block at `ordinal`. */
export function indexOfOrdinal(md: string, ordinal: number): number {
  const raw = splitBlocks(md);
  let n = -1;
  for (let i = 0; i < raw.length; i++) if (raw[i].trim() && ++n === ordinal) return i;
  return Math.max(0, raw.length - 1);
}

/**
 * Document position of every plain-text character of a top-level node (the same plain text
 * `@/lib/markdown` `blockPlain` gives), plus one past the end.
 */
export function plainPositions(node: PMNode, pos: number): number[] {
  const out: number[] = [];
  let first = true;
  const textblock = (n: PMNode, p: number) => {
    if (!first) out.push(p); // the "\n" between list items / item lines
    first = false;
    n.forEach((child, off) => {
      const cp = p + 1 + off;
      if (child.isText) for (let i = 0; i < child.text!.length; i++) out.push(cp + i);
      else if (child.type.name === 'hardBreak') out.push(cp);
    });
  };
  if (node.isTextblock) textblock(node, pos);
  else {
    node.descendants((n, p) => {
      if (!n.isTextblock) return true;
      if (n.textContent.trim()) textblock(n, pos + 1 + p);
      return false;
    });
  }
  out.push(out.length ? out[out.length - 1] + 1 : pos + 1);
  return out;
}

/** Start and end positions of the text inside a top-level node. */
export function textEnds(node: PMNode, pos: number): { start: number; end: number } {
  let start = -1, end = -1;
  node.descendants((n, p) => {
    if (!n.isTextblock) return true;
    const abs = pos + 1 + p;
    if (start < 0) start = abs + 1;
    end = abs + 1 + n.content.size;
    return false;
  });
  if (node.isTextblock) { start = pos + 1; end = pos + 1 + node.content.size; }
  if (start < 0) { start = pos; end = pos + node.nodeSize; }
  return { start, end };
}
