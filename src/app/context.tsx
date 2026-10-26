import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useBook, useChapters, useProfile } from '@/data/hooks';
import { api } from '@/data/api';
import type { Book, Chapter, Profile } from '@/data/types';

interface BookCtx {
  book?: Book;
  chapters: Chapter[];
  loading: boolean;
  profile?: Profile;
}
const Ctx = createContext<BookCtx>({ chapters: [], loading: true });

/** Provides the current book (from the :bookId route param) and its chapters to every page. */
export function BookProvider({ children }: { children: ReactNode }) {
  const { bookId } = useParams();
  const { data: book, loading } = useBook(bookId);
  const { data: chapters, loading: lc } = useChapters(bookId);
  const { data: profile } = useProfile();
  useEffect(() => {
    if (bookId && profile && profile.currentBookId !== bookId) api.profile.update({ currentBookId: bookId }).catch(() => {});
  }, [bookId, profile]);
  return <Ctx.Provider value={{ book, chapters: chapters ?? [], loading: loading || lc, profile }}>{children}</Ctx.Provider>;
}

export const useCurrentBook = () => useContext(Ctx);

/** Builds links inside the current book. */
export function bookPath(bookId: string, section = '', extra = '') {
  return `/app/b/${bookId}${section ? '/' + section : ''}${extra ? '/' + extra : ''}`;
}
