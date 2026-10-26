import { translate } from '@/i18n';
import type { AppLang, Book, CountryCode } from '@/data/types';
import type { PrintLabels } from '@/lib/paginate';

/** Words printed inside the book follow the book's language, not the interface language. */
export const printLang = (book: Pick<Book, 'lang'>): AppLang => (book.lang === 'en' ? 'en' : 'hi');

export function printLabels(book: Book, fallbackCountry?: CountryCode): PrintLabels {
  const L = printLang(book);
  const tr = (k: string, v?: Record<string, string | number>) => translate(L, 'finish', `print.${k}`, v);
  const year = new Date().getFullYear();
  const country = book.country && book.country !== 'OTHER' ? book.country : fallbackCountry && fallbackCountry !== 'OTHER' ? fallbackCountry : undefined;
  return {
    chapter: tr('chapter'),
    numberWords: L === 'en',
    contents: tr('contents'),
    about: tr('about'),
    copyright: tr('copyright', { year, author: book.author || translate(L, 'common', 'untitled') }),
    rights: tr('rights'),
    published: country ? tr('published', { country: translate(L, 'common', `countries.${country}`), year }) : undefined,
    typeset: tr('typeset'),
  };
}
