/**
 * Every file the author takes away: print-ready PDF (via the browser's print dialog),
 * EPUB 3, a standard manuscript (HTML that opens in Word), plain text, Markdown,
 * and cover files (front PNG/SVG, full-wrap SVG with spine and bleed).
 * All of it is built in the browser from the author's own words; nothing leaves the device.
 */
import { createElement, type ReactElement } from 'react';
import JSZip from 'jszip';
import type { BlockStyle, Book, Chapter, CoverSpec, FormatSpec } from '@/data/types';
import { CoverArt, COVER_FONTS, DEFAULT_COVER, MOODS } from '@/components/CoverArt';
import { countWords, isDevanagari, toParagraphs } from './text';
import { blockHtml, blockPlain, parseBlock, runsHtml, toPlain, type Block, type MarkName, type Run } from './markdown';
import { download, slug } from './format';
import {
  FACES, TRIMS, SPINE_PER_PAGE, blockStyleOf, bookCss, bookIsDeva, chapterLabel, esc, familiesOf, geometry, htmlLang, isSceneBreak,
  paginate, renderPage, type PaginateResult, type PrintLabels,
} from './paginate';

// ---------- shared ----------

/** Chapters that belong in the book, in order. Empty chapters (no words yet) are left out. */
export function bookChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => a.order - b.order).filter((c) => c.content.trim().length > 0);
}

export const fileBase = (book: Book) => slug(book.title || 'book');

const xmlEsc = (s: string) => esc(s).replace(/'/g, '&apos;');

// ---------- fonts ----------

interface FaceRule { family: string; style: string; weight: string; range: string; src: string; base: string }

function readFaceRules(): FaceRule[] {
  const out: FaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    const base = sheet.href ?? location.href;
    for (const r of Array.from(rules)) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const st = r.style;
      out.push({
        family: st.getPropertyValue('font-family').replace(/["']/g, '').trim(),
        style: st.getPropertyValue('font-style') || 'normal',
        weight: st.getPropertyValue('font-weight') || '400',
        range: st.getPropertyValue('unicode-range'),
        src: st.getPropertyValue('src'),
        base,
      });
    }
  }
  return out;
}

function parseRanges(range: string): [number, number][] {
  if (!range) return [[0, 0x10ffff]];
  return range.split(',').map((p) => {
    const s = p.trim().replace(/^U\+/i, '');
    if (s.includes('?')) return [parseInt(s.replace(/\?/g, '0'), 16), parseInt(s.replace(/\?/g, 'F'), 16)] as [number, number];
    const [a, b] = s.split('-');
    return [parseInt(a, 16), parseInt(b ?? a, 16)] as [number, number];
  });
}

function rangeCovers(range: string, text: string | undefined): boolean {
  if (text == null) return true;
  const rs = parseRanges(range);
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (rs.some(([a, b]) => c >= a && c <= b)) return true;
  }
  return false;
}

function firstUrl(src: string, base: string): { url: string; format: string } | null {
  const m = src.match(/url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/);
  if (!m) return null;
  try { return { url: new URL(m[1], base).href, format: m[2] ?? 'woff2' }; } catch { return null; }
}

function absoluteSrc(src: string, base: string) {
  return src.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (_, u: string) => {
    try { return `url("${new URL(u, base).href}")`; } catch { return `url("${u}")`; }
  });
}

const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result as string);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});

const fontDataCache = new Map<string, Promise<string>>();

/**
 * @font-face CSS for the given families, read from the app's own (self-hosted) stylesheets.
 * `inline` embeds the font files as data: URLs (needed inside an SVG drawn to canvas);
 * otherwise the rules point at absolute URLs (for the print window).
 * `text` limits the faces to subsets that cover those characters.
 */
export async function fontFaceCss(families: string[], opts: { inline?: boolean; text?: string } = {}): Promise<string> {
  const want = new Set(families.map((f) => f.toLowerCase()));
  const rules = readFaceRules().filter((r) => want.has(r.family.toLowerCase()) && rangeCovers(r.range, opts.text));
  const parts = await Promise.all(rules.map(async (r) => {
    const head = `font-family:'${r.family}';font-style:${r.style};font-weight:${r.weight};${r.range ? `unicode-range:${r.range};` : ''}`;
    if (!opts.inline) return `@font-face{${head}src:${absoluteSrc(r.src, r.base)};font-display:block}`;
    const u = firstUrl(r.src, r.base);
    if (!u) return '';
    try {
      let p = fontDataCache.get(u.url);
      if (!p) {
        p = fetch(u.url).then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.blob(); }).then(blobToDataUrl);
        fontDataCache.set(u.url, p);
        p.catch(() => fontDataCache.delete(u.url));
      }
      const data = await p;
      return `@font-face{${head}src:url(${data}) format('${u.format}')}`;
    } catch { return ''; }
  }));
  return parts.filter(Boolean).join('\n');
}

// ---------- cover ----------

