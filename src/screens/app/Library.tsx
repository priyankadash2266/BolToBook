import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CoverArt, DEFAULT_COVER } from '@/components/CoverArt';
import { EmptyState } from '@/components/bits';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useT, useLang } from '@/i18n';
import { api } from '@/data/api';
import { useBooks, useLaps, useProfile, useResource } from '@/data/hooks';
import { fmtNumber, fmtRelative } from '@/lib/format';
import { isDevanagari } from '@/lib/text';
import { createSampleBook } from '@/lib/sample';
import type { Book, Lap } from '@/data/types';
import { useCapture } from '@/app/CaptureLap';
import { TagChip } from '@/screens/app/laps/bits';
import { tagKey } from '@/lib/lapVoice';
import { ConfirmDialog } from './library/ConfirmDialog';
import './library/library.css';

type Stats = Record<string, { words: number; chapters: number }>;

/** An empty shelf with one book leaning against the end: the drawing for a bare library. */
function ShelfArt() {
  const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 152 140" width="152" height="140" aria-hidden="true">
      <g {...S}>
        <path d="M14 112h124M18 112v8M134 112v8" />
        <rect x="34" y="52" width="16" height="60" rx="2" />
        <path d="M38 62h8M38 102h8" opacity=".55" />
        <rect x="52" y="40" width="14" height="72" rx="2" className="ta-brass" />
        <path d="M55 50h8M55 100h8" className="ta-brass" opacity=".7" />
        <path d="M72 112l26-58 13 6-26 58z" />
        <path d="M118 74v-14M111 67h14" className="ta-brass" />
        <circle cx="118" cy="67" r="13" opacity=".45" strokeDasharray="3 4" />
      </g>
    </svg>
  );
}

