import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { VoiceTextarea } from '@/components/kit';
import { AudioWave } from '@/components/voice';
import { useT } from '@/i18n';
import { api } from '@/data/api';
import type { Book, Chapter, Lap, LapTag, LapTagType } from '@/data/types';
import { useDebouncedCallback } from '@/lib/hooks';
import { isDevanagari } from '@/lib/text';
import { LAP_TAG_TYPES, tagKey } from '@/lib/lapVoice';
import { TagChip, isUnused, isUsed } from './bits';

interface Props {
  lap: Lap;
  /** "2:14 pm", "Tue, 4:10 pm" … */
  when: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onDelete: () => void;
  chapters: Chapter[];
  /** Global view: the books, for the book chip and move. */
  books?: Book[];
  highlight?: boolean;
}

/** One Lap as an index card on ruled paper. The whole text is always shown. */
export function LapCard({ lap, when, open, onOpen, onClose, selected, onSelect, onDelete, chapters, books, highlight }: Props) {
  const t = useT('laps');
  const c = useT('common');
  const ref = useRef<HTMLLIElement>(null);
  const deva = isDevanagari(lap.text + (lap.title ?? ''));
  const font = deva ? 'deva-book' : 'book';
  const book = books?.find((b) => b.id === lap.bookId);
  const chIdx = lap.chapterId ? chapters.findIndex((ch) => ch.id === lap.chapterId) : -1;
  const usedLabel = lap.usedWhere?.trim()
    || (chIdx >= 0 ? `${c('chapterN', { n: chIdx + 1 })}${chapters[chIdx].title ? ` · ${chapters[chIdx].title}` : ''}` : '');
  const waiting = isUnused(lap);
  const used = isUsed(lap);

  useEffect(() => { if (highlight) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [highlight]);

  const cls = ['lp-card', open && 'is-open', selected && 'is-selected', used && 'is-used', waiting && 'is-waiting',
    lap.status === 'discarded' && 'is-discarded', highlight && 'is-highlight', lap.twist && 'has-twist'].filter(Boolean).join(' ');

  return (
    <li ref={ref} className={cls}>
      {lap.twist && <span className="lp-ribbon" aria-hidden="true" />}
      <div className="lp-card-top">
        <label className="lp-check">
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
          <span className="sr-only">{t('card.select')}{lap.title ? `: ${lap.title}` : ''}</span>
        </label>
        <div className="lp-card-info">
          <span className="lp-meta">
            <Icon name={lap.source === 'voice' ? 'mic' : 'type'} size={13} />
            <span>{t(`card.${lap.source}`)}</span>
            <span className="lp-meta-dot" aria-hidden="true" />
            <span>{when}</span>
          </span>
          {waiting && <span className="lp-waiting"><span className="lp-waiting-dot" aria-hidden="true" />{t('card.waiting')}</span>}
          {lap.twist && <span className="lp-twistlabel">{t('card.twist')}</span>}
          {lap.status === 'discarded' && <span className="tag">{t('card.discarded')}</span>}
          {books && (
            lap.bookId
              ? <Link className="lp-bookchip" to={`/app/b/${lap.bookId}/laps`} title={t('card.openBook')}><span className="lp-spine" aria-hidden="true" />{book ? book.title || c('untitled') : t('noBook')}</Link>
              : <span className="lp-bookchip is-none">{t('noBook')}</span>
          )}
        </div>
        <span className="lp-card-tools">
          {!open && <button type="button" className="lp-iconbtn" onClick={onOpen} aria-label={t('card.edit')} title={t('card.edit')}><Icon name="pen" size={15} /></button>}
        </span>
      </div>

      {open ? (
        <LapEditor lap={lap} books={books} onClose={onClose} onDelete={onDelete} />
      ) : (
        <div className="lp-card-body" onClick={(e) => { if (!window.getSelection()?.toString() && !(e.target as HTMLElement).closest('a,button,.aw')) onOpen(); }}>
          {lap.title && <h3 className={`lp-title ${deva ? 'deva-book' : 'display'}`}>{lap.title}</h3>}
          {lap.text && <p className={`lp-text ${font}`}>{lap.text}</p>}
          {lap.audioId && (
            <div className="lp-audio">
              <AudioWave audioId={lap.audioId} tone="lap" bars={44} playLabel={t('card.play')} pauseLabel={t('card.pause')} />
            </div>
          )}
          {((lap.tags?.length ?? 0) > 0 || used) && (
            <div className="lp-card-foot">
              {(lap.tags?.length ?? 0) > 0 && <div className="lp-tags">{lap.tags!.map((tg) => <TagChip key={tagKey(tg)} tag={tg} />)}</div>}
              {used && (
                <p className="lp-stamp"><Icon name="check" size={14} /><span>{usedLabel ? t('card.usedIn', { where: usedLabel }) : t('card.used')}</span></p>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function LapEditor({ lap, books, onClose, onDelete }: { lap: Lap; books?: Book[]; onClose: () => void; onDelete: () => void }) {
  const t = useT('laps');
  const c = useT('common');
  const [title, setTitle] = useState(lap.title ?? '');
  const [text, setText] = useState(lap.text);
  const [tags, setTags] = useState<LapTag[]>(lap.tags ?? []);
  const [twist, setTwist] = useState(!!lap.twist);
  const [tagType, setTagType] = useState<LapTagType>('character');
  const [tagName, setTagName] = useState('');
  const saver = useDebouncedCallback((patch: Partial<Lap>) => api.laps.update(lap.id, patch), 600);
  const deva = isDevanagari(lap.text + (lap.title ?? ''));
  const pending = useRef<Partial<Lap>>({});
  const queue = (patch: Partial<Lap>) => { pending.current = { ...pending.current, ...patch }; saver.call(pending.current); };

  const addTag = () => {
    const name = tagName.trim();
    if (!name) return;
    const next = [...tags.filter((x) => tagKey(x) !== tagKey({ type: tagType, name })), { type: tagType, name }];
    setTags(next); setTagName(''); queue({ tags: next });
  };
  const removeTag = (k: string) => { const next = tags.filter((x) => tagKey(x) !== k); setTags(next); queue({ tags: next }); };
  const done = () => { saver.flush(); pending.current = {}; onClose(); };

  return (
    <div className="lp-editor rise">
      <div className="field">
        <label className="label" htmlFor={`lp-t-${lap.id}`}>{t('edit.title')}</label>
        <input id={`lp-t-${lap.id}`} className={`input lp-edit-title ${deva ? 'deva-book' : 'display'}`} value={title} placeholder={t('edit.titlePh')}
          onChange={(e) => { setTitle(e.target.value); queue({ title: e.target.value.trim() || undefined }); }} />
      </div>
      <VoiceTextarea id={`lp-d-${lap.id}`} label={t('edit.desc')} value={text} placeholder={t('edit.descPh')} rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
        onChange={(v) => { setText(v); queue({ text: v }); }} />
      <div className="lp-tagedit">
        <span className="label" id={`lp-tg-${lap.id}`}>{t('edit.tags')}</span>
        {tags.length > 0 && <div className="lp-tags">{tags.map((tg) => <TagChip key={tagKey(tg)} tag={tg} onRemove={() => removeTag(tagKey(tg))} />)}</div>}
        <div className="lp-tagadd" role="group" aria-labelledby={`lp-tg-${lap.id}`}>
          <label className="sr-only" htmlFor={`lp-tt-${lap.id}`}>{t('edit.tagType')}</label>
          <select id={`lp-tt-${lap.id}`} className="select" value={tagType} onChange={(e) => setTagType(e.target.value as LapTagType)}>
            {LAP_TAG_TYPES.map((ty) => <option key={ty} value={ty}>{t(`tagTypes.${ty}`)}</option>)}
          </select>
          <label className="sr-only" htmlFor={`lp-tn-${lap.id}`}>{t('edit.tagName')}</label>
          <input id={`lp-tn-${lap.id}`} className="input" value={tagName} placeholder={t('edit.tagNamePh')} onChange={(e) => setTagName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTag(); } }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addTag} disabled={!tagName.trim()}><Icon name="plus" size={15} />{t('edit.addTag')}</button>
        </div>
      </div>
      <div className="lp-editor-row">
        <button type="button" className="lp-twisttoggle" aria-pressed={twist} onClick={() => { setTwist(!twist); queue({ twist: !twist }); }}>
          <Icon name={twist ? 'check' : 'flag'} size={13} />{t('edit.twist')}
        </button>
        {books && books.length > 0 && (
          <label className="lp-movebook">
            <span>{t('edit.book')}</span>
            <select className="select" value={lap.bookId ?? ''} onChange={(e) => api.laps.update(lap.id, { bookId: e.target.value || undefined, chapterId: undefined })}>
              <option value="">{t('noBook')}</option>
              {books.map((b) => <option key={b.id} value={b.id}>{b.title || c('untitled')}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="lp-editor-actions">
        <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}><Icon name="trash" size={15} />{t('edit.delete')}</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={done}><Icon name="check" size={15} />{t('card.done')}</button>
      </div>
    </div>
  );
}
