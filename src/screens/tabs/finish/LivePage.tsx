/**
 * The one sample page of "Design your book": a fixed chapter-opening spread drawn instantly with the book's
 * own print CSS (lib/paginate's bookCss + geometry), so it looks exactly like the laid-out book, without
 * paginating anything and without credits. Text flows from the opening page into the next with CSS columns.
 *
 * Every size is drawn at the same scale, so a 5 × 8 page really looks smaller than a 6 × 9 one.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Book, Chapter, FormatSpec } from '@/data/types';
import { useT } from '@/i18n';
import { EBOOK_PAGE, bookCss, bookIsDeva, chapterLabel, esc, geometry, htmlLang, type PrintLabels } from '@/lib/paginate';
import { isDevanagari, toParagraphs } from '@/lib/text';
import { plainOf } from '@/lib/markdown';
import { bookChapters } from '@/lib/exporters';

/** The largest page we draw (6 × 9 in at 96 px/in): every size shares its scale. */
const MAX_W = 576, MAX_H = 864;
const MAX_PAGE_PX = 540;

function useWidth() {
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref, w };
}

interface Props {
  book: Book;
  chapters: Chapter[];
  spec: FormatSpec;
  labels: PrintLabels;
  /** Changes when size or style changes, to fade the page softly. */
  fadeKey: string;
}

