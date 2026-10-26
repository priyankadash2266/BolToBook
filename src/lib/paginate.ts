/**
 * Print pagination. Flows the author's real manuscript into fixed-size page boxes by
 * measuring with the exact CSS the preview and the print file use (one renderer, three
 * consumers: the measuring container, the Format preview, and the print window), so what
 * the author sees is what prints, page for page.
 *
 * Units: CSS px at 96 per inch. Pages are laid out at real size; the preview scales them
 * with a transform, which doesn't affect layout.
 */
import type { BlockStyle, Book, BookLang, Chapter, FormatSpec } from '@/data/types';
import { isDevanagari, toParagraphs, usesDevanagari } from './text';
import { parseBlock, runsHtml, type Align, type Run } from './markdown';

export const PX_PER_IN = 96;

export const TRIMS: Record<FormatSpec['trim'], { w: number; h: number; label: string }> = {
  '5x8': { w: 5, h: 8, label: '5 × 8 in' },
  '5.5x8.5': { w: 5.5, h: 8.5, label: '5.5 × 8.5 in' },
  '6x9': { w: 6, h: 9, label: '6 × 9 in' },
  a5: { w: 5.83, h: 8.27, label: 'A5 (148 × 210 mm)' },
};

export const FACES: Record<FormatSpec['face'], { family: string; label: string; families: string[] }> = {
  literata: { family: "'Literata', 'Tiro Devanagari Hindi', Georgia, serif", label: 'Literata', families: ['Literata', 'Tiro Devanagari Hindi'] },
  garamond: { family: "'EB Garamond', 'Tiro Devanagari Hindi', Garamond, serif", label: 'EB Garamond', families: ['EB Garamond', 'Tiro Devanagari Hindi'] },
  fraunces: { family: "'Fraunces', 'Tiro Devanagari Hindi', Georgia, serif", label: 'Fraunces', families: ['Fraunces', 'Tiro Devanagari Hindi'] },
  tiro: { family: "'Tiro Devanagari Hindi', 'Literata', serif", label: 'Tiro Devanagari', families: ['Tiro Devanagari Hindi', 'Literata'] },
};

/** The reading screen an eBook preview is laid out on (inches at 96 px): a typical phone/e-reader page. */
export const EBOOK_PAGE = { w: 4.2, h: 6.6, margin: 0.38 };

/** Body text size in points. */
export const SIZES: Record<FormatSpec['size'], number> = { s: 10, m: 11, l: 12.5 };

/** Margins in inches. Inner = gutter (binding side). */
export const MARGINS: Record<FormatSpec['margins'], { top: number; bottom: number; inner: number; outer: number }> = {
  tight: { top: 0.6, bottom: 0.65, inner: 0.7, outer: 0.5 },
  standard: { top: 0.75, bottom: 0.8, inner: 0.85, outer: 0.6 },
  generous: { top: 0.9, bottom: 0.95, inner: 1.0, outer: 0.75 },
};

/** Paper thickness per page for cream/white book paper (inches). */
export const SPINE_PER_PAGE = 0.0025;

export function bookIsDeva(book: Pick<Book, 'lang' | 'title'>): boolean {
  return usesDevanagari(book.lang) || isDevanagari(book.title);
}

export function defaultFormat(book: Pick<Book, 'lang' | 'title' | 'country'>): FormatSpec {
  const deva = bookIsDeva(book);
  return {
    trim: book.country === 'GB' ? 'a5' : '5.5x8.5',
    face: deva ? 'tiro' : 'literata',
    size: 'm',
    margins: 'standard',
    opening: deva ? 'sunk' : 'drop',
    headers: true,
    pageNumbers: 'outer',
    paragraphs: 'indent',
    includeContents: true,
  };
}

export const resolveFormat = (book: Book): FormatSpec => ({ ...defaultFormat(book), ...(book.format ?? {}) });

/** Strings printed inside the book, in the book's language (built by the caller). */
export interface PrintLabels {
  /** "Chapter {n}" */
  chapter: string;
  /** Spell chapter numbers as words (English only). */
  numberWords: boolean;
  contents: string;
  about: string;
  copyright: string;
  rights: string;
  published?: string;
  typeset: string;
}

export type PageKind = 'half' | 'title' | 'copyright' | 'dedication' | 'contents' | 'blank' | 'open' | 'text' | 'about';

export interface Page {
  kind: PageKind;
  side: 'left' | 'right';
  /** Printed page number (body pages only). */
  folio?: number;
  header: boolean;
  /** Inner HTML of the text block. */
  body: string;
  chapterId?: string;
}

export interface Geometry {
  pageW: number; pageH: number;
  top: number; bottom: number; inner: number; outer: number;
  contentW: number; contentH: number;
  fontPx: number; lineH: number; deva: boolean;
}

export interface PaginateResult {
  pages: Page[];
  /** Total printed pages (always even). */
  total: number;
  spineIn: number;
  done: boolean;
  /** 0–1 */
  progress: number;
  /** Page index where each chapter opens. */
  chapterStart: Record<string, number>;
  /** Index of the first body page (chapter 1 opening). */
  bodyStart: number;
  geometry: Geometry;
}

// ---------- helpers ----------

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numberWord(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  return String(n);
}
export function chapterLabel(labels: PrintLabels, n: number): string {
  const num = labels.numberWords && n < 100 ? numberWord(n).replace(/^./, (c) => c.toUpperCase()) : String(n);
  return labels.chapter.split('{n}').join(num);
}