export interface CoverInput { title: string; subtitle?: string; author: string; spec?: CoverSpec; deva?: boolean }

export const coverInputOf = (book: Book, spec?: CoverSpec): CoverInput => ({
  title: book.title, subtitle: book.subtitle, author: book.author, spec: spec ?? book.cover ?? DEFAULT_COVER,
  deva: isDevanagari(book.title),
});

function coverFamilies(c: CoverInput): string[] {
  const spec = c.spec ?? DEFAULT_COVER;
  const fam = COVER_FONTS[spec.type].family.split(',')[0].replace(/["']/g, '').trim();
  return [fam, 'Hanken Grotesk', ...(c.deva ? ['Tiro Devanagari Hindi', 'Mukta'] : [])];
}
const coverText = (c: CoverInput) => {
  const s = `${c.title} ${c.subtitle ?? ''} ${c.author}`;
  return s + s.toUpperCase();
};

async function staticMarkup(c: CoverInput, width: number, el?: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server.browser');
  return renderToStaticMarkup(el ?? createElement(CoverArt, { title: c.title, subtitle: c.subtitle, author: c.author, spec: c.spec, deva: c.deva, width }));
}

/** The front cover as a standalone SVG document (fonts embedded). `element` draws a different cover SVG (e.g. with the author's layout changes). */
export async function coverSvg(c: CoverInput, opts: { width?: number; embedFonts?: boolean; element?: ReactElement } = {}): Promise<string> {
  const w = opts.width ?? 600;
  let svg = await staticMarkup(c, w, opts.element);
  const fonts = opts.embedFonts === false ? '' : await fontFaceCss(coverFamilies(c), { inline: true, text: coverText(c) });
  svg = svg.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"').replace(/ style="[^"]*"/, '');
  if (fonts) svg = svg.replace(/^(<svg[^>]*>)/, `$1<defs><style>${fonts}</style></defs>`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg;
}

async function svgToPng(svg: string, w: number, h: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.width = w; img.height = h;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('cover image failed')); img.src = url; });
    // Give embedded fonts a moment to be applied inside the image.
    await new Promise((r) => setTimeout(r, 60));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('png failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The front cover as a PNG (default 1600 × 2400). Falls back to system fonts if the font files can't be read. */
export async function coverPng(c: CoverInput, width = 1600, element?: ReactElement): Promise<Blob> {
  const h = Math.round(width * 1.5);
  try {
    return await svgToPng(await coverSvg(c, { width, element }), width, h);
  } catch {
    return svgToPng(await coverSvg(c, { width, embedFonts: false, element }), width, h);
  }
}

export async function downloadCoverPng(book: Book, spec?: CoverSpec) {
  download(`${fileBase(book)}-cover.png`, await coverPng(coverInputOf(book, spec)));
}
export async function downloadCoverSvg(book: Book, spec?: CoverSpec) {
  download(`${fileBase(book)}-cover.svg`, await coverSvg(coverInputOf(book, spec)), 'image/svg+xml');
}

/** Greedy wrap by an estimated character width (SVG has no text flow). */
function wrapChars(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n+/)) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    }
    lines.push(cur);
    lines.push('');
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

export interface WrapLabels { barcode: string }

export const BLEED_IN = 0.125;

/**
 * Full wrap (back + spine + front) at trim size with 0.125 in bleed on every outside edge.
 * Units are 1/100 in; the document declares its physical size in inches.
 */
