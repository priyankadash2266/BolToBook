import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/data/api';
import { bookPath } from '@/app/context';
import { Icon } from '@/components/Icon';
import { useDebouncedCallback } from '@/lib/hooks';
import { useT } from '@/i18n';
import { isDevanagari } from '@/lib/text';
import type { Chapter, ChapterStatus, Lap } from '@/data/types';
import { ChapterOutline } from './ChapterOutline';
import { ChapterIdeas } from './ChapterIdeas';

export const statusAfterDone = (c: Chapter): ChapterStatus =>
  c.content.trim() ? 'drafting' : ((c.goal ?? '').trim() || (c.notes ?? '').trim()) ? 'planned' : 'empty';

/** The chapter's title, edited in place (debounced save). Mount with key={chapter.id}. */
export function useChapterTitle(chapter: Chapter) {
  const [title, setTitle] = useState(chapter.title);
  const lastEdit = useRef(0);
  useEffect(() => { if (Date.now() - lastEdit.current > 2000) setTitle(chapter.title); }, [chapter.title]);
  const saver = useDebouncedCallback((id: string, v: string) => api.chapters.update(id, { title: v.trim() }), 600);
  return [title, (v: string) => { lastEdit.current = Date.now(); setTitle(v); saver.call(chapter.id, v); }, saver.flush] as const;
}

interface CardProps {
  bookId: string;
  chapter: Chapter;
  index: number;
  total: number;
  laps: Lap[];
  maxWords: number;
  deva: boolean;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  drag: {
    dragging: boolean;
    over: boolean;
    onStart: () => void;
    onOver: () => void;
    onDrop: () => void;
    onEnd: () => void;
  };
}

/** One chapter on the outline board: numeral, title, outline, chapter ideas, progress, and the way in. */
export function ChapterCard({ bookId, chapter: c, index, total, laps, maxWords, deva, onMove, onDelete, drag }: CardProps) {
  const t = useT('write');
  const tc = useT('common');
  const [title, setTitle, flush] = useChapterTitle(c);
  const [confirming, setConfirming] = useState(false);
  const ideas = laps.filter((l) => l.chapterId === c.id && l.status !== 'discarded').length;
  const pct = Math.round((c.wordCount / Math.max(1, maxWords)) * 100);
  const n = index + 1;
  const name = c.title.trim() || tc('chapterN', { n });

  return (
    <article
      className={`wr-card${drag.dragging ? ' is-dragging' : ''}${drag.over ? ' is-over' : ''}${c.status === 'done' ? ' is-done' : ''}`}
      aria-label={tc('chapterN', { n }) + (c.title.trim() ? ` · ${c.title.trim()}` : '')}
      onDragOver={(e) => { e.preventDefault(); drag.onOver(); }}
      onDrop={(e) => { e.preventDefault(); drag.onDrop(); }}
    >
      <header className="wr-card-head">
        <span className="wr-num"><span className="wr-num-k">{t('card.chapter')}</span><span className="wr-num-n">{n}</span></span>
        <span className="wr-card-tools">
          <span
            className="wr-grip"
            draggable
            role="img"
            aria-label={t('card.drag')}
            title={t('card.drag')}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', c.id);
              const card = (e.currentTarget as HTMLElement).closest('.wr-card');
              if (card) e.dataTransfer.setDragImage(card, 28, 28);
              drag.onStart();
            }}
            onDragEnd={drag.onEnd}
          >
            <Icon name="grip" size={16} />
          </span>
          <button type="button" className="wr-tool" onClick={() => onMove(-1)} disabled={index === 0} aria-label={t('card.up', { name })} title={t('card.upShort')}><Icon name="up" size={16} /></button>
          <button type="button" className="wr-tool" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={t('card.down', { name })} title={t('card.downShort')}><Icon name="down" size={16} /></button>
          <button type="button" className="wr-tool wr-tool-del" onClick={() => (c.wordCount > 0 ? setConfirming(true) : onDelete())} aria-label={t('card.delete', { name })} title={t('card.deleteShort')}><Icon name="trash" size={15} /></button>
        </span>
      </header>

      {confirming && (
        <div className="wr-confirm rise" role="alertdialog" aria-label={t('card.deleteShort')}>
          <p>{t('card.confirm', { name, n: c.wordCount.toLocaleString() })}</p>
          <span className="wr-confirm-actions">
            <button type="button" className="btn btn-danger btn-sm" autoFocus onClick={() => { setConfirming(false); onDelete(); }}>{t('card.confirmYes')}</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirming(false)}>{tc('actions.cancel')}</button>
          </span>
        </div>
      )}

      <label htmlFor={`wr-title-${c.id}`} className="sr-only">{t('card.titleLabel', { n })}</label>
      <input
        id={`wr-title-${c.id}`}
        className={`wr-card-title${deva || isDevanagari(title) ? ' deva-book' : ''}`}
        value={title}
        placeholder={t('card.titlePh')}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={flush}
        autoComplete="off"
      />

      <div className="wr-card-sec">
        <div className="wr-kick">{t('outline.kicker')}</div>
        <ChapterOutline key={c.id} chapter={c} rows={3} hideLabel />
      </div>

      <div className="wr-card-sec">
        <div className="wr-kick wr-kick-lap">{t('ideas.kicker')}{ideas ? <span className="wr-count">{ideas}</span> : null}</div>
        <ChapterIdeas bookId={bookId} chapterId={c.id} laps={laps} deva={deva} limit={3} quiet />
      </div>

      <footer className="wr-card-foot">
        <div className="wr-progress">
          <div className="wr-progress-top">
            <span className="wr-words">{c.wordCount === 1 ? t('card.wordOne') : t('card.words', { n: c.wordCount.toLocaleString() })}</span>
            <button
              type="button"
              className={`wr-status wr-status-${c.status}`}
              aria-pressed={c.status === 'done'}
              title={c.status === 'done' ? t('card.markOpen') : t('card.markDone')}
              onClick={() => { void api.chapters.update(c.id, { status: c.status === 'done' ? statusAfterDone(c) : 'done' }); }}
            >
              {c.status === 'done' && <Icon name="check" size={12} weight={3} />}{t(`status.${c.status}`)}
            </button>
          </div>
          <span className="wr-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
        </div>
        <Link to={bookPath(bookId, 'write', c.id)} className="btn btn-primary btn-sm wr-open"><Icon name="feather" size={15} />{c.wordCount ? t('card.continue') : t('card.open')}</Link>
      </footer>
    </article>
  );
}

