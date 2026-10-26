/**
 * Preview variants: what the author can ask to see (SIZES × STYLES), and the kept previews
 * themselves (the "store"), saved as 'edition' entities so they persist and can be revisited.
 *
 * Entity 'edition': name = label. fields:
 *   n, size (SizeId), style (StyleId), format (FormatSpec JSON, incl. layout), cover (CoverSpec JSON or ''),
 *   chapters (JSON [{id,title,content}]), words, pages, trim, print (fingerprint of what was laid out),
 *   batch (one "Make previews" run), exports (JSON [{kind,at}]).
 * Older editions (kept versions from before) have no size/style: they read as size = trim, style = 'custom'.
 */
import type { Book, Chapter, Entity, FormatSpec } from '@/data/types';
import { bookIsDeva, resolveFormat } from '@/lib/paginate';
import { snapshotOf, type SnapChapter, type Snapshot } from './editions';

export type SizeId = '5x8' | '5.5x8.5' | '6x9' | 'a5' | 'ebook';
export type StyleId = 'classic' | 'elegant' | 'modern' | 'large' | 'mine' | 'custom';

export const SIZE_IDS: SizeId[] = ['5x8', '5.5x8.5', '6x9', 'a5', 'ebook'];
export const STYLE_IDS: StyleId[] = ['classic', 'elegant', 'modern', 'large', 'mine'];

/** Trim drawn in the chooser (inches). */
export const SIZE_SHAPE: Record<SizeId, { w: number; h: number }> = {
  '5x8': { w: 5, h: 8 }, '5.5x8.5': { w: 5.5, h: 8.5 }, '6x9': { w: 6, h: 9 }, a5: { w: 5.83, h: 8.27 }, ebook: { w: 4.2, h: 6.6 },
};

/** The parts of a spec a style decides. Everything else (details, blank pages, design changes) is the book's own. */
const STYLE_KEYS = ['face', 'headFace', 'size', 'pt', 'margins', 'opening'] as const;
const SIZE_KEYS = ['trim', 'ebook'] as const;
type Patch = Partial<Pick<FormatSpec, typeof STYLE_KEYS[number]>>;

export function stylePatch(style: StyleId, deva: boolean, mine: FormatSpec): Patch {
  const body: FormatSpec['face'] = deva ? 'tiro' : 'literata';
  switch (style) {
    case 'classic': return { face: body, size: 'm', margins: 'standard', opening: deva ? 'sunk' : 'drop' };
    case 'elegant': return { face: deva ? 'tiro' : 'garamond', size: 'm', margins: 'generous', opening: 'ornament' };
    case 'modern': return { face: body, headFace: deva ? 'tiro' : 'fraunces', size: 'm', margins: 'standard', opening: 'sunk' };
    case 'large': return { face: body, size: 'l', pt: deva ? 15 : 15.5, margins: 'generous', opening: 'sunk' };
    default: return pick(mine, STYLE_KEYS);
  }
}

function pick<K extends keyof FormatSpec>(s: FormatSpec, keys: readonly K[]): Pick<FormatSpec, K> {
  const out = {} as Pick<FormatSpec, K>;
  for (const k of keys) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

function without(s: FormatSpec, keys: readonly (keyof FormatSpec)[]): FormatSpec {
  const out = { ...s };
  for (const k of keys) delete out[k];
  return out;
}

/** The spec for one size × style, on top of the book's own settings and design changes. */
export function specFor(size: SizeId, style: StyleId, book: Book): FormatSpec {
  const base = resolveFormat(book);
  const s: FormatSpec = { ...without(base, [...STYLE_KEYS, ...SIZE_KEYS]), trim: base.trim, ...stylePatch(style, bookIsDeva(book), base) } as FormatSpec;
  return withSize(s, size);
}

function withSize(s: FormatSpec, size: SizeId): FormatSpec {
  if (size === 'ebook') return { ...s, ebook: true, headers: false, halfTitle: false, trim: s.trim ?? '5.5x8.5' };
  const out = { ...s, trim: size };
  delete out.ebook;
  return out;
}

/**
 * A kept preview, laid out again with the book as it is now: same size and style, but the book's current
 * details and design changes. This is what a fresh preview would make.
 */
export function liveSpecOf(v: Variant, book: Book): FormatSpec {
  const base = resolveFormat(book);
  const s = { ...without(base, [...STYLE_KEYS, ...SIZE_KEYS]), ...pick(v.spec, [...STYLE_KEYS, ...SIZE_KEYS]) } as FormatSpec;
  return v.spec.ebook ? withSize(s, 'ebook') : s;
}

/** JSON with sorted keys, so two equal specs always compare equal. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function hash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b1;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519) >>> 0; }
  return h1.toString(36) + h2.toString(36);
}

export const snapChaptersOf = (chapters: Chapter[]): SnapChapter[] =>
  [...chapters].sort((a, b) => a.order - b.order).map((c) => ({ id: c.id, title: c.title, content: c.content }));

/** A fingerprint of the words and cover a preview was made from. */
export function textPrint(chapters: SnapChapter[], book: Pick<Book, 'title' | 'subtitle' | 'author' | 'cover'>): string {
  return hash(stable([book.title, book.subtitle ?? '', book.author, book.cover ?? null, chapters.map((c) => [c.id, c.title, c.content])]));
}
export const specPrint = (spec: FormatSpec) => hash(stable(spec));

export interface ExportRecord { kind: 'pdf' | 'epub'; at: string }

export interface Variant extends Snapshot {
  size: SizeId;
  style: StyleId;
  /** Fingerprint of the words and cover laid out (see textPrint). */
  text: string;
  batch?: string;
  exports: ExportRecord[];
}

function json<T>(s: string | undefined): T | undefined {
  if (!s) return undefined;
  try { return JSON.parse(s) as T; } catch { return undefined; }
}

export function variantOf(e: Entity, book: Pick<Book, 'title' | 'subtitle' | 'author' | 'cover'>): Variant | undefined {
  const s = snapshotOf(e);
  if (!s) return undefined;
  const size = (e.fields.size as SizeId) || (s.spec.ebook ? 'ebook' : s.spec.trim);
  const style = (e.fields.style as StyleId) || 'custom';
  const text = e.fields.print || textPrint(s.chapters, { ...book, cover: s.cover ?? book.cover });
  return { ...s, size, style, text, batch: e.fields.batch || undefined, exports: json<ExportRecord[]>(e.fields.exports) ?? [] };
}

/** What changed in the book since this preview was made (empty = it's up to date). */
export interface Staleness { layout: boolean; text: boolean }
export function stalenessOf(v: Variant, book: Book, chapters: Chapter[]): Staleness {
  const layout = specPrint(liveSpecOf(v, book)) !== specPrint(v.spec);
  const text = textPrint(snapChaptersOf(chapters), book) !== v.text;
  return { layout, text };
}
export const isStale = (s: Staleness) => s.layout || s.text;

/** A request for one preview: a cell of the matrix. */
export interface Combo { size: SizeId; style: StyleId; key: string }
export const comboKey = (size: SizeId, style: StyleId) => `${size}|${style}`;