export default function Library() {
  const t = useT('library');
  const c = useT('common');
  const { lang } = useLang();
  const toast = useToast();
  const nav = useNavigate();
  const { data: books, loading } = useBooks();
  const { data: profile } = useProfile();
  const { data: laps } = useLaps({});
  const ids = (books ?? []).map((b) => b.id).join(',');
  const { data: stats } = useResource<Stats>(async () => {
    const out: Stats = {};
    await Promise.all((books ?? []).map(async (b) => {
      const chs = await api.chapters.list(b.id);
      out[b.id] = { words: chs.reduce((s, ch) => s + ch.wordCount, 0), chapters: chs.length };
    }));
    return out;
  }, [ids], ['chapters']);
  const [toDelete, setToDelete] = useState<Book | null>(null);
  const [adding, setAdding] = useState(false);

  const addSample = async () => {
    setAdding(true);
    try {
      const id = await createSampleBook(lang);
      toast.show(t('sampleAdded'), { label: c('actions.open'), onClick: () => nav(`/app/b/${id}`) });
    } finally { setAdding(false); }
  };

  const remove = async (b: Book) => {
    await api.books.remove(b.id);
    if (profile?.currentBookId === b.id) await api.profile.update({ currentBookId: undefined });
    setToDelete(null);
    toast.show(t('deleted', { title: b.title || c('untitled') }));
  };

  const list = books ?? [];
  // The book on the desk: the one the author had open last, else the most recently touched.
  const current = useMemo(() => {
    if (!list.length) return undefined;
    return list.find((b) => b.id === profile?.currentBookId)
      ?? [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }, [list, profile?.currentBookId]);

  const name = profile?.name?.trim();
  const statLine = (s?: { words: number; chapters: number }) => (s
    ? `${s.chapters === 1 ? t('chapterOne') : t('chapters', { n: fmtNumber(s.chapters, lang) })} · ${s.words === 1 ? c('wordsOne') : c('words', { n: fmtNumber(s.words, lang) })}`
    : ' ');

  return (
    <div className="wrap lib">
      <header className="lib-head">
        <div className="lib-head-text">
          <div className="kick">{name ? t('greet', { name }) : t('kicker')}</div>
          <h1 className="h1">{t('title')}</h1>
          {!!list.length && <p className="lede">{t('sub')}</p>}
        </div>
        {!!list.length && (
          <Link to="/start?new=1" className="btn btn-primary"><Icon name="plus" size={16} />{t('newBook')}</Link>
        )}
      </header>

      {!loading && !list.length && (
        <EmptyState art={<ShelfArt />} title={t('emptyTitle')} body={t('emptyBody')} className="lib-empty">
          <div className="lib-empty-actions">
            <Link to="/start?new=1" className="btn btn-primary btn-lg"><Icon name="plus" size={16} />{t('newBook')}</Link>
            <button type="button" className="btn btn-ghost btn-lg" onClick={addSample} disabled={adding}><Icon name="book" size={16} />{t('sample')}</button>
          </div>
        </EmptyState>
      )}

      {!!list.length && (
        <div className="lib-layout">
          <div className="lib-main">
            {current && <DeskBook book={current} stats={stats?.[current.id]} />}

            <section className="lib-shelf" aria-labelledby="lib-shelf-h">
              <div className="lib-shelf-head">
                <h2 id="lib-shelf-h" className="h2">{t('shelfTitle')}</h2>
                <span className="lib-count">{list.length === 1 ? t('countOne') : t('count', { n: fmtNumber(list.length, lang) })}</span>
              </div>
              <ul className="lib-grid" aria-label={t('shelf')}>
                {list.map((b) => {
                  const s = stats?.[b.id];
                  const title = b.title || c('untitled');
                  const deva = isDevanagari(b.title);
                  return (
                    <li key={b.id} className="lib-book">
                      <div className="lib-slot">
                        <Link to={`/app/b/${b.id}`} className="lib-coverlink" aria-label={`${c('actions.open')}: ${title}`}>
                          <CoverArt title={title} author={b.author} subtitle={b.subtitle} spec={b.cover ?? DEFAULT_COVER} deva={deva || isDevanagari(b.author)} width={240} />
                        </Link>
                      </div>
                      <div className="lib-info">
                        <Link to={`/app/b/${b.id}`} className={`lib-title${deva ? ' is-deva' : ''}`}>{title}</Link>
                        <div className="lib-meta">{c(`bookTypes.${b.type}`)} · {c(`stages.${b.stage}`)}</div>
                        <div className="lib-stats num">{statLine(s)}</div>
                        <div className="lib-when"><Icon name="clock" size={13} />{t('edited', { when: fmtRelative(b.updatedAt, lang) })}</div>
                      </div>
                      <div className="lib-actions">
                        <Link to={`/app/b/${b.id}`} className="btn btn-ghost btn-sm">{t('open')}</Link>
                        <button type="button" className="btn btn-quiet btn-icon lib-del" onClick={() => setToDelete(b)} aria-label={`${t('deleteBook')}: ${title}`} title={t('deleteBook')}>
                          <Icon name="trash" size={17} />
                        </button>
                      </div>
                    </li>
                  );
                })}
                <li className="lib-book lib-book-new">
                  <div className="lib-slot">
                    <Link to="/start?new=1" className="lib-new">
                      <span className="lib-new-plus" aria-hidden="true"><Icon name="plus" size={22} /></span>
                      <span className="lib-new-label">{t('newBook')}</span>
                      <span className="lib-new-hint">{t('newHint')}</span>
                    </Link>
                  </div>
                </li>
              </ul>
            </section>
          </div>

          <RecentLaps laps={laps ?? []} books={list} />
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={t('deleteTitle')}
        body={t('deleteBody', { title: toDelete?.title || c('untitled') })}
        typeToConfirm={toDelete?.title.trim() ? toDelete.title.trim() : 'DELETE'}
        typeLabel={toDelete?.title.trim() ? t('deleteType') : t('deleteTypeUntitled')}
        confirmLabel={t('deleteConfirm')}
        onConfirm={async () => { if (toDelete) await remove(toDelete); }}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

/** The book on the desk, presented in the study colours with its numbers and one way back in. */
function DeskBook({ book, stats }: { book: Book; stats?: { words: number; chapters: number } }) {
  const t = useT('library');
  const c = useT('common');
  const { lang } = useLang();
  const title = book.title || c('untitled');
  const deva = isDevanagari(book.title);
  return (
    <section className="lib-desk" aria-labelledby="lib-desk-h">
      <Link to={`/app/b/${book.id}`} className="lib-desk-cover" tabIndex={-1} aria-hidden="true">
        <CoverArt title={title} author={book.author} subtitle={book.subtitle} spec={book.cover ?? DEFAULT_COVER} deva={deva || isDevanagari(book.author)} width={150} />
      </Link>
      <div className="lib-desk-text">
        <div className="lib-desk-kick">{t('onDesk')}</div>
        <h2 id="lib-desk-h" className={`lib-desk-title${deva ? ' is-deva' : ''}`}>{title}</h2>
        {book.author && <div className={`lib-desk-by${isDevanagari(book.author) ? ' is-deva' : ''}`}>{book.author}</div>}
        <dl className="lib-desk-stats">
          <div><dt>{t('statWords')}</dt><dd className="num">{stats ? fmtNumber(stats.words, lang) : '—'}</dd></div>
          <div><dt>{t('statChapters')}</dt><dd className="num">{stats ? fmtNumber(stats.chapters, lang) : '—'}</dd></div>
          <div><dt>{t('statStage')}</dt><dd className="lib-desk-stage">{c(`stages.${book.stage}`)}</dd></div>
        </dl>
        <div className="lib-desk-actions">
          <Link to={`/app/b/${book.id}`} className="btn btn-brass"><Icon name="feather" size={16} />{t('continue')}</Link>
          <span className="lib-desk-when">{t('lastOpened', { when: fmtRelative(book.updatedAt, lang) })}</span>
        </div>
      </div>
    </section>
  );
}

/** A steady colour per book, so the same book always wears the same chip.
 *  Books are numbered by when they were started (so the first six never share a colour); a stray id falls back to a hash. */
function bookHues(books: Book[]): (id: string) => string {
  const order = new Map([...books].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((b, i) => [b.id, i]));
  return (id) => {
    let n = order.get(id);
    if (n === undefined) { n = 0; for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0; }
    return `var(--hue-${(n % 6) + 1})`;
  };
}

const MAX_RECENT = 6;
const MAX_TAGS = 2;

/** The latest Laps from every book: an ochre notepad holding one small index card per idea. */
function RecentLaps({ laps, books }: { laps: Lap[]; books: Book[] }) {
  const t = useT('library');
  const c = useT('common');
  const { lang } = useLang();
  const capture = useCapture();
  const titles = new Map(books.map((b) => [b.id, b.title || c('untitled')]));
  const hueOf = bookHues(books);
  const kept = laps
    .filter((l) => l.status !== 'discarded' && (l.text.trim() || l.title?.trim()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recent = kept.slice(0, MAX_RECENT);
  const more = kept.length - recent.length;
  return (
    <aside className="lib-pad" aria-labelledby="lib-pad-h">
      <div className="lib-pad-bind" aria-hidden="true" />
      <header className="lib-pad-head">
        <div className="lib-pad-titlerow">
          <h2 id="lib-pad-h" className="lib-pad-title">{t('recentLaps')}</h2>
          {kept.length > 0 && (
            <span className="lib-pad-count num" aria-label={t('lapCount', { n: fmtNumber(kept.length, lang) })}>{fmtNumber(kept.length, lang)}</span>
          )}
          <Link className="lib-pad-all" to="/app/laps">{t('allLaps')}<Icon name="arrow" size={14} /></Link>
        </div>
        <p className="lib-pad-hint">{t('recentLapsHint')}</p>
        <button type="button" className="btn btn-brass lib-pad-capture" onClick={() => capture.open()}>
          <Icon name="mic" size={16} />{t('capture')}
        </button>
      </header>

      {recent.length === 0 ? (
        <div className="lib-pad-empty">
          <p className="lib-pad-empty-line">{t('noLaps')}</p>
        </div>
      ) : (
        <ol className="lib-pad-cards">
          {recent.map((l) => <LapCard key={l.id} lap={l} bookTitle={l.bookId ? titles.get(l.bookId) : undefined} hue={l.bookId ? hueOf(l.bookId) : undefined} />)}
        </ol>
      )}

      {more > 0 && (
        <Link className="lib-pad-more" to="/app/laps">{t('moreLaps', { n: fmtNumber(more, lang) })}<Icon name="arrow" size={14} /></Link>
      )}
    </aside>
  );
}

/** One idea, one card: status and time on top, the title, a few lines of the words, then its book and tags. */
function LapCard({ lap, bookTitle, hue }: { lap: Lap; bookTitle?: string; hue?: string }) {
  const t = useT('library');
  const { lang } = useLang();
  const title = lap.title?.trim();
  const text = lap.text.trim();
  const used = lap.status === 'placed';
  const tags = lap.tags ?? [];
  const shown = tags.slice(0, MAX_TAGS);
  const href = lap.bookId && bookTitle ? `/app/b/${lap.bookId}/laps` : '/app/laps';
  return (
    <li className="lib-lap-li">
      <Link className={`lib-lap${title ? ' has-title' : ''}`} to={href}>
        <span className="lib-lap-top">
          <span className={`lib-lap-status ${used ? 'is-used' : 'is-waiting'}`}>
            <span className="lib-lap-dot" aria-hidden="true" />
            {used ? t('lapUsed') : t('lapWaiting')}
          </span>
          {lap.twist && <span className="lib-lap-twist"><Icon name="flag" size={11} />{t('lapTwist')}</span>}
          <span className="lib-lap-when">
            {lap.source === 'voice' && (
              <span className="lib-lap-mic" title={t('lapSpoken')}><Icon name="mic" size={12} /><span className="sr-only">{t('lapSpoken')}</span></span>
            )}
            {fmtRelative(lap.createdAt, lang)}
          </span>
        </span>
        {title && <span className={`lib-lap-title${isDevanagari(title) ? ' is-deva' : ''}`}>{title}</span>}
        {text && <span className={`lib-lap-text${isDevanagari(text) ? ' is-deva' : ''}`}>{text}</span>}
        <span className="lib-lap-chips">
          <span className={`lib-lap-book${bookTitle ? '' : ' is-loose'}`} style={bookTitle && hue ? { ['--bk' as string]: hue } : undefined}>
            <Icon name="book" size={12} />
            <span className={`lib-lap-book-name${isDevanagari(bookTitle ?? '') ? ' is-deva' : ''}`}>{bookTitle ?? t('lapNoBook')}</span>
          </span>
          {shown.map((tg) => <TagChip key={tagKey(tg)} tag={tg} />)}
          {tags.length > shown.length && <span className="lib-lap-moretags">+{fmtNumber(tags.length - shown.length, lang)}</span>}
        </span>
      </Link>
    </li>
  );
}