/** One line per chapter, for seeing the whole book at a glance. */
export function ChapterRow({ bookId, chapter: c, index, total, laps, deva, onMove }: Omit<CardProps, 'maxWords' | 'onDelete' | 'drag'>) {
  const t = useT('write');
  const tc = useT('common');
  const ideas = laps.filter((l) => l.chapterId === c.id && l.status !== 'discarded').length;
  const n = index + 1;
  const name = c.title.trim() || tc('chapterN', { n });
  const outline = (c.goal ?? '').trim();
  return (
    <li className={`wr-row${c.status === 'done' ? ' is-done' : ''}`}>
      <span className="wr-row-n">{n}</span>
      <Link to={bookPath(bookId, 'write', c.id)} className="wr-row-main">
        <span className={`wr-row-t${c.title.trim() ? '' : ' is-ph'}${deva || isDevanagari(c.title) ? ' deva-book' : ''}`}>{name}</span>
        <span className={`wr-row-o${deva || isDevanagari(outline) ? ' deva-book' : ' book'}`}>{outline || t('card.noOutline')}</span>
      </Link>
      <span className="wr-row-meta">
        {ideas > 0 && <span className="wr-row-ideas" title={t('ideas.kicker')}><Icon name="bookmark" size={13} />{ideas}</span>}
        <span className="wr-row-w">{c.wordCount ? c.wordCount.toLocaleString() : '—'}</span>
        <span className={`wr-status wr-status-${c.status} is-static`}>{t(`status.${c.status}`)}</span>
      </span>
      <span className="wr-row-tools">
        <button type="button" className="wr-tool" onClick={() => onMove(-1)} disabled={index === 0} aria-label={t('card.up', { name })}><Icon name="up" size={16} /></button>
        <button type="button" className="wr-tool" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={t('card.down', { name })}><Icon name="down" size={16} /></button>
      </span>
    </li>
  );
}