export const isSceneBreak = (p: string) => /^\s*(?:(?:\*\s*){1,3}|#|~|—|-{3}|⁂)\s*$/.test(p);

const langOf = (book: Pick<Book, 'lang'>): string => (book.lang === 'mix' ? 'hi' : book.lang);
export const htmlLang = (lang: BookLang) => (lang === 'mix' ? 'hi' : lang);

export function geometry(spec: FormatSpec, deva: boolean): Geometry {
  const t = spec.ebook ? EBOOK_PAGE : TRIMS[spec.trim] ?? TRIMS['5.5x8.5'];
  const m = spec.ebook
    ? { top: EBOOK_PAGE.margin, bottom: EBOOK_PAGE.margin, inner: EBOOK_PAGE.margin, outer: EBOOK_PAGE.margin }
    : MARGINS[spec.margins] ?? MARGINS.standard;
  const pageW = Math.round(t.w * PX_PER_IN), pageH = Math.round(t.h * PX_PER_IN);
  const top = Math.round(m.top * PX_PER_IN), bottom = Math.round(m.bottom * PX_PER_IN);
  const inner = Math.round(m.inner * PX_PER_IN), outer = Math.round(m.outer * PX_PER_IN);
  const fontPx = +((((spec.pt ?? SIZES[spec.size] ?? 11) + (deva ? 0.5 : 0)) * PX_PER_IN) / 72).toFixed(2);
  const lineH = Math.round(fontPx * (deva ? 1.72 : 1.42));
  const contentW = pageW - inner - outer;
  // Snap the text block to whole lines so pages end on the baseline grid.
  const contentH = Math.floor((pageH - top - bottom) / lineH) * lineH;
  return { pageW, pageH, top, bottom, inner, outer, contentW, contentH, fontPx, lineH, deva };
}

/**
 * The book's CSS. Scoped under `.fx-root`. Colours are print colours (ink on paper),
 * not interface tokens, because the same CSS goes into the print file.
 */
export function bookCss(spec: FormatSpec, g: Geometry, scope = '.fx-root'): string {
  return scopeCss(rawCss(spec, g), scope);
}

/** Prefixes every rule so several layouts (preview, measurer, print) never clash. */
function scopeCss(css: string, scope: string): string {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel: string, body: string) => {
    const s = sel.trim().split(',').map((x) => x.trim()).filter(Boolean)
      .map((x) => (x === '.fx-root' ? scope : `${scope} ${x}`)).join(',');
    return `${s}{${body}}\n`;
  });
}

/** Space above a chapter heading on its opening page. */
export const sinkOf = (spec: FormatSpec, g: Geometry) =>
  spec.opening === 'sunk' ? Math.round(g.contentH * 0.3) : spec.opening === 'ornament' ? Math.round(g.contentH * 0.16) : Math.round(g.contentH * 0.12);

// ---------- the author's design changes ----------

/** The style for one block, with "all chapter headings" merged under a single chapter's own. */
export function blockStyleOf(spec: Pick<FormatSpec, 'layout'>, key: string): BlockStyle | undefined {
  const blocks = spec.layout?.blocks;
  if (!blocks) return undefined;
  const own = blocks[key];
  const all = /^ch:.+:title$/.test(key) ? blocks['all:chtitle'] : undefined;
  if (!own && !all) return undefined;
  return { ...all, ...own };
}

/**
 * Inline CSS for a block. `mt`/`mb` add the space before/after (flowing blocks), `shift`
 * nudges a fixed block without moving anything else, `flex` aligns an item of a centred column.
 */
export function blockCss(bs: BlockStyle | undefined, lh: number, o: { mt?: boolean; mb?: boolean; shift?: boolean; flex?: boolean } = {}): string {
  if (!bs) return '';
  const out: string[] = [];
  if (bs.align) {
    out.push(`text-align:${bs.align}`);
    if (o.flex) out.push(`align-self:${bs.align === 'left' ? 'flex-start' : bs.align === 'right' ? 'flex-end' : 'center'}`);
  }
  if (bs.scale && bs.scale !== 1) out.push(`--s:${+bs.scale.toFixed(2)}`);
  if (bs.italic != null) out.push(`font-style:${bs.italic ? 'italic' : 'normal'}`);
  if (o.mt && bs.spaceBefore) out.push(`margin-top:${Math.round(bs.spaceBefore * lh)}px`);
  if (o.mb && bs.spaceAfter) out.push(`margin-bottom:${Math.round(bs.spaceAfter * lh)}px`);
  if (o.shift && bs.shift) out.push(`transform:translateY(${Math.round(bs.shift * lh)}px)`);
  return out.join(';');
}

const styleAttr = (css: string) => (css ? ` style="${css}"` : '');
const keyAttr = (k: string) => ` data-k="${esc(k)}"`;
/** data-k + style for a fixed block (title page, copyright, running head…). */
const fixedAttrs = (spec: FormatSpec, key: string, lh: number, flex = false) => keyAttr(key) + styleAttr(blockCss(blockStyleOf(spec, key), lh, { shift: true, flex }));

