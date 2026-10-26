/**
 * The author's design changes (FormatSpec.layout): which block a key names, what can be
 * changed on it, and pure operations that return a new FormatSpec. Layout only — the words
 * of the book are never touched here.
 */
import type { BlockStyle, CoverLayout, FormatSpec } from '@/data/types';
import { blockStyleOf } from '@/lib/paginate';

export type BlockKind = 'cover' | 'fixed' | 'heading' | 'para' | 'running' | 'end';

export function kindOf(key: string): BlockKind {
  if (key === 'cover:title') return 'cover';
  if (key === 'run:head' || key === 'run:folio') return 'running';
  if (key === 'all:chtitle' || /^ch:.+:title$/.test(key)) return 'heading';
  if (/^ch:.+:p:\d+$/.test(key)) return 'para';
  if (/^ch:.+:end$/.test(key)) return 'end';
  return 'fixed';
}

/** Which controls the floating toolbar shows for a block. */
export function controlsFor(key: string) {
  const k = kindOf(key);
  return {
    align: k !== 'end',
    justify: k === 'para',
    move: k === 'fixed' || k === 'running' || k === 'heading' || k === 'cover',
    position: k === 'cover',
    space: k === 'para' || k === 'heading' || key === 'toc' || key === 'about:head',
    breakBefore: k === 'para',
    recto: k === 'heading',
    blankAfter: k === 'para' || k === 'end' || ['half:title', 'title:main', 'copyright', 'dedication', 'toc'].includes(key),
    size: k !== 'end',
    indent: k === 'para',
    italic: k === 'heading' || k === 'fixed',
  };
}

export const chapterIdOf = (key: string) => key.match(/^ch:(.+?):(?:title|p:\d+|end)$/)?.[1];
export const paraIndexOf = (key: string) => { const m = key.match(/:p:(\d+)$/); return m ? Number(m[1]) : undefined; };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 100) / 100;

export const STEP = { shift: 0.5, space: 0.5, scale: 0.1 };
export const LIMITS = { shift: [-12, 12], space: [0, 12], scale: [0.6, 2.4] } as const;

/** One change to a block: set fields, add to numeric fields, or clear it. */
export interface BlockOp {
  set?: Partial<BlockStyle>;
  add?: { shift?: number; spaceBefore?: number; spaceAfter?: number; scale?: number };
  reset?: boolean;
}

function tidy(bs: BlockStyle): BlockStyle | undefined {
  const out: BlockStyle = {};
  for (const [k, v] of Object.entries(bs) as [keyof BlockStyle, BlockStyle[keyof BlockStyle]][]) {
    if (v === undefined || v === null) continue;
    if ((k === 'shift' || k === 'spaceBefore' || k === 'spaceAfter') && v === 0) continue;
    if (k === 'scale' && v === 1) continue;
    if ((k === 'breakBefore' || k === 'blankAfter') && v === false) continue;
    if (k === 'recto' && v === true) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The block's own stored style (not merged with "all chapter headings"). */
export const ownStyle = (spec: FormatSpec, key: string): BlockStyle => spec.layout?.blocks?.[key] ?? {};
/** What the block looks like on the page (merged). */
export const shownStyle = (spec: FormatSpec, key: string): BlockStyle => blockStyleOf(spec, key) ?? {};

export function applyBlock(spec: FormatSpec, key: string, op: BlockOp): FormatSpec {
  const blocks = { ...(spec.layout?.blocks ?? {}) };
  if (op.reset) {
    delete blocks[key];
  } else {
    const shown = shownStyle(spec, key);
    const next: BlockStyle = { ...(blocks[key] ?? {}), ...(op.set ?? {}) };
    const a = op.add ?? {};
    if (a.shift) next.shift = round(clamp((shown.shift ?? 0) + a.shift, LIMITS.shift[0], LIMITS.shift[1]));
    if (a.spaceBefore) next.spaceBefore = round(clamp((shown.spaceBefore ?? 0) + a.spaceBefore, LIMITS.space[0], LIMITS.space[1]));
    if (a.spaceAfter) next.spaceAfter = round(clamp((shown.spaceAfter ?? 0) + a.spaceAfter, LIMITS.space[0], LIMITS.space[1]));
    if (a.scale) next.scale = round(clamp((shown.scale ?? 1) + a.scale, LIMITS.scale[0], LIMITS.scale[1]));
    // Paragraphs flow: "move down" means more space above.
    if (kindOf(key) === 'para' && next.shift) {
      next.spaceBefore = round(clamp((next.spaceBefore ?? 0) + next.shift, LIMITS.space[0], LIMITS.space[1]));
      delete next.shift;
    }
    const t = tidy(next);
    if (t) blocks[key] = t; else delete blocks[key];
  }
  return withLayout(spec, { ...spec.layout, blocks });
}

export interface CoverOp { set?: CoverLayout; addScale?: number; reset?: boolean }

export function applyCover(spec: FormatSpec, op: CoverOp): FormatSpec {
  if (op.reset) return withLayout(spec, { ...spec.layout, cover: undefined });
  const cur = spec.layout?.cover ?? {};
  const next: CoverLayout = { ...cur, ...(op.set ?? {}) };
  if (op.addScale) next.scale = round(clamp((cur.scale ?? 1) + op.addScale, 0.6, 1.6));
  if (next.scale === 1) delete next.scale;
  return withLayout(spec, { ...spec.layout, cover: Object.keys(next).length ? next : undefined });
}

function withLayout(spec: FormatSpec, layout: FormatSpec['layout']): FormatSpec {
  const blocks = layout?.blocks && Object.keys(layout.blocks).length ? layout.blocks : undefined;
  const cover = layout?.cover && Object.keys(layout.cover).length ? layout.cover : undefined;
  const next = { ...spec };
  if (!blocks && !cover) delete next.layout;
  else next.layout = { ...(blocks ? { blocks } : {}), ...(cover ? { cover } : {}) };
  return next;
}

/** Number of design changes the author has made. */
export const changeCount = (spec: FormatSpec) => Object.keys(spec.layout?.blocks ?? {}).length + (spec.layout?.cover ? 1 : 0);

export const resetAll = (spec: FormatSpec): FormatSpec => withLayout(spec, undefined);

/** A readable name for a block key, for chips, selects and the toolbar. */
export function blockName(key: string, t: (k: string, v?: Record<string, string | number>) => string, chapterNo: (id: string) => number | undefined): string {
  const id = chapterIdOf(key);
  const n = id ? chapterNo(id) ?? '?' : '?';
  if (key === 'all:chtitle') return t('design.block.allHeadings');
  if (/^ch:.+:title$/.test(key)) return t('design.block.heading', { n });
  if (/^ch:.+:end$/.test(key)) return t('design.block.end', { n });
  const pi = paraIndexOf(key);
  if (pi != null) return t('design.block.para', { n, p: pi + 1 });
  return t(`design.block.${key.replace(':', '_')}`);
}
