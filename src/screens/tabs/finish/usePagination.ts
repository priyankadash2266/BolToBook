import { useEffect, useRef, useState } from 'react';
import type { Book, Chapter, FormatSpec } from '@/data/types';
import { cachedPagination, paginate, paginateKey, type PaginateResult, type PrintLabels } from '@/lib/paginate';
import { bookChapters } from '@/lib/exporters';

/**
 * Lays out the book in the background (time-sliced), re-running when the spec or text changes.
 * With `keepStale`, the pages already shown stay up while a new layout is worked out
 * (`updating` is true), so a design change never blanks the desk or jumps the page.
 * Render the pages with `laidOutWith`, the spec they were laid out with.
 */
export function usePagination(book: Book | undefined, chapters: Chapter[], spec: FormatSpec | undefined, labels: PrintLabels | undefined, delay = 260, keepStale = false) {
  const [state, setState] = useState<{ r: PaginateResult | null; spec?: FormatSpec }>({ r: null });
  const result = state.r;
  const [error, setError] = useState<Error | null>(null);
  const [updating, setUpdating] = useState(false);
  const shown = useRef<PaginateResult | null>(null);
  shown.current = result;
  const included = book ? bookChapters(chapters) : [];
  const key = book && spec && labels ? paginateKey(book, included, spec, labels) : '';

  useEffect(() => {
    if (!book || !spec || !labels) return;
    const hit = cachedPagination(key);
    const setResult = (r: PaginateResult | null) => setState({ r, spec });
    if (hit) { setResult(hit); setError(null); setUpdating(false); return; }
    setError(null);
    // Keep whatever is on the desk (even a partial layout) until the new one is complete, so a change never blanks it.
    const stale = keepStale && !!shown.current;
    if (!stale) setResult(null);
    setUpdating(true);
    const ac = new AbortController();
    const t = setTimeout(() => {
      paginate({ book, chapters: included, spec, labels }, { signal: ac.signal, onProgress: (r) => { if (!ac.signal.aborted && (!stale || r.done)) setResult(r); } })
        .then((r) => { if (!ac.signal.aborted) { setResult(r); setError(null); setUpdating(false); } })
        .catch((e: Error) => { if (e.name !== 'AbortError') { setError(e); setUpdating(false); } });
    }, delay);
    return () => { clearTimeout(t); ac.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /** `laidOutWith`: the spec the shown pages were laid out with (differs from `spec` while updating). */
  return { result, laidOutWith: state.spec, error, updating };
}