export function LivePage({ book, chapters, spec, labels, fadeKey }: Props) {
  const t = useT('finish');
  const { ref, w } = useWidth();
  const deva = bookIsDeva(book);
  const g = geometry(spec, deva);
  const ebook = !!spec.ebook;
  const spread = !ebook && w >= 620;
  const scope = 'gn-live-book';
  const css = useMemo(() => bookCss(spec, g, '.' + scope), [spec, g.pageW, g.pageH, g.lineH]); // eslint-disable-line react-hooks/exhaustive-deps

  // The words: the first two chapters that have text, else a built-in sample in the book's language.
  const { first, second, own } = useMemo(() => {
    const take = (ps: string[], max: number) => { const out: string[] = []; let n = 0; for (const p of ps) { out.push(p); n += p.length; if (n > max) break; } return out; };
    const withText = bookChapters(chapters).map((c) => ({ title: c.title.trim(), paras: toParagraphs(c.content).map((p) => plainOf(p).trim()).filter(Boolean) })).filter((c) => c.paras.length);
    if (withText.length) {
      return { first: { ...withText[0], paras: take(withText[0].paras, 3200) }, second: withText[1] ? { ...withText[1], paras: take(withText[1].paras, 1800) } : undefined, own: true };
    }
    const L = deva ? 'Deva' : '';
    const ps = [1, 2, 3, 4, 5].map((i) => t(`pv2.sample.p${i}${L}`));
    return { first: { title: t(`pv2.sample.title${L}`), paras: ps }, second: { title: t(`pv2.sample.title2${L}`), paras: [ps[2], ps[3], ps[4]] }, own: false };
  }, [chapters, deva, t]);

  const flow = useMemo(() => {
    const chapter = (n: number, c: { title: string; paras: string[] }) => {
      const head = `<div class="fx-chead">${spec.opening === 'ornament' ? '<div class="fx-orn">❦</div>' : ''}<div class="fx-clabel">${esc(chapterLabel(labels, n))}</div>${c.title ? `<div class="fx-ctitle">${esc(c.title)}</div>` : ''}</div>`;
      return head + c.paras.map((p, i) => {
        const lang = isDevanagari(p.slice(0, 40)) ? 'hi' : 'en';
        return `<p class="fx-p${i === 0 ? ' fx-noind' : ''}" lang="${lang}">${i === 0 ? firstPara(p, spec.opening, deva) : esc(p)}</p>`;
      }).join('');
    };
    // The next chapter opens on a fresh page, as it does in the book.
    return `<div class="gn-live-ch">${chapter(1, first)}</div>${spread && second ? `<div class="gn-live-ch gn-live-next">${chapter(2, second)}</div>` : ''}`;
  }, [labels, first, second, spec.opening, deva, spread]);

  // A running head belongs on the right page only when chapter one runs onto it (an opening page has none).
  const flowRef = useRef<HTMLDivElement>(null);
  const [runsOn, setRunsOn] = useState(true);
  useLayoutEffect(() => {
    const el = flowRef.current?.querySelector<HTMLElement>('.gn-live-ch');
    const box = flowRef.current;
    if (!el || !box || !spread) return;
    const measure = () => {
      const kids = el.children;
      const last = kids[kids.length - 1] as HTMLElement | undefined;
      const rects = last ? Array.from(last.getClientRects()) : [];
      const b = box.getBoundingClientRect();
      setRunsOn(rects.some((r) => r.left > b.left + b.width * 0.45));
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
  });

  // One scale for every size: the page grows and shrinks with the trim.
  const slots = spread ? 2 : 1;
  const maxW = ebook ? EBOOK_PAGE.w * 96 + 28 : MAX_W;
  const s = Math.min((w - 64) / (slots * maxW), MAX_PAGE_PX / MAX_H);
  const scale = Math.max(0.2, +s.toFixed(4));
  const realW = g.pageW * slots;
  const boxW = Math.round(realW * scale), boxH = Math.round(g.pageH * scale);
  const flowStyle: CSSProperties = spread
    ? { left: g.outer, top: g.top, width: g.contentW * 2 + g.inner * 2, height: g.contentH, columnCount: 2, columnGap: g.inner * 2 }
    : { left: g.inner, top: g.top, width: g.contentW, height: g.contentH };

  const dims = trimDims(spec);
  const page = (
    <div className={`gn-live-box${ebook ? ' is-ebook' : ''}${spread ? ' is-spread' : ''}`} style={{ width: boxW, height: boxH }}>
      <div className={`gn-live-real ${scope}`} key={fadeKey} lang={htmlLang(book.lang)}
        style={{ width: realW, height: g.pageH, transform: `scale(${scale})` }}>
        {spread ? (
          <>
            <div className="fx-page fx-left fx-k-open gn-live-sheet" />
            <div className="fx-page fx-right fx-k-text gn-live-sheet">
              {spec.headers && (runsOn || !second) && <div className="fx-head">{book.title || ' '}</div>}
              <div className="fx-folio">3</div>
            </div>
          </>
        ) : (
          <div className="fx-page fx-right fx-k-open gn-live-sheet">
            {!ebook && <div className="fx-folio">1</div>}
          </div>
        )}
        <div className="gn-live-flow" ref={flowRef} style={flowStyle} dangerouslySetInnerHTML={{ __html: flow }} />
      </div>
    </div>
  );

  return (
    <div className="gn-live" ref={ref}>
      <style>{css + `.${scope}{position:relative}.${scope} .gn-live-flow{position:absolute;overflow:hidden;column-fill:auto}.${scope} .fx-page{position:absolute;top:0}.${scope} .fx-page.fx-right{left:${spread ? g.pageW : 0}px}.${scope} .fx-page.fx-left{left:0}.${scope} .gn-live-next{break-before:column;-webkit-column-break-before:always}`}</style>
      <div className="gn-live-stage">
        <div className="gn-live-frame">
          {ebook ? <div className="gn-reader">{page}</div> : page}
          {dims && (
            <>
              <span className="gn-ruler gn-ruler-v" style={{ height: boxH }} aria-hidden="true"><span>{dims.h}</span></span>
              <span className="gn-ruler gn-ruler-h" style={{ width: Math.round(g.pageW * scale) }} aria-hidden="true"><span>{dims.w}</span></span>
            </>
          )}
        </div>
      </div>
      {!own && <p className="gn-live-note">{t('pv2.sampleNote')}</p>}
    </div>
  );
}

/** The first paragraph's opening: a drop cap (when chosen) and the first words in small capitals, as the book prints it. */
function firstPara(text: string, opening: FormatSpec['opening'], deva: boolean): string {
  if (deva || isDevanagari(text.slice(0, 40))) return esc(text);
  let rest = text, out = '';
  if (opening === 'drop') {
    const m = rest.match(/^(["“'‘]?[A-Za-z0-9])/);
    if (m) { out += `<span class="fx-dc">${esc(m[1])}</span>`; rest = rest.slice(m[1].length); }
  }
  const words = rest.match(/^(\S*(?:\s+\S+){0,2})/);
  if (words && words[1]) { out += `<span class="fx-sc">${esc(words[1])}</span>`; rest = rest.slice(words[1].length); }
  return out + esc(rest);
}

/** Trim labels for the ruler: inches for US sizes, millimetres for A5. */
export function trimDims(spec: FormatSpec): { w: string; h: string } | null {
  if (spec.ebook) return null;
  switch (spec.trim) {
    case 'a5': return { w: '148 mm', h: '210 mm' };
    case '5x8': return { w: '5 in', h: '8 in' };
    case '6x9': return { w: '6 in', h: '9 in' };
    default: return { w: '5.5 in', h: '8.5 in' };
  }
}