function rawCss(spec: FormatSpec, g: Geometry): string {
  const face = (FACES[spec.face] ?? FACES.literata).family;
  const head = spec.headFace && spec.headFace !== spec.face ? `font-family:${FACES[spec.headFace].family};` : '';
  const lh = g.lineH;
  const sink = sinkOf(spec, g);
  const dc = lh * 3 - Math.round(g.fontPx * 0.25);
  return `
.fx-root{font-family:${face};color:#1d1d1b;font-size:${g.fontPx}px;line-height:${lh}px;font-kerning:normal;font-variant-ligatures:common-ligatures;-webkit-font-smoothing:antialiased}
.fx-page{position:relative;width:${g.pageW}px;height:${g.pageH}px;background:#FBF8F1;overflow:hidden;box-sizing:border-box}
.fx-body{position:absolute;top:${g.top}px;height:${g.contentH}px;width:${g.contentW}px}
.fx-left .fx-body{left:${g.outer}px}
.fx-right .fx-body{left:${g.inner}px}
.fx-flow{display:flow-root}
.fx-p{margin:0;font-size:calc(${g.fontPx}px * var(--s,1));line-height:calc(${lh}px * var(--s,1));text-align:justify;text-indent:${spec.paragraphs === 'indent' ? '1.3em' : '0'};hyphens:auto;-webkit-hyphens:auto;orphans:1;widows:1}
.fx-p:lang(hi),.fx-p:lang(mr){hyphens:manual;-webkit-hyphens:manual}
.fx-p.fx-noind{text-indent:0}
.fx-p.fx-split{text-align-last:justify}
.fx-p.fx-gap{margin-top:${Math.round(lh * 0.6)}px}
.fx-brk{height:${lh * 2}px;line-height:${lh * 2}px;text-align:center;letter-spacing:.4em;color:#8A8173;font-size:${Math.round(g.fontPx * 1.15)}px}
.fx-h2{${head}margin:0;padding:${lh}px 0 ${Math.round(lh / 2)}px;font-size:calc(${(g.fontPx * 1.3).toFixed(2)}px * var(--s,1));line-height:${Math.round(lh * 1.5) / 1}px;font-weight:500;color:#141a18;text-wrap:balance;break-after:avoid}
.fx-h3{${head}margin:0;padding:${Math.round(lh / 2)}px 0 0;font-size:calc(${(g.fontPx * 1.08).toFixed(2)}px * var(--s,1));line-height:${lh}px;font-style:italic;font-weight:400;color:#2a2a27;text-wrap:balance;break-after:avoid}
.fx-q{margin:${Math.round(lh / 2)}px 1.6em;font-size:calc(${(g.fontPx * 0.94).toFixed(2)}px * var(--s,1));color:#33332f}
.fx-q+.fx-q{margin-top:0}
.fx-li{position:relative;padding-left:1.7em}
.fx-li.fx-li2{padding-left:3.2em}
.fx-li[data-m]::before{content:attr(data-m);position:absolute;left:0;width:1.25em;text-align:right;text-indent:0;color:#6b6458;font-variant-numeric:oldstyle-nums}
.fx-li2[data-m]::before{left:1.5em}
.fx-li.fx-lfirst{margin-top:${Math.round(lh / 2)}px}
.fx-li.fx-llast{margin-bottom:${Math.round(lh / 2)}px}
mark{background:#f3e6bf;color:inherit;padding:0 .05em}
u{text-decoration-thickness:1px;text-underline-offset:.15em}
strong{font-weight:650}
.fx-dc{float:left;font-size:${Math.round(dc * 1.02)}px;line-height:${dc}px;height:${dc}px;margin:${Math.round(g.fontPx * 0.12)}px ${Math.round(g.fontPx * 0.18)}px 0 0;color:#183C39;font-weight:400}
.fx-sc{font-variant:small-caps;letter-spacing:.04em}
.fx-chead{padding-top:${sink}px;padding-bottom:${lh * 2}px;text-align:${spec.opening === 'sunk' ? 'left' : 'center'}}
.fx-orn{font-size:calc(${Math.round(g.fontPx * 1.6)}px * var(--s,1));line-height:${lh * 2}px;color:#8A8173}
.fx-clabel{font-size:calc(${(g.fontPx * 0.72).toFixed(2)}px * var(--s,1));letter-spacing:.24em;text-transform:uppercase;color:#7a7266;line-height:${lh}px}
.fx-clabel:lang(hi),.fx-clabel:lang(mr){letter-spacing:.02em;font-size:calc(${(g.fontPx * 0.9).toFixed(2)}px * var(--s,1))}
.fx-ctitle{${head}font-size:calc(${(g.fontPx * 2).toFixed(2)}px * var(--s,1));line-height:1.2;margin-top:${Math.round(lh * 0.5)}px;color:#141a18;text-wrap:balance}
.fx-head{position:absolute;top:${Math.round(g.top * 0.42)}px;width:${g.contentW}px;text-align:center;font-size:calc(${(g.fontPx * 0.66).toFixed(2)}px * var(--s,1));letter-spacing:.16em;text-transform:uppercase;color:#7a7266;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-left .fx-head{left:${g.outer}px}.fx-right .fx-head{left:${g.inner}px}
.fx-folio{position:absolute;bottom:${Math.round(g.bottom * 0.42)}px;width:${g.contentW}px;font-size:calc(${(g.fontPx * 0.78).toFixed(2)}px * var(--s,1));line-height:1;color:#4a4740;text-align:${spec.pageNumbers === 'center' ? 'center' : 'left'}}
.fx-left .fx-folio{left:${g.outer}px}
.fx-right .fx-folio{left:${g.inner}px;${spec.pageNumbers === 'outer' ? 'text-align:right' : ''}}
.fx-k-half .fx-flow,.fx-k-title .fx-flow,.fx-k-copyright .fx-flow,.fx-k-dedication .fx-flow{height:${g.contentH}px}
.fx-ht{height:100%;display:flex;flex-direction:column;align-items:center;text-align:center}
.fx-ht-title{${head}margin-top:30%;font-size:calc(${(g.fontPx * 1.45).toFixed(2)}px * var(--s,1));line-height:1.25;letter-spacing:.05em;text-wrap:balance}
.fx-tp{height:100%;display:flex;flex-direction:column;align-items:center;text-align:center}
.fx-tp-title{${head}margin-top:22%;font-size:calc(${(g.fontPx * 2.6).toFixed(2)}px * var(--s,1));line-height:1.15;text-wrap:balance}
.fx-tp-sub{margin-top:${lh}px;font-style:italic;font-size:calc(${(g.fontPx * 1.15).toFixed(2)}px * var(--s,1));color:#4a4740}
.fx-tp-author{margin-top:auto;margin-bottom:12%;font-size:calc(${(g.fontPx * 1.1).toFixed(2)}px * var(--s,1));letter-spacing:.18em;text-transform:uppercase}
.fx-tp-author:lang(hi),.fx-tp-author:lang(mr){letter-spacing:.02em}
.fx-cp{height:100%;display:flex;flex-direction:column;justify-content:flex-end;font-size:calc(${(g.fontPx * 0.78).toFixed(2)}px * var(--s,1));line-height:1.6;color:#4a4740}
.fx-cp p{margin:0 0 .6em}
.fx-ded{font-size:calc(${g.fontPx}px * var(--s,1));height:100%;display:flex;align-items:flex-start;justify-content:center;text-align:center;font-style:italic;padding-top:28%;box-sizing:border-box;white-space:pre-line;color:#3b3a35}
.fx-toc-h{${head}font-size:calc(${(g.fontPx * 1.5).toFixed(2)}px * var(--s,1));line-height:${lh * 2}px;text-align:center;padding:${lh * 2}px 0 ${lh}px}
.fx-toc{display:flex;align-items:baseline;gap:.5em}
.fx-toc-t{min-width:0}
.fx-toc-d{flex:1;border-bottom:1px dotted #b9b09e;transform:translateY(-.3em);min-width:1em}
.fx-toc-n{font-variant-numeric:tabular-nums}
.fx-about-h{${head}font-size:calc(${(g.fontPx * 1.35).toFixed(2)}px * var(--s,1));line-height:${lh * 2}px;text-align:center;padding:${lh * 3}px 0 ${lh}px}
`;
}

