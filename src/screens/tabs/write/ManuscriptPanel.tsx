import { Link } from 'react-router-dom';
import { bookPath } from '@/app/context';
import { Icon } from '@/components/Icon';
import { useT } from '@/i18n';
import { isDevanagari } from '@/lib/text';
import type { Chapter } from '@/data/types';

/** The quiet summary beside the free-writing page: how much is written, what has been sorted, where it went. */
export function ManuscriptPanel({ bookId, words, moved, chapters, deva, onClose }: {
  bookId: string;
  words: number;
  moved: number;
  chapters: Chapter[];
  deva: boolean;
  onClose?: () => void;
}) {
  const t = useT('write');
  const tc = useT('common');
  const max = Math.max(1, ...chapters.map((c) => c.wordCount));
  return (
    <aside className="ed-margin-inner ms-panel" aria-label={t('ms.panel')}>
      {onClose && (
        <button type="button" className="btn btn-quiet btn-icon btn-sm ed-margin-close" onClick={onClose} aria-label={t('ms.closePanel')}><Icon name="x" size={16} /></button>
      )}
      <section>
        <div className="kick">{t('ms.kicker')}</div>
        <div className="ms-stats">
          <div className="ms-stat">
            <span className="ms-stat-n">{words.toLocaleString()}</span>
            <span className="ms-stat-l">{words === 1 ? t('ms.wordOne') : t('ms.words')}</span>
          </div>
          <div className="ms-stat">
            <span className="ms-stat-n">{moved}</span>
            <span className="ms-stat-l">{moved === 1 ? t('ms.movedOne') : t('ms.moved')}</span>
          </div>
        </div>
        <p className="ms-how"><Icon name="file" size={14} />{t('ms.how')}</p>
      </section>

      <section>
        <div className="ms-chhead">
          <span className="kick">{t('ms.chapters')}</span>
          <Link to={bookPath(bookId, 'chapters')} className="ms-plan">{t('ms.plan')}</Link>
        </div>
        {chapters.length ? (
          <ol className="ms-chlist">
            {chapters.map((c, i) => (
              <li key={c.id}>
                <Link to={bookPath(bookId, 'write', c.id)} className="ms-ch">
                  <span className="ms-ch-n">{i + 1}</span>
                  <span className="ms-ch-text">
                    <span className={`ms-ch-t${c.title.trim() ? '' : ' is-ph'}${deva || isDevanagari(c.title) ? ' deva-book' : ''}`}>{c.title.trim() || tc('chapterN', { n: i + 1 })}</span>
                    <span className="ms-ch-bar" aria-hidden="true"><span style={{ width: `${Math.round((c.wordCount / max) * 100)}%` }} /></span>
                  </span>
                  <span className="ms-ch-w">{c.wordCount ? c.wordCount.toLocaleString() : '—'}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ed-margin-empty">{t('ms.noChapters')}</p>
        )}
      </section>
    </aside>
  );
}
