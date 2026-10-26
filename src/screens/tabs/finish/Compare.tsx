import { useMemo, useState } from 'react';
import { chapterName } from '@/components/kit';
import { Icon } from '@/components/Icon';
import type { Book } from '@/data/types';
import { useLang, useT } from '@/i18n';
import { fmtNumber } from '@/lib/format';
import type { PaginateResult, PrintLabels } from '@/lib/paginate';
import { bookChapters } from '@/lib/exporters';
import { PagePreview, pageOffset } from './PagePreview';
import { usePagination } from './usePagination';
import { snapshotBook, snapshotChapters } from './editions';
import type { Variant } from './variants';
import { useVariantNames } from './Chooser';

/** Two kept previews side by side, turned to the same chapter together. */
export function Compare({ a, b, book, labels, onBack, onOpen }: { a: Variant; b: Variant; book: Book; labels: PrintLabels; onBack: () => void; onOpen: (v: Variant) => void }) {
  const t = useT('finish');
  const tc = useT('common');
  const [chapter, setChapter] = useState<{ id: string; at: number } | null>(null);
  const chapters = useMemo(() => bookChapters(snapshotChapters(a, book.id)), [a, book.id]);
  return (
    <div className="gn gn-open gn-ws gn-cmp">
      <header className="gn-ws-bar">
        <button type="button" className="btn btn-ghost btn-sm gn-ws-back" onClick={onBack} aria-label={t('pv.back')} title={t('pv.back')}>
          <Icon name="left" size={16} /><span className="gn-x-long">{t('pv.back')}</span>
        </button>
        <div className="gn-ws-title">
          <h1 className="gn-ws-h">{t('pv.compareTitle')}</h1>
          <p className="gn-ws-meta">{t('pv.compareHint')}</p>
        </div>
        {chapters.length > 1 && (
          <label className="gn-ws-tools gn-chsel">
            <span className="sr-only">{t('gen.preview.chapter')}</span>
            <select className="select" value={chapter?.id ?? ''} onChange={(e) => setChapter(e.target.value ? { id: e.target.value, at: Date.now() } : null)}>
              <option value="">{t('gen.preview.chapter')}</option>
              {chapters.map((c, i) => <option key={c.id} value={c.id}>{`${i + 1}. ${chapterName(c, i, tc)}`}</option>)}
            </select>
          </label>
        )}
      </header>
      <section className="gn-compare-grid" aria-label={t('pv.compareTitle')}>
        <Pane v={a} book={book} labels={labels} chapter={chapter} scope="gn-book-a" onOpen={() => onOpen(a)} />
        <Pane v={b} book={book} labels={labels} chapter={chapter} scope="gn-book-b" onOpen={() => onOpen(b)} />
      </section>
    </div>
  );
}

function Pane({ v, book, labels, chapter, scope, onOpen }: { v: Variant; book: Book; labels: PrintLabels; chapter: { id: string; at: number } | null; scope: string; onOpen: () => void }) {
  const t = useT('finish');
  const { lang } = useLang();
  const { label } = useVariantNames();
  const src = useMemo(() => ({ book: snapshotBook(book, v), chapters: snapshotChapters(v, book.id) }), [book, v]);
  const { result } = usePagination(src.book, src.chapters, v.spec, labels, 120, true);
  const [pos, setPos] = useState(0);
  const [jumped, setJumped] = useState<number | null>(null);
  if (chapter && jumped !== chapter.at && result?.done) {
    setJumped(chapter.at);
    const i = (result as PaginateResult).chapterStart[chapter.id];
    if (i != null) setPos(i + pageOffset(!!v.spec.ebook));
  }
  return (
    <div className="gn-pane">
      <div className="gn-pane-head">
        <div className="gn-pane-text">
          <h2 className="gn-pane-name">{label(v.size, v.style)}</h2>
          <span className="gn-pane-meta">{t('pv.metaNo', { n: v.n })} · {result?.done ? t(v.size === 'ebook' ? 'pv.screens' : 'pv.pages', { n: fmtNumber(result.total, lang) }) : t('gen.preview.laying')}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>{t('pv.open')}</button>
      </div>
      <div className="gn-table">
      <PagePreview book={{ ...src.book, format: v.spec }} spec={v.spec} result={result} pos={pos} onPos={setPos} mode="single" zoom={1}
        selected={null} onSelect={() => {}} editable={false} nameOf={(k) => k} chapterOptions={[]} blurbPh={t('gen.preview.blurbPh')} strip={false} scope={scope} />
      </div>
    </div>
  );
}
