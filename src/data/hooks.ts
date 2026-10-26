import { useCallback, useEffect, useRef, useState } from 'react';
import { realtime, type Topic } from './realtime';
import { api } from './api';
import type { CreditEntry, Prices, MediaItem, Book, Chapter, Entity, EntityKind, Feedback, Lap, LapStatus, Profile, Version } from './types';

/**
 * Load data through the API and keep it fresh: reloads whenever a change event
 * arrives on one of `topics` (this tab, another tab, or the server via WebSocket).
 */
export function useResource<T>(load: () => Promise<T>, deps: unknown[], topics: Topic[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const v = await loadRef.current();
      if (my === seq.current) { setData(v); setError(null); }
    } catch (e) {
      if (my === seq.current) setError(e as Error);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = realtime.subscribe(topics, () => {
      clearTimeout(t);
      t = setTimeout(reload, 40);
    });
    const onFocus=()=>{void reload()};window.addEventListener('focus',onFocus);
    return () => { off(); clearTimeout(t);window.removeEventListener('focus',onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}

export const useProfile = () => useResource<Profile>(() => api.profile.get(), [], ['profile']);
export const useBooks = () => useResource<Book[]>(() => api.books.list(), [], ['books']);
export const useBook = (id?: string) =>
  useResource<Book | undefined>(() => (id ? api.books.get(id) : Promise.resolve(undefined)), [id], ['books']);
export const useChapters = (bookId?: string) =>
  useResource<Chapter[]>(() => (bookId ? api.chapters.list(bookId) : Promise.resolve([])), [bookId], ['chapters']);
/** The book's free-writing manuscript (created on first use). */
export const useManuscript = (bookId?: string) =>
  useResource<Chapter | undefined>(() => (bookId ? api.chapters.draft(bookId) : Promise.resolve(undefined)), [bookId], ['chapters']);
export const useLaps = (filter: { bookId?: string; status?: LapStatus; chapterId?: string } = {}) =>
  useResource<Lap[]>(() => api.laps.list(filter), [filter.bookId, filter.status, filter.chapterId], ['laps']);
export const useEntities = (bookId?: string, kind?: EntityKind) =>
  useResource<Entity[]>(() => (bookId ? api.entities.list(bookId, kind) : Promise.resolve([])), [bookId, kind], ['entities']);
export const useVersions = (bookId?: string, chapterId?: string) =>
  useResource<Version[]>(() => (bookId ? api.versions.list(bookId, chapterId) : Promise.resolve([])), [bookId, chapterId], ['versions']);
export const useFeedback = (bookId?: string) =>
  useResource<Feedback[]>(() => (bookId ? api.feedback.list(bookId) : Promise.resolve([])), [bookId], ['feedback']);
export const useMedia = (bookId?: string) =>
  useResource<Omit<MediaItem, 'blob'>[]>(() => (bookId ? api.media.list(bookId) : Promise.resolve([])), [bookId], ['media']);

/** Credit balance, prices and recent ledger; refreshes whenever credits change. */
export const useCredits = () => {
  const bal = useResource<number>(() => api.billing.balance(), [], ['credits']);
  const prices = useResource<Prices>(() => api.billing.prices(), [], []);
  const ledger = useResource<CreditEntry[]>(() => api.billing.ledger(50), [], ['credits']);
  return { balance: bal.data, prices: prices.data, ledger: ledger.data ?? [], loading: bal.loading || prices.loading };
};
