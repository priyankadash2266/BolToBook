import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useT } from '@/i18n';
import { bookPath } from '@/app/context';
import { isDevanagari, toParagraphs } from '@/lib/text';
import { plainOf } from '@/lib/markdown';
import type { Chapter, Entity, Lap } from '@/data/types';
import { ChapterOutline } from '@/screens/tabs/write/ChapterOutline';
import { ChapterIdeas } from '@/screens/tabs/write/ChapterIdeas';

interface Props {
  bookId: string;
  chapter: Chapter;
  prev?: Chapter;
  laps: Lap[];
  entities: Entity[];
  deva: boolean;
  onClose?: () => void;
}

const KIND_ICON: Record<string, 'users' | 'globe' | 'bookmark'> = { character: 'users', person: 'users', place: 'globe' };

/** Beside the page: this chapter's outline and ideas first (the plan), then who is in it, then where the last chapter ended. */
export function Margin({ bookId, chapter, prev, laps, entities, deva, onClose }: Props) {
  const t = useT('editor');
  const prevLast = prev ? toParagraphs(prev.content).map(plainOf).filter((x) => x.trim()).pop() : undefined;
  const ideas = laps.filter((l) => l.chapterId === chapter.id && l.status !== 'discarded');

  return (
    <aside className="ed-margin-inner" aria-label={t('margin.label')}>
      {onClose && (
        <button type="button" className="btn btn-quiet btn-icon btn-sm ed-margin-close" onClick={onClose} aria-label={t('margin.close')}><Icon name="x" size={16} /></button>
      )}
      <section className="ed-mg-plan">
        <div className="kick ed-mg-kick">{t('margin.goal')}</div>
        <ChapterOutline key={chapter.id} chapter={chapter} rows={3} hideLabel className="ed-mg-outline" />
      </section>

      <section>
        <div className="kick ed-mg-kick ed-mg-kick-lap">{t('margin.laps')}{ideas.length ? <span className="ed-mg-count">{ideas.length}</span> : null}</div>
        <ChapterIdeas bookId={bookId} chapterId={chapter.id} laps={laps} deva={deva} />
      </section>

      <section>
        <div className="kick">{t('margin.people')}</div>
        {entities.length ? (
          <div className="ed-chips">
            {entities.map((e) => (
              <Link key={e.id} className="chip" to={bookPath(bookId, e.kind === 'place' ? 'world' : e.kind === 'event' ? 'timeline' : 'characters')}>
                <span className={`ed-ent-dot ed-ent-${KIND_ICON[e.kind] ? e.kind : 'other'}`} aria-hidden="true">{e.name.trim().charAt(0).toUpperCase()}</span>
                <span className={isDevanagari(e.name) ? 'deva-ui' : ''}>{e.name}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="ed-margin-empty">{t('margin.peopleEmpty')}</p>
        )}
      </section>

      <section>
        <div className="kick">{t('margin.prev')}</div>
        {!prev ? (
          <p className="ed-margin-empty">{t('margin.prevNone')}</p>
        ) : prevLast ? (
          <Link to={bookPath(bookId, 'write', prev.id)} className={`ed-prev ${deva || isDevanagari(prevLast) ? 'deva-book' : 'book'}`}>
            {prevLast.length > 420 ? '…' + prevLast.slice(-420).replace(/^\S*\s/, '') : prevLast}
          </Link>
        ) : (
          <p className="ed-margin-empty">{t('margin.prevEmpty')}</p>
        )}
      </section>
    </aside>
  );
}