/** A block's text: formatted runs and the same words as plain text (offsets match). */
interface Rich { runs: Run[]; plain: string }
const richOf = (runs: Run[]): Rich => ({ runs, plain: runs.map((r) => r.text).join('') });
const plainRich = (text: string): Rich => ({ runs: [{ text, marks: [] }], plain: text });

/**
 * HTML for plain range [from, to) of a block. When `first`, the opening words are set in small caps
 * (and the first letter as a drop cap when `drop`), but only for the piece that starts the block.
 */
function richHtml(r: Rich, from: number, to: number, o: { first?: boolean; drop?: boolean; deva: boolean }): string {
  const body = (a: number, z: number) => runsHtml(r.runs, a, z);
  if (!o.first || from > 0 || o.deva || isDevanagari(r.plain.slice(0, 40))) return body(from, to);
  let pos = from;
  let out = '';
  if (o.drop) {
    const m = r.plain.slice(pos, to).match(/^(["“'‘]?[A-Za-z0-9])/);
    if (m) { out += `<span class="fx-dc">${body(pos, pos + m[1].length)}</span>`; pos += m[1].length; }
  }
  const words = r.plain.slice(pos, to).match(/^(\S*(?:[ \t]+\S+){0,2})/);
  if (words && words[1]) {
    out += `<span class="fx-sc">${body(pos, pos + words[1].length)}</span>`;
    pos += words[1].length;
  }
  return out + body(pos, to);
}

function pClass(o: { noind?: boolean; split?: boolean; gap?: boolean; extra?: string }) {
  return ['fx-p', o.extra ?? '', o.noind ? 'fx-noind' : '', o.split ? 'fx-split' : '', o.gap ? 'fx-gap' : ''].filter(Boolean).join(' ');
}

function pTag(cls: string, lang: string | null, attrs: string, inner: string) {
  return `<p class="${cls}"${lang ? ` lang="${lang}"` : ''}${attrs}>${inner}</p>`;
}

export interface RenderCtx { book: Pick<Book, 'title' | 'author' | 'lang'>; spec: FormatSpec }

/** One page as HTML (the same markup the preview and the print window show). */
export function renderPage(page: Page, ctx: RenderCtx): string {
  const lh = geometry(ctx.spec, bookIsDeva(ctx.book)).lineH;
  const head = page.header && ctx.spec.headers && !ctx.spec.ebook
    ? `<div class="fx-head"${fixedAttrs(ctx.spec, 'run:head', lh)}>${esc(page.side === 'left' ? ctx.book.author : ctx.book.title)}</div>`
    : '';
  const folio = page.folio != null && page.kind !== 'blank' && !ctx.spec.ebook ? `<div class="fx-folio"${fixedAttrs(ctx.spec, 'run:folio', lh)}>${page.folio}</div>` : '';
  return `<div class="fx-page fx-${page.side} fx-k-${page.kind}">${head}<div class="fx-body"><div class="fx-flow">${page.body}</div></div>${folio}</div>`;
}

// ---------- measuring ----------

let measurerSeq = 0;
class Measurer {
  host: HTMLDivElement;
  flow: HTMLDivElement;
  constructor(spec: FormatSpec, g: Geometry, lang: string) {
    const scope = `fx-m${++measurerSeq}`;
    const css = bookCss(spec, g, '.' + scope);
    this.host = document.createElement('div');
    this.host.setAttribute('aria-hidden', 'true');
    this.host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:layout style;';
    this.host.innerHTML = `<style>${css}</style><div class="${scope}" lang="${lang}"><div class="fx-page fx-right fx-k-text"><div class="fx-body"><div class="fx-flow"></div></div></div></div>`;
    document.body.appendChild(this.host);
    this.flow = this.host.querySelector('.fx-flow') as HTMLDivElement;
  }
  height() { return this.flow.getBoundingClientRect().height; }
  clear() { this.flow.innerHTML = ''; }
  append(html: string): HTMLElement {
    const t = document.createElement('template');
    t.innerHTML = html;
    const el = t.content.firstElementChild as HTMLElement;
    this.flow.appendChild(el);
    return el;
  }
  html() { return this.flow.innerHTML; }
  destroy() { this.host.remove(); }
}

const yieldNow = () =>
  new Promise<void>((r) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => r(), { timeout: 40 });
    else setTimeout(r, 0);
  });

async function fontsReady(spec: FormatSpec, g: Geometry, sample: string) {
  if (!document.fonts) return;
  const fams = [FACES[spec.face] ?? FACES.literata, ...(spec.headFace ? [FACES[spec.headFace]] : [])].map((f) => f.families.map((x) => `'${x}'`).join(', '));
  try {
    await Promise.all(fams.flatMap((fam) => [
      document.fonts.load(`${g.fontPx}px ${fam}`, sample),
      document.fonts.load(`italic ${g.fontPx}px ${fam}`, sample),
    ]));
    await document.fonts.ready;
  } catch { /* measure with whatever is loaded */ }
}

// ---------- cache ----------

const cache = new Map<string, PaginateResult>();
export function paginateKey(book: Book, chapters: Chapter[], spec: FormatSpec, labels: PrintLabels) {
  return JSON.stringify([
    book.id, book.title, book.subtitle, book.author, book.lang, book.country, spec, labels,
    chapters.map((c) => [c.id, c.order, c.updatedAt, c.title, c.content.length]),
  ]);
}
export const cachedPagination = (key: string) => cache.get(key);

/** Every face a spec prints with (body + headings), for loading fonts. */
export const familiesOf = (spec: FormatSpec): string[] =>
  [...new Set([...(FACES[spec.face] ?? FACES.literata).families, ...(spec.headFace ? FACES[spec.headFace].families : [])])];

/** Fast estimate used before (or instead of) real pagination. */
export function estimatePages(words: number, spec: FormatSpec, chapters = 1): number {
  const g = geometry(spec, spec.face === 'tiro');
  const lines = g.contentH / g.lineH;
  const charsPerLine = g.contentW / (g.fontPx * 0.47);
  const wordsPerPage = (lines * charsPerLine) / 6;
  const body = Math.ceil(words / wordsPerPage) + chapters;
  const n = body + 6;
  return n + (n % 2);
}

// ---------- the paginator ----------

export interface PaginateInput {
  book: Book;
  chapters: Chapter[];
  spec: FormatSpec;
  labels: PrintLabels;
}

/**
 * Lays out the whole book. Works in time slices so the page never freezes,
 * calling `onProgress` with what's laid out so far. Results are memoised.
 */
export async function paginate(
  input: PaginateInput,
  opts: { onProgress?: (r: PaginateResult) => void; signal?: AbortSignal } = {},
): Promise<PaginateResult> {
  const { book, spec, labels } = input;
  const key = paginateKey(book, input.chapters, spec, labels);
  const hit = cache.get(key);
  if (hit) { opts.onProgress?.(hit); return hit; }

  const chapters = [...input.chapters].sort((a, b) => a.order - b.order);
  const deva = bookIsDeva(book);
  const g = geometry(spec, deva);
  const rootLang = langOf(book);
  const sample = (book.title + ' ' + chapters.slice(0, 2).map((c) => c.content.slice(0, 400)).join(' ')).slice(0, 800) || 'Aa';
  await fontsReady(spec, g, sample);
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');

  const m = new Measurer(spec, g, rootLang);
  try {
    return await layout();
  } finally {
    m.destroy();
  }

  async function layout(): Promise<PaginateResult> {
  const limit = g.contentH + 0.5;
  const totalChars = chapters.reduce((s, c) => s + c.content.length, 0) + (spec.aboutAuthor?.length ?? 0) + 1;
  let doneChars = 0;

  // Front matter.
  const front: Page[] = [];
  const sideAt = (i: number): 'left' | 'right' => (i % 2 === 0 ? 'right' : 'left');
  const pushFront = (kind: PageKind, body: string) => front.push({ kind, side: sideAt(front.length), header: false, body });
  const lh = g.lineH;
  const fa = (key: string, flex = false) => fixedAttrs(spec, key, lh, flex);
  const blankAfter = (key: string) => { if (blockStyleOf(spec, key)?.blankAfter) pushFront('blank', ''); };
  const ebook = !!spec.ebook;
  if (spec.halfTitle !== false && !ebook) {
    pushFront('half', `<div class="fx-ht"><div class="fx-ht-title"${fa('half:title', true)}>${esc(book.title || ' ')}</div></div>`);
    pushFront('blank', '');
    blankAfter('half:title');
  }
  pushFront('title', `<div class="fx-tp"><div class="fx-tp-title"${fa('title:main', true)}>${esc(book.title || ' ')}</div>${book.subtitle ? `<div class="fx-tp-sub"${fa('title:sub', true)}>${esc(book.subtitle)}</div>` : ''}<div class="fx-tp-author"${fa('title:author', true)}>${esc(book.author)}</div></div>`);
  blankAfter('title:main');
  pushFront('copyright', `<div class="fx-cp"${fa('copyright')}><p>${esc(labels.copyright)}</p><p>${esc(labels.rights)}</p>${labels.published ? `<p>${esc(labels.published)}</p>` : ''}<p>${esc(labels.typeset)}</p></div>`);
  blankAfter('copyright');
  if (spec.dedication?.trim()) {
    pushFront('dedication', `<div class="fx-ded"${fa('dedication')}>${esc(spec.dedication.trim())}</div>`);
    if (!ebook) pushFront('blank', '');
    blankAfter('dedication');
  }

  // Contents: measure rows to know how many pages it takes (page numbers filled in later).
  const tocRows = chapters.map((c, i) => ({ id: c.id, title: c.title.trim() || chapterLabel(labels, i + 1) }));
  if (spec.aboutAuthor?.trim()) tocRows.push({ id: '__about', title: labels.about });
  const tocRow = (title: string, n: string) => `<div class="fx-toc"><span class="fx-toc-t">${esc(title)}</span><span class="fx-toc-d"></span><span class="fx-toc-n">${n}</span></div>`;
  const tocPages: number[][] = [];
  const tocHead = `<div class="fx-toc-h"${keyAttr('toc')}${styleAttr(blockCss(blockStyleOf(spec, 'toc'), lh, { mb: true }))}>${esc(labels.contents)}</div>`;
  if (spec.includeContents && tocRows.length) {
    m.clear();
    m.append(tocHead);
    let cur: number[] = [];
    tocRows.forEach((r, i) => {
      const el = m.append(tocRow(r.title, '000'));
      if (m.height() > limit && cur.length) {
        tocPages.push(cur); cur = [];
        m.clear(); m.flow.appendChild(el);
      }
      cur.push(i);
    });
    if (cur.length) tocPages.push(cur);
  }
  const tocStart = front.length;
  tocPages.forEach(() => pushFront('contents', ''));
  if (tocPages.length) blankAfter('toc');
  if (front.length % 2 === 1 && !ebook) pushFront('blank', '');
  const bodyStart = front.length;

  const fillContents = (folios: Record<string, number>) => {
    tocPages.forEach((rows, pi) => {
      const head = pi === 0 ? tocHead : '';
      front[tocStart + pi].body = head + rows.map((i) => tocRow(tocRows[i].title, folios[tocRows[i].id] != null ? String(folios[tocRows[i].id]) : '')).join('');
    });
  };

  // Body.
  const body: Page[] = [];
  const chapterFolio: Record<string, number> = {};
  const chapterStart: Record<string, number> = {};
  let curKind: PageKind = 'text';
  let curChapter: string | undefined;
  const bodySide = (): 'left' | 'right' => (body.length % 2 === 0 ? 'right' : 'left');

  const flush = () => {
    body.push({ kind: curKind, side: bodySide(), folio: body.length + 1, header: curKind === 'text', body: m.html(), chapterId: curChapter });
    m.clear();
    curKind = 'text';
  };
  const pushBlank = () => {
    if (m.flow.childNodes.length) flush();
    body.push({ kind: 'blank', side: bodySide(), folio: body.length + 1, header: false, body: '', chapterId: curChapter });
  };
  const newSection = (kind: PageKind, recto: boolean) => {
    if (m.flow.childNodes.length) flush();
    if (recto && !ebook && body.length % 2 === 1) body.push({ kind: 'blank', side: 'left', folio: body.length + 1, header: false, body: '', chapterId: curChapter });
    curKind = kind;
  };

  const snapshot = (done: boolean, progress: number): PaginateResult => {
    fillContents(chapterFolio);
    const pages = [...front, ...body];
    if (done && !ebook && pages.length % 2 === 1) pages.push({ kind: 'blank', side: 'left', folio: body.length + 1, header: false, body: '' });
    const total = done ? pages.length : Math.max(pages.length, Math.round(pages.length / Math.max(progress, 0.02)));
    const even = ebook ? total : total + (total % 2);
    const starts: Record<string, number> = {};
    for (const [id, i] of Object.entries(chapterStart)) starts[id] = bodyStart + i;
    return { pages, total: even, spineIn: +(even * SPINE_PER_PAGE).toFixed(3), done, progress, chapterStart: starts, bodyStart, geometry: g };
  };

  let slice = performance.now();
  let lastEmit = 0;
  const maybeYield = async () => {
    if (performance.now() - slice < 12) return;
    const now = performance.now();
    if (now - lastEmit > 160) { lastEmit = now; opts.onProgress?.(snapshot(false, doneChars / totalChars)); }
    await yieldNow();
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    slice = performance.now();
  };

  interface PlaceOpts {
    /** Chapter opening: small caps (and drop cap when `drop`). */
    first: boolean;
    drop?: boolean;
    key?: string;
    bs?: BlockStyle;
    /** Alignment written in the manuscript (the author's design change wins). */
    align?: Align;
    /** Extra class (quote, list item). */
    cls?: string;
    /** List marker shown on the first piece. */
    marker?: string;
    /** No first-line indent (after a heading, quote, list or break; list items; quotes). */
    noind?: boolean;
    /** Skip the space before (list items after the first). */
    tight?: boolean;
  }

  /** Places one paragraph, splitting it across pages at word boundaries. Honours the author's design changes for it. */
  const placePara = async (r: Rich, o: PlaceOpts) => {
    const pLang = isDevanagari(r.plain) ? (book.lang === 'mr' ? 'mr' : 'hi') : 'en';
    const langAttr = pLang !== rootLang ? pLang : null;
    const bs: BlockStyle | undefined = o.align && !o.bs?.align ? { ...o.bs, align: o.align } : o.bs;
    const lineH = g.lineH * (bs?.scale && bs.scale > 0 ? bs.scale : 1);
    const justify = !bs?.align || bs.align === 'justify';
    const ka = o.key ? keyAttr(o.key) : '';
    const setStyle = (el: HTMLElement, css: string) => { if (css) el.setAttribute('style', css); else el.removeAttribute('style'); };
    if (bs?.breakBefore && m.flow.childNodes.length) flush();
    const end = r.plain.length;
    let off = 0;
    let first = o.first;
    let cont = false;
    for (let guard = 0; guard < 5000 && off < end; guard++) {
      const atTop = m.flow.childNodes.length === 0;
      const gap = spec.paragraphs === 'block' && !atTop && !cont && !first && !o.cls;
      let noind = first || cont || !!o.noind || (spec.paragraphs === 'block') || (!!o.align && o.align !== 'justify' && o.align !== 'left');
      if (!cont && bs?.indent === true) noind = false;
      if (bs?.indent === false) noind = true;
      const full = blockCss(bs, g.lineH, { mt: !cont && !atTop && !o.tight, mb: true });
      const noMb = blockCss(bs, g.lineH, { mt: !cont && !atTop && !o.tight, mb: false });
      const opts2 = { first, drop: o.drop, deva };
      const markAttr = o.marker && !cont ? ` data-m="${esc(o.marker)}"` : '';
      const el = m.append(pTag(pClass({ noind, gap, extra: o.cls }), langAttr, ka + markAttr + styleAttr(full), richHtml(r, off, end, opts2)));
      if (m.height() <= limit) return;
      // Space after doesn't need to fit at the foot of a page.
      if (full !== noMb) { setStyle(el, noMb); if (m.height() <= limit) return; }

      // Doesn't fit whole: find how many words fit.
      const rest = r.plain.slice(off);
      const tokens = rest.split(/(\s+)/);
      const nWords = Math.ceil(tokens.length / 2);
      const pieceLen = (k: number) => tokens.slice(0, 2 * k - 1).join('').length;
      const tryK = (k: number) => {
        el.className = pClass({ noind, gap, split: justify, extra: o.cls });
        el.innerHTML = richHtml(r, off, off + pieceLen(k), opts2);
        return m.height() <= limit;
      };
      let lo = 0, hi = nWords - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (tryK(mid)) lo = mid; else hi = mid - 1;
      }
      let k = lo;
      // Orphan control: never leave a single line at the foot of a page.
      if (k > 0) {
        tryK(k);
        const lines = Math.round(el.getBoundingClientRect().height / lineH);
        if (lines < 2 && !atTop) k = 0;
        else {
          // Widow control: don't carry a single line over to the next page.
          el.innerHTML = runsHtml(r.runs, off + tokens.slice(0, 2 * k).join('').length, end);
          const restLines = Math.round(el.getBoundingClientRect().height / lineH);
          if (restLines === 1 && lines >= 3) {
            const target = lines - 1;
            let kk = k;
            while (kk > 1) { kk--; tryK(kk); if (Math.round(el.getBoundingClientRect().height / lineH) <= target) break; }
            k = kk;
          }
        }
      }
      if (k === 0) {
        el.remove();
        if (atTop) { // A single word wider than the page: place it anyway.
          m.append(pTag(pClass({ noind: true, extra: o.cls }), langAttr, ka + styleAttr(noMb), runsHtml(r.runs, off, end)));
          flush();
          return;
        }
        flush();
        continue;
      }
      tryK(k);
      flush();
      off += tokens.slice(0, 2 * k).join('').length;
      while (off < end && /\s/.test(r.plain[off])) off++;
      first = false;
      cont = true;
      await maybeYield();
    }
  };

  /** A heading inside a chapter: never left alone at the foot of a page. */
  const placeHeading = (html: string, breakBefore = false) => {
    if (breakBefore && m.flow.childNodes.length) flush();
    const el = m.append(html);
    const room = limit - m.height();
    if ((m.height() > limit || room < g.lineH * 2) && m.flow.childNodes.length > 1) { el.remove(); flush(); m.flow.appendChild(el); }
  };

  const placeBlock = (html: string, breakBefore = false) => {
    if (breakBefore && m.flow.childNodes.length) flush();
    const el = m.append(html);
    if (m.height() > limit && m.flow.childNodes.length > 1) { el.remove(); flush(); m.flow.appendChild(el); }
  };

  const sink = sinkOf(spec, g);
  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const hk = `ch:${ch.id}:title`;
    const hs = blockStyleOf(spec, hk);
    newSection('open', hs?.recto !== false);
    curChapter = ch.id;
    chapterStart[ch.id] = body.length;
    chapterFolio[ch.id] = body.length + 1;
    const label = chapterLabel(labels, ci + 1);
    const title = ch.title.trim();
    let hcss = blockCss(hs, lh);
    if (hs && (hs.shift || hs.spaceBefore || hs.spaceAfter)) {
      const pt = Math.max(0, sink + Math.round(((hs.shift ?? 0) + (hs.spaceBefore ?? 0)) * lh));
      const pb = Math.max(0, lh * 2 + Math.round((hs.spaceAfter ?? 0) * lh));
      hcss = [hcss, `padding-top:${pt}px;padding-bottom:${pb}px`].filter(Boolean).join(';');
    }
    m.append(`<div class="fx-chead"${keyAttr(hk)}${styleAttr(hcss)}>${spec.opening === 'ornament' ? '<div class="fx-orn">❦</div>' : ''}<div class="fx-clabel">${esc(label)}</div>${title ? `<div class="fx-ctitle">${esc(title)}</div>` : ''}</div>`);
    // Blocks are Markdown (see `@/lib/markdown`); the layout key counts written blocks: `ch:<id>:p:<n>`.
    const paras = toParagraphs(ch.content).map((p) => p.trim()).filter(Boolean);
    let opening = true;
    let flushNext = false;
    let placedText = false;
    for (let pi = 0; pi < paras.length; pi++) {
      const p = paras[pi];
      const key = `ch:${ch.id}:p:${pi}`;
      const bs = blockStyleOf(spec, key);
      const blk = isSceneBreak(p) ? { type: 'break' as const } : parseBlock(p);
      const css = (o: { mt?: boolean; mb?: boolean } = { mt: true, mb: true }) => styleAttr(blockCss(bs, lh, o));
      const alignOf = (a?: Align) => (a && !bs?.align ? `text-align:${a}` : '');
      if (blk.type === 'empty') continue;
      if (blk.type === 'break') {
        placeBlock(`<div class="fx-brk"${keyAttr(key)}${css()}>⁂</div>`, !!bs?.breakBefore);
        if (bs?.blankAfter) pushBlank();
        // A new scene opens with small caps (no drop cap).
        opening = true;
        flushNext = false;
        doneChars += p.length + 2;
        continue;
      }
      if (blk.type === 'heading' || blk.type === 'subheading') {
        const tag = blk.type === 'heading' ? 'h2' : 'h3';
        const st = [blockCss(bs, lh, { mt: true, mb: true }), alignOf(blk.align)].filter(Boolean).join(';');
        placeHeading(`<${tag} class="fx-${tag}"${keyAttr(key)}${styleAttr(st)}>${runsHtml(blk.runs)}</${tag}>`, !!bs?.breakBefore);
        if (bs?.blankAfter) pushBlank();
        // A heading before any text keeps the chapter opening for the first paragraph.
        if (placedText) opening = false;
        flushNext = true;
        doneChars += p.length + 2;
        await maybeYield();
        continue;
      }
      if (blk.type === 'list') {
        const counters = [0, 0];
        for (let li = 0; li < blk.items.length; li++) {
          const it = blk.items[li];
          if (it.depth === 0) counters[1] = 0;
          const n = ++counters[it.depth];
          const marker = it.ordered ? `${n}.` : it.depth ? '◦' : '•';
          const cls = ['fx-li', it.depth ? 'fx-li2' : '', li === 0 ? 'fx-lfirst' : '', li === blk.items.length - 1 ? 'fx-llast' : ''].filter(Boolean).join(' ');
          const itemBs = bs ? { ...bs, breakBefore: li === 0 ? bs.breakBefore : undefined, spaceBefore: li === 0 ? bs.spaceBefore : undefined, spaceAfter: li === blk.items.length - 1 ? bs.spaceAfter : undefined } : undefined;
          await placePara(richOf(it.runs), { first: false, key, bs: itemBs, cls, marker, noind: true, tight: li > 0 });
        }
        if (bs?.blankAfter) pushBlank();
        opening = false;
        flushNext = true;
        placedText = true;
        doneChars += p.length + 2;
        await maybeYield();
        continue;
      }
      const isQuote = blk.type === 'quote';
      await placePara(richOf(blk.runs), {
        first: opening && !isQuote,
        drop: opening && !placedText,
        key, bs, align: blk.align,
        cls: isQuote ? 'fx-q' : undefined,
        noind: isQuote || flushNext,
      });
      if (bs?.blankAfter) pushBlank();
      // An opening quotation (epigraph) keeps the chapter opening for the first paragraph after it.
      if (isQuote && !placedText) flushNext = false;
      else { opening = false; flushNext = isQuote; placedText = true; }
      doneChars += p.length + 2;
      await maybeYield();
    }
    if (blockStyleOf(spec, `ch:${ch.id}:end`)?.blankAfter) pushBlank();
  }
  if (spec.aboutAuthor?.trim()) {
    newSection('about', false);
    curChapter = '__about';
    chapterFolio.__about = body.length + 1;
    m.append(`<div class="fx-about-h"${keyAttr('about:head')}${styleAttr(blockCss(blockStyleOf(spec, 'about:head'), lh, { mb: true }))}>${esc(labels.about)}</div>`);
    for (const p of toParagraphs(spec.aboutAuthor).map((x) => x.trim()).filter(Boolean)) {
      await placePara(plainRich(p), { first: false });
      await maybeYield();
    }
  }
  if (m.flow.childNodes.length) flush();

  const result = snapshot(true, 1);
  cache.set(key, result);
  if (cache.size > 14) cache.delete(cache.keys().next().value as string);
  opts.onProgress?.(result);
  return result;
  }
}

/** Spread index layout: spread 0 is the title page alone on the right. */
export function spreads(total: number): [number | null, number | null][] {
  const out: [number | null, number | null][] = [[null, 0]];
  for (let i = 1; i < total; i += 2) out.push([i, i + 1 < total ? i + 1 : null]);
  return out;
}