export async function coverWrapSvg(
  book: Book,
  opts: { spec?: CoverSpec; format: FormatSpec; pages: number; blurb?: string; labels: WrapLabels },
): Promise<string> {
  const c = coverInputOf(book, opts.spec);
  const spec = c.spec ?? DEFAULT_COVER;
  const m = MOODS[spec.mood];
  const t = TRIMS[opts.format.trim];
  const U = 100;
  const b = BLEED_IN * U, w = t.w * U, h = t.h * U;
  const s = Math.max(0.06, opts.pages * SPINE_PER_PAGE) * U;
  const W = 2 * b + 2 * w + s, H = h + 2 * b;
  const deva = !!c.deva || bookIsDeva(book);
  const bookFace = deva ? "'Tiro Devanagari Hindi', serif" : "'Literata', Georgia, serif";
  const titleFace = deva ? "'Tiro Devanagari Hindi', serif" : COVER_FONTS[spec.type].family;

  // Front: the cover art, scaled to cover the front panel plus its bleed.
  const front = (await staticMarkup(c, 600)).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const fx = b + w + s;
  const frontSvg = `<svg x="${fx}" y="0" width="${w + b}" height="${H}" viewBox="0 0 600 900" preserveAspectRatio="xMinYMid slice">${front}</svg>`;

  // Back: blurb + barcode area.
  const fs = 15; // 0.15 in ≈ 10.8 pt
  const pad = 0.6 * U;
  const maxChars = Math.floor((w - 2 * pad + b) / (fs * (deva ? 0.56 : 0.5)));
  const blurb = (opts.blurb ?? '').trim();
  const lines = blurb ? wrapChars(blurb, maxChars).slice(0, 28) : [];
  const lh = fs * 1.55;
  const textX = b + pad, textY = b + pad + fs;
  const blurbSvg = lines.map((l, i) => `<tspan x="${textX}" y="${(textY + i * lh).toFixed(1)}">${xmlEsc(l)}</tspan>`).join('');
  const bcW = 2 * U, bcH = 1.2 * U;
  const bcX = b + w - pad - bcW + 0.2 * U, bcY = b + h - 0.5 * U - bcH;

  // Spine: title and author, reading top to bottom.
  const spineText = s >= 0.2 * U;
  const sfs = Math.min(s * 0.42, 0.2 * U);
  const sx = b + w + s / 2;
  const spineSvg = spineText
    ? `<text transform="translate(${sx} ${b + 0.5 * U}) rotate(90)" fill="${m.fg}" font-family="${titleFace}" font-size="${sfs.toFixed(1)}" dominant-baseline="central">${xmlEsc(book.title)}<tspan font-family="'Hanken Grotesk', sans-serif" font-size="${(sfs * 0.72).toFixed(1)}" dx="${sfs}" letter-spacing="${deva ? 0 : 1.5}">${xmlEsc(deva ? book.author : book.author.toUpperCase())}</tspan></text>`
    : '';

  const fonts = await fontFaceCss([...coverFamilies(c), deva ? 'Tiro Devanagari Hindi' : 'Literata', 'Hanken Grotesk'], {
    inline: true, text: coverText(c) + blurb + opts.labels.barcode,
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${(W / U).toFixed(3)}in" height="${(H / U).toFixed(3)}in" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}">
<title>${xmlEsc(book.title)} — ${xmlEsc(book.author)}</title>
<desc>Trim ${t.w} × ${t.h} in · spine ${(s / U).toFixed(3)} in (${opts.pages} pages) · bleed ${BLEED_IN} in</desc>
${fonts ? `<defs><style>${fonts}</style></defs>` : ''}
<rect width="${W}" height="${H}" fill="${m.bg}"/>
<g id="back">
<text fill="${m.fg}" font-family="${bookFace}" font-size="${fs}">${blurbSvg}</text>
<rect x="${bcX}" y="${bcY}" width="${bcW}" height="${bcH}" fill="#FFFFFF"/>
<text x="${bcX + bcW / 2}" y="${bcY + bcH / 2}" fill="#6B716C" font-family="'Hanken Grotesk', sans-serif" font-size="9" text-anchor="middle" dominant-baseline="central">${xmlEsc(opts.labels.barcode)}</text>
</g>
<g id="spine">
<rect x="${b + w}" y="0" width="${s}" height="${H}" fill="#000000" opacity=".12"/>
${spineSvg}
</g>
<g id="front">${frontSvg}</g>
</svg>`;
}

export async function downloadCoverWrap(book: Book, opts: Parameters<typeof coverWrapSvg>[1]) {
  download(`${fileBase(book)}-cover-wrap.svg`, await coverWrapSvg(book, opts), 'image/svg+xml');
}

// ---------- print / PDF ----------

/**
 * Open the print window synchronously from the click (so the browser doesn't block it),
 * then fill it with `writePrintBook`.
 */
export function openPrintWindow(loadingText: string): Window | null {
  const win = window.open('', '_blank');
  if (!win) return null;
  win.document.open();
  win.document.write(`<!doctype html><meta charset="utf-8"><title>…</title><body style="font:16px system-ui;padding:40px;color:#3B4440;background:#F4EFE6">${esc(loadingText)}</body>`);
  win.document.close();
  return win;
}

export interface PrintOptions {
  book: Book;
  chapters: Chapter[];
  spec: FormatSpec;
  labels: PrintLabels;
  /** A finished pagination to reuse (from the Format preview). */
  pagination?: PaginateResult;
  /** Shown on screen only, above the pages. */
  instructions: string;
  printLabel: string;
}

export async function writePrintBook(win: Window, o: PrintOptions) {
  const chapters = bookChapters(o.chapters);
  const result = o.pagination?.done ? o.pagination : await paginate({ book: o.book, chapters, spec: o.spec, labels: o.labels });
  const deva = bookIsDeva(o.book);
  const g = geometry(o.spec, deva);
  const t = TRIMS[o.spec.trim];
  const fonts = await fontFaceCss(familiesOf(o.spec));
  const ctx = { book: o.book, spec: o.spec };
  const pages = result.pages.map((p) => renderPage(p, ctx)).join('\n');
  const lang = htmlLang(o.book.lang);
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${esc(o.book.title || 'Book')}</title>
<style>
${fonts}
${bookCss(o.spec, g)}
@page{size:${t.w}in ${t.h}in;margin:0}
@page :left{margin:0}
@page :right{margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
.fx-root .fx-page{break-after:page;page-break-after:always;break-inside:avoid}
.fx-root .fx-page:last-child{break-after:auto;page-break-after:auto}
@media print{.fx-root .fx-page{width:${t.w}in;height:${t.h}in;background:#fff}.fx-bar{display:none}}
@media screen{
  body{background:#5f625e;padding:72px 16px 40px}
  .fx-root .fx-page{margin:0 auto 18px;box-shadow:0 10px 30px -12px rgba(0,0,0,.5)}
  .fx-bar{position:fixed;top:0;left:0;right:0;z-index:2;display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap;padding:12px 16px;background:#14231F;color:#EDE6D8;font:15px/1.4 system-ui,sans-serif}
  .fx-bar button{font:inherit;font-weight:600;background:#EDE6D8;color:#14231F;border:0;border-radius:999px;min-height:40px;padding:0 18px;cursor:pointer}
}
</style></head>
<body><div class="fx-bar"><span>${esc(o.instructions)}</span><button type="button" onclick="print()">${esc(o.printLabel)}</button></div>
<div class="fx-root" lang="${lang}">
${pages}
</div></body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  try { await win.document.fonts?.ready; } catch { /* print anyway */ }
  await new Promise((r) => setTimeout(r, 350));
  win.focus();
  win.print();
}

// ---------- EPUB 3 ----------

function hashHex(s: string, n: number): string {
  let out = '';
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let round = 0; out.length < n; round++) {
    for (let i = 0; i < s.length; i++) {
      h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 ^ (s.charCodeAt(i) + round), 2246822519) >>> 0;
    }
    out += h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }
  return out.slice(0, n);
}
/** Stable UUID for a book, so every export of the same book shares an identifier. */
export function bookUuid(bookId: string): string {
  const h = hashHex('dictationer:' + bookId, 32).split('');
  h[12] = '4';
  h[16] = '89ab'[parseInt(h[16], 16) % 4];
  const x = h.join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const xhtml = (lang: string, title: string, body: string, opts: { epubType?: boolean } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="UTF-8"/><title>${xmlEsc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body${opts.epubType ? ' epub:type="bodymatter"' : ''}>
${body}
</body>
</html>`;

const paraXhtml = (p: string, cls?: string, bookLang?: string, style = '') => {
  const pl = isDevanagari(p) ? 'hi' : 'en';
  const langAttr = bookLang && pl !== bookLang ? ` xml:lang="${pl}" lang="${pl}"` : '';
  return `<p${cls ? ` class="${cls}"` : ''}${langAttr}${style ? ` style="${style}"` : ''}>${xmlEsc(p).replace(/\n/g, '<br/>')}</p>`;
};

/**
 * One chapter block (Markdown, see `@/lib/markdown`) as reflowable (X)HTML with its formatting:
 * headings, quotes, lists, alignment, bold/italic/underline/strike/highlight. Returns the HTML and
 * whether the next paragraph should start flush (no indent).
 */
function blockFlowHtml(raw: string, o: { xhtml: boolean; first: boolean; bookLang?: string; style?: string; brk: string }): { html: string; flush: boolean; isBreak: boolean } {
  const b: Block = isSceneBreak(raw) ? { type: 'break' } : parseBlock(raw);
  const ho = { xhtml: o.xhtml };
  const merge = (align?: string) => [align ? `text-align:${align}` : '', o.style ?? ''].filter(Boolean).join(';');
  const sa = (css: string) => (css ? ` style="${css}"` : '');
  const plain = blockPlain(b);
  const pl = isDevanagari(plain) ? 'hi' : 'en';
  const langAttr = o.bookLang && pl !== o.bookLang ? (o.xhtml ? ` xml:lang="${pl}" lang="${pl}"` : ` lang="${pl}"`) : '';
  switch (b.type) {
    case 'empty': return { html: '', flush: false, isBreak: false };
    case 'break': return { html: `<p class="brk"${sa(o.style ?? '')}>${o.brk}</p>`, flush: true, isBreak: true };
    case 'heading': return { html: `<h2 class="sh"${langAttr}${sa(merge(b.align))}>${runsHtml(b.runs, 0, Infinity, ho)}</h2>`, flush: true, isBreak: false };
    case 'subheading': return { html: `<h3 class="ssh"${langAttr}${sa(merge(b.align))}>${runsHtml(b.runs, 0, Infinity, ho)}</h3>`, flush: true, isBreak: false };
    case 'quote': return { html: `<blockquote${langAttr}${sa(merge(b.align))}><p>${runsHtml(b.runs, 0, Infinity, ho)}</p></blockquote>`, flush: true, isBreak: false };
    case 'list': return { html: blockHtml(b, ho), flush: true, isBreak: false };
    default: {
      const cls = o.first ? 'first' : '';
      return { html: `<p${cls ? ` class="${cls}"` : ''}${langAttr}${sa(merge(b.align))}>${runsHtml(b.runs, 0, Infinity, ho)}</p>`, flush: false, isBreak: false };
    }
  }
}

/** The author's design changes, as reflowable CSS (one line ≈ 1.5em). Page-only changes (nudges, blank pages) don't apply to ebooks. */
function epubCss(bs: BlockStyle | undefined, o: { indent?: boolean; space?: boolean } = {}): string {
  if (!bs) return '';
  const out: string[] = [];
  if (bs.align) out.push(`text-align:${bs.align}`);
  if (bs.scale && bs.scale !== 1) out.push(`font-size:${bs.scale.toFixed(2)}em`);
  if (bs.italic != null) out.push(`font-style:${bs.italic ? 'italic' : 'normal'}`);
  if (o.space !== false && bs.spaceBefore) out.push(`margin-top:${(bs.spaceBefore * 1.5).toFixed(2)}em`);
  if (o.space !== false && bs.spaceAfter) out.push(`margin-bottom:${(bs.spaceAfter * 1.5).toFixed(2)}em`);
  if (o.indent && bs.indent != null) out.push(`text-indent:${bs.indent ? '1.3em' : '0'}`);
  if (bs.breakBefore) out.push('page-break-before:always;break-before:page');
  return out.join(';');
}
const st = (css: string) => (css ? ` style="${css}"` : '');

const EPUB_CSS = (face: string) => `
body{margin:0 5%;font-family:${face};line-height:1.5}
h1{font-size:1.6em;font-weight:normal;text-align:center;margin:2.5em 0 .3em;line-height:1.2}
.label{text-align:center;font-size:.8em;letter-spacing:.2em;text-transform:uppercase;margin-top:3em;color:#666}
.label:lang(hi),.label:lang(mr){letter-spacing:0;text-transform:none;font-size:.95em}
p{margin:0;text-indent:1.3em;text-align:justify}
p.first,p.noind,.brk+p,h2+p,h3+p,blockquote+p,ul+p,ol+p{text-indent:0}
.brk{text-align:center;margin:1em 0;text-indent:0}
h2.sh{font-size:1.25em;text-align:left;margin:1.4em 0 .5em;font-weight:normal}
h3.ssh{font-size:1.05em;text-align:left;margin:1.2em 0 .4em;font-weight:normal;font-style:italic}
blockquote{margin:.8em 1.6em;font-size:.95em}
blockquote p{text-indent:0}
ul,ol{margin:.6em 0 .6em 1.2em;padding-left:1.2em}
li p{text-indent:0}
mark{background:#f3e6bf;color:inherit}
.tp{text-align:center;margin-top:30%}
.tp h1{font-size:2em;margin:0}
.tp .sub{font-style:italic;margin-top:.6em;text-indent:0;text-align:center}
.tp .author{margin-top:3em;letter-spacing:.15em;text-transform:uppercase;text-indent:0;text-align:center}
.cp p{text-indent:0;font-size:.85em;margin-bottom:.6em;text-align:left}
.ded{margin-top:30%;text-align:center;font-style:italic;text-indent:0}
nav ol{list-style:none;padding:0}
nav li{margin:.4em 0}
.cover{margin:0;padding:0;text-align:center}
.cover img{max-width:100%;max-height:100%}
`;

export interface EpubOptions { book: Book; chapters: Chapter[]; spec: FormatSpec; labels: PrintLabels; coverSpec?: CoverSpec; /** A ready cover image (e.g. drawn with the author's cover layout); otherwise drawn from coverSpec. */ coverImage?: Blob }

export async function buildEpub(o: EpubOptions): Promise<Blob> {
  const { book, spec, labels } = o;
  const chapters = bookChapters(o.chapters);
  const lang = htmlLang(book.lang);
  const uuid = bookUuid(book.id);
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

  const OE = zip.folder('OEBPS')!;
  OE.file('style.css', EPUB_CSS(FACES[spec.face].family.replace(/'/g, '"')));

  let hasCover = false;
  try {
    OE.file('cover.png', o.coverImage ?? await coverPng(coverInputOf(book, o.coverSpec), 1600));
    hasCover = true;
  } catch { /* ebook without a cover image */ }

  const items: { id: string; href: string; type: string; props?: string; spine?: boolean; title?: string }[] = [];
  if (hasCover) {
    items.push({ id: 'cover-image', href: 'cover.png', type: 'image/png', props: 'cover-image' });
    OE.file('cover.xhtml', xhtml(lang, book.title, `<div class="cover"><img src="cover.png" alt="${xmlEsc(book.title)}"/></div>`));
    items.push({ id: 'cover', href: 'cover.xhtml', type: 'application/xhtml+xml', spine: true });
  }
  const fx = (k: string) => st(epubCss(blockStyleOf(spec, k), { space: false }));
  OE.file('title.xhtml', xhtml(lang, book.title, `<section class="tp" epub:type="titlepage"><h1${fx('title:main')}>${xmlEsc(book.title)}</h1>${book.subtitle ? `<p class="sub"${fx('title:sub')}>${xmlEsc(book.subtitle)}</p>` : ''}<p class="author"${fx('title:author')}>${xmlEsc(book.author)}</p></section>`));
  items.push({ id: 'titlepage', href: 'title.xhtml', type: 'application/xhtml+xml', spine: true });
  OE.file('copyright.xhtml', xhtml(lang, labels.copyright, `<section class="cp" epub:type="copyright-page"><p>${xmlEsc(labels.copyright)}</p><p>${xmlEsc(labels.rights)}</p>${labels.published ? `<p>${xmlEsc(labels.published)}</p>` : ''}<p>${xmlEsc(labels.typeset)}</p></section>`));
  items.push({ id: 'copyright', href: 'copyright.xhtml', type: 'application/xhtml+xml', spine: true });
  if (spec.dedication?.trim()) {
    OE.file('dedication.xhtml', xhtml(lang, book.title, `<section epub:type="dedication"><p class="ded">${xmlEsc(spec.dedication.trim()).replace(/\n/g, '<br/>')}</p></section>`));
    items.push({ id: 'dedication', href: 'dedication.xhtml', type: 'application/xhtml+xml', spine: true });
  }
  const navAt = items.length;

  const navEntries: { href: string; title: string }[] = [];
  chapters.forEach((ch, i) => {
    const label = chapterLabel(labels, i + 1);
    const title = ch.title.trim();
    const id = `ch${String(i + 1).padStart(3, '0')}`;
    const paras = toParagraphs(ch.content).map((p) => p.trim()).filter(Boolean);
    let first = true;
    const body = paras.map((p, pi) => {
      const css = epubCss(blockStyleOf(spec, `ch:${ch.id}:p:${pi}`), { indent: true });
      const r = blockFlowHtml(p, { xhtml: true, first, bookLang: lang, style: css, brk: '* * *' });
      first = r.flush;
      return r.html;
    }).filter(Boolean).join('\n');
    const hs = blockStyleOf(spec, `ch:${ch.id}:title`);
    const hcss = st(epubCss(hs ? { align: hs.align, italic: hs.italic } : undefined));
    const tcss = st(epubCss(hs, { space: false }));
    OE.file(`${id}.xhtml`, xhtml(lang, title || label, `<section epub:type="chapter" id="${id}"><p class="label"${hcss}>${xmlEsc(label)}</p>${title ? `<h1${tcss}>${xmlEsc(title)}</h1>` : `<h1${tcss}>${xmlEsc(label)}</h1>`}\n${body}</section>`, { epubType: true }));
    items.push({ id, href: `${id}.xhtml`, type: 'application/xhtml+xml', spine: true });
    navEntries.push({ href: `${id}.xhtml`, title: title || label });
  });
  if (spec.aboutAuthor?.trim()) {
    const body = toParagraphs(spec.aboutAuthor).map((p) => p.trim()).filter(Boolean).map((p) => paraXhtml(p, 'noind', lang)).join('\n');
    OE.file('about.xhtml', xhtml(lang, labels.about, `<section epub:type="backmatter"><h1>${xmlEsc(labels.about)}</h1>\n${body}</section>`));
    items.push({ id: 'about', href: 'about.xhtml', type: 'application/xhtml+xml', spine: true });
    navEntries.push({ href: 'about.xhtml', title: labels.about });
  }

  const navBody = `<nav epub:type="toc" id="toc"><h1>${xmlEsc(labels.contents)}</h1><ol>${navEntries.map((n) => `<li><a href="${n.href}">${xmlEsc(n.title)}</a></li>`).join('')}</ol></nav>
<nav epub:type="landmarks" hidden=""><ol>${hasCover ? '<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>' : ''}<li><a epub:type="titlepage" href="title.xhtml">Title page</a></li>${navEntries[0] ? `<li><a epub:type="bodymatter" href="${navEntries[0].href}">Start</a></li>` : ''}</ol></nav>`;
  OE.file('nav.xhtml', xhtml(lang, labels.contents, navBody));
  items.splice(navAt, 0, { id: 'nav', href: 'nav.xhtml', type: 'application/xhtml+xml', props: 'nav', spine: spec.includeContents });

  // EPUB 2 table of contents for older readers.
  OE.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${lang}">
<head><meta name="dtb:uid" content="urn:uuid:${uuid}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${xmlEsc(book.title)}</text></docTitle>
<navMap>${navEntries.map((n, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xmlEsc(n.title)}</text></navLabel><content src="${n.href}"/></navPoint>`).join('')}</navMap>
</ncx>`);
  items.push({ id: 'ncx', href: 'toc.ncx', type: 'application/x-dtbncx+xml' });
  items.push({ id: 'css', href: 'style.css', type: 'text/css' });

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
<dc:title>${xmlEsc(book.title || 'Untitled')}</dc:title>
${book.author.trim() ? `<dc:creator id="author">${xmlEsc(book.author.trim())}</dc:creator>
<meta refines="#author" property="role" scheme="marc:relators">aut</meta>` : ''}
<dc:language>${lang}</dc:language>
${book.fields?.blurb ? `<dc:description>${xmlEsc(book.fields.blurb)}</dc:description>` : ''}
<meta property="dcterms:modified">${modified}</meta>
${hasCover ? '<meta name="cover" content="cover-image"/>' : ''}
</metadata>
<manifest>
${items.map((i) => `<item id="${i.id}" href="${i.href}" media-type="${i.type}"${i.props ? ` properties="${i.props}"` : ''}/>`).join('\n')}
</manifest>
<spine toc="ncx">
${items.filter((i) => i.spine).map((i) => `<itemref idref="${i.id}"${i.id === 'cover' ? ' linear="yes"' : ''}/>`).join('\n')}
</spine>
</package>`;
  OE.file('content.opf', opf.replace(/\n{2,}/g, '\n'));

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

export async function downloadEpub(o: EpubOptions) {
  download(`${fileBase(o.book)}.epub`, await buildEpub(o));
}

// ---------- manuscript / text / markdown ----------

export interface ManuscriptLabels {
  /** "about {n} words" */
  about: string;
  by: string;
  chapter: string;
  numberWords: boolean;
  end: string;
}

const roundWords = (n: number) => (n < 1000 ? Math.max(100, Math.round(n / 100) * 100) : Math.round(n / 1000) * 1000);

/** Standard manuscript format: 12 pt Times, double-spaced, 1 in margins, title page. Opens in Word. */
export function manuscriptHtml(book: Book, chaptersIn: Chapter[], profileName: string | undefined, l: ManuscriptLabels): string {
  const chapters = bookChapters(chaptersIn);
  const words = chapters.reduce((s, c) => s + countWords(toPlain(c.content)), 0);
  const lang = htmlLang(book.lang);
  const deva = bookIsDeva(book);
  const face = deva ? "'Tiro Devanagari Hindi', 'Mangal', 'Nirmala UI', serif" : "'Times New Roman', Times, serif";
  const name = book.author || profileName || '';
  const labels: PrintLabels = { chapter: l.chapter, numberWords: l.numberWords, contents: '', about: '', copyright: '', rights: '', typeset: '' };
  const body = chapters.map((ch, i) => {
    const label = chapterLabel(labels, i + 1);
    const paras = toParagraphs(ch.content).map((p) => p.trim()).filter(Boolean);
    let first = true;
    return `<div class="ch"><p class="chl">${esc(label)}</p>${ch.title.trim() ? `<p class="cht">${esc(ch.title.trim())}</p>` : ''}${paras.map((p) => {
      const r = blockFlowHtml(p, { xhtml: false, first, brk: '#' });
      first = r.flush;
      return r.html;
    }).join('')}</div>`;
  }).join('');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="${lang}">
<head><meta charset="utf-8"><title>${esc(book.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page Section1{size:8.5in 11in;margin:1in}
div.Section1{page:Section1}
body{font-family:${face};font-size:12pt;line-height:200%}
p{margin:0;text-indent:.5in;line-height:200%}
p.first,p.brk,p.chl,p.cht,.tp p,blockquote p,li p{text-indent:0}
h2.sh,h3.ssh{font-size:12pt;font-weight:bold;margin:12pt 0 0;line-height:200%}
h3.ssh{font-weight:normal;font-style:italic}
blockquote{margin:0 .5in}
ul,ol{margin:0 0 0 .5in}
.tp-top{display:flex;justify-content:space-between}
.tp-top td{font-size:12pt;line-height:1.2;vertical-align:top}
.tp-title{text-align:center;margin-top:3in;text-transform:uppercase}
.tp-by{text-align:center}
.ch{page-break-before:always}
.chl{text-align:center;margin-top:2in}
.cht{text-align:center;margin-bottom:24pt}
.brk{text-align:center}
.end{text-align:center;margin-top:24pt;text-indent:0}
</style></head>
<body><div class="Section1">
<div class="tp">
<table width="100%" cellpadding="0" cellspacing="0" class="tp-top"><tr><td>${esc(name)}</td><td align="right">${esc(l.about.split('{n}').join(roundWords(words).toLocaleString('en-US')))}</td></tr></table>
<p class="tp-title">${esc(book.title)}</p>
${book.subtitle ? `<p class="tp-by">${esc(book.subtitle)}</p>` : ''}
<p class="tp-by">${esc(l.by)} ${esc(name)}</p>
</div>
${body}
<p class="end">${esc(l.end)}</p>
</div></body></html>`;
}

export function plainText(book: Book, chaptersIn: Chapter[], l: Pick<ManuscriptLabels, 'chapter' | 'numberWords'>): string {
  const labels = { chapter: l.chapter, numberWords: l.numberWords } as PrintLabels;
  const parts = [book.title, ...(book.subtitle ? [book.subtitle] : []), book.author, ''];
  bookChapters(chaptersIn).forEach((ch, i) => {
    parts.push('', '', chapterLabel(labels, i + 1) + (ch.title.trim() ? `: ${ch.title.trim()}` : ''), '');
    parts.push(toParagraphs(ch.content).map((p) => p.trim()).filter(Boolean).map(plainForText).join('\n\n'));
  });
  return parts.join('\n').replace(/\n{4,}/g, '\n\n\n') + '\n';
}

/** A block as plain text for the .txt export: list items keep a bullet or number, a scene break shows * * *. */
function plainForText(raw: string): string {
  if (isSceneBreak(raw)) return '* * *';
  const b = parseBlock(raw);
  if (b.type !== 'list') return blockPlain(b);
  const n = [0, 0];
  return b.items.map((it) => {
    if (it.depth === 0) n[1] = 0;
    const k = ++n[it.depth];
    const text = it.runs.map((r) => r.text).join('').replace(/\n/g, '\n   ');
    return `${it.depth ? '   ' : ''}${it.ordered ? `${k}.` : '•'} ${text}`;
  }).join('\n');
}

const MD_WRAP: Record<MarkName, [string, string]> = { bold: ['**', '**'], italic: ['*', '*'], strike: ['~~', '~~'], underline: ['<u>', '</u>'], highlight: ['<mark>', '</mark>'] };
/** Runs as common Markdown (underline and highlight as HTML tags). */
function runsStdMd(runs: Run[]): string {
  return runs.map((r) => {
    const t = mdInline(r.text);
    if (!r.marks.length || !t.trim()) return t;
    const m = t.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    const open = r.marks.map((k) => MD_WRAP[k][0]).join('');
    const close = [...r.marks].reverse().map((k) => MD_WRAP[k][1]).join('');
    return m[1] + open + m[2] + close + m[3];
  }).join('').replace(/\n/g, '  \n');
}
const mdInline = (s: string) => s.replace(/([*_`[\]<\\~=])/g, '\\$1');

/** A chapter block as common Markdown (chapter titles are `##`, so headings inside a chapter are `###` / `####`). */
function blockStdMd(raw: string): string {
  if (isSceneBreak(raw)) return '* * *';
  const b = parseBlock(raw);
  switch (b.type) {
    case 'empty': return '';
    case 'break': return '* * *';
    case 'heading': return `### ${runsStdMd(b.runs)}`;
    case 'subheading': return `#### ${runsStdMd(b.runs)}`;
    case 'quote': return `> ${runsStdMd(b.runs).split('\n').join('\n> ')}`;
    case 'list': {
      const n = [0, 0];
      return b.items.map((it) => {
        if (it.depth === 0) n[1] = 0;
        const k = ++n[it.depth];
        return `${it.depth ? '    ' : ''}${it.ordered ? `${k}.` : '-'} ${runsStdMd(it.runs).replace(/\n/g, '\n      ')}`;
      }).join('\n');
    }
    default: {
      const t = runsStdMd(b.runs);
      return /^(#{1,6}\s|>|\d+\.\s|[-*+]\s)/.test(t) ? '\\' + t : t;
    }
  }
}

const mdEsc = (s: string) => s.replace(/^(#{1,6}\s|>|\d+\.\s|[-*+]\s)/gm, '\\$1').replace(/([*_`[\]<])/g, '\\$1');

export function markdown(book: Book, chaptersIn: Chapter[], l: Pick<ManuscriptLabels, 'chapter' | 'numberWords'>): string {
  const labels = { chapter: l.chapter, numberWords: l.numberWords } as PrintLabels;
  const out: string[] = [`---`, `title: "${book.title.replace(/"/g, '\\"')}"`, ...(book.subtitle ? [`subtitle: "${book.subtitle.replace(/"/g, '\\"')}"`] : []), `author: "${book.author.replace(/"/g, '\\"')}"`, `lang: ${htmlLang(book.lang)}`, `---`, '', `# ${mdEsc(book.title)}`, ''];
  if (book.subtitle) out.push(`*${mdEsc(book.subtitle)}*`, '');
  out.push(mdEsc(book.author), '');
  bookChapters(chaptersIn).forEach((ch, i) => {
    const label = chapterLabel(labels, i + 1);
    out.push('', `## ${mdEsc(ch.title.trim() || label)}`, '');
    for (const p of toParagraphs(ch.content).map((x) => x.trim()).filter(Boolean)) {
      const md = blockStdMd(p);
      if (md) out.push(md, '');
    }
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

export function downloadManuscript(book: Book, chapters: Chapter[], profileName: string | undefined, l: ManuscriptLabels) {
  download(`${fileBase(book)}-manuscript.html`, manuscriptHtml(book, chapters, profileName, l), 'text/html;charset=utf-8');
}
export function downloadText(book: Book, chapters: Chapter[], l: ManuscriptLabels) {
  download(`${fileBase(book)}.txt`, plainText(book, chapters, l), 'text/plain;charset=utf-8');
}
export function downloadMarkdown(book: Book, chapters: Chapter[], l: ManuscriptLabels) {
  download(`${fileBase(book)}.md`, markdown(book, chapters, l), 'text/markdown;charset=utf-8');
}
