import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/data/api';
import { bookPath } from '@/app/context';
import { AudioWave, LiveWave } from '@/components/voice';
import { Icon } from '@/components/Icon';
import { useToast, useErrorNotice } from '@/components/Toast';
import { useLang, useT } from '@/i18n';
import { fmtRelative } from '@/lib/format';
import { isDevanagari } from '@/lib/text';
import type { Lap } from '@/data/types';
import { useVoiceLine } from './useVoiceLine';

/** Ideas kept for one chapter: Laps with this chapterId. Add one by voice or by typing, right here. */
export function ChapterIdeas({ bookId, chapterId, laps, deva, limit, quiet }: {
  bookId: string;
  chapterId: string;
  laps: Lap[];
  deva: boolean;
  /** Show only the newest few, with "show all". */
  limit?: number;
  /** Smaller add row (cards on the board). */
  quiet?: boolean;
}) {
  const t = useT('write');
  const toast = useToast();
  const { lang } = useLang();
  const [all, setAll] = useState(false);
  const ideas = laps.filter((l) => l.chapterId === chapterId && l.status !== 'discarded').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const shown = limit && !all ? ideas.slice(-limit) : ideas;
  const hidden = ideas.length - shown.length;

  const sendBack = (l: Lap) => {
    void api.laps.update(l.id, { chapterId: undefined, status: 'inbox' }).then(() => {
      toast.show(t('ideas.sentBack'), { label: t('undo'), onClick: () => { void api.laps.update(l.id, { chapterId, status: 'placed' }); } }, 6000);
    });
  };

  return (
    <div className="wr-ideas">
      {hidden > 0 && (
        <button type="button" className="wr-ideas-more" onClick={() => setAll(true)}>{t('ideas.showAll', { n: ideas.length })}</button>
      )}
      {shown.length > 0 && (
        <ul className="wr-ideas-list">
          {shown.map((l) => (
            <li key={l.id} className="wr-idea">
              <p className={deva || isDevanagari(l.text) ? 'deva-book' : 'book'}>{l.title ? <strong>{l.title}. </strong> : null}{l.text}</p>
              {l.audioId && <AudioWave audioId={l.audioId} bars={32} playLabel={t('ideas.play')} pauseLabel={t('ideas.pause')} className="wr-idea-wave" />}
              <div className="wr-idea-foot">
                <span className="wr-idea-meta">{l.source === 'voice' ? t('ideas.spoken') : t('ideas.typed')} · {fmtRelative(l.createdAt, lang)}</span>
                <span className="wr-idea-actions">
                  <Link className="wr-idea-link" to={`${bookPath(bookId, 'laps')}?lap=${l.id}`}>{t('ideas.open')}</Link>
                  <button type="button" className="wr-idea-link" onClick={() => sendBack(l)}>{t('ideas.sendBack')}</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <IdeaAdd bookId={bookId} chapterId={chapterId} deva={deva} quiet={quiet} empty={!ideas.length} />
    </div>
  );
}

function IdeaAdd({ bookId, chapterId, deva, quiet, empty }: { bookId: string; chapterId: string; deva: boolean; quiet?: boolean; empty: boolean }) {
  const t = useT('write');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async (words: string, source: 'voice' | 'typed') => {
    const v = words.trim();
    if (!v) return;
    setBusy(true);
    try { await api.laps.create({ bookId, chapterId, text: v, source }); } finally { setBusy(false); }
  };
  const voice = useVoiceLine((words) => { void add(words, 'voice'); });
  useErrorNotice(voice.error);
  const fid = `wr-idea-${chapterId}`;

  return (
    <form className={`wr-ideaadd${quiet ? ' is-quiet' : ''}${voice.listening ? ' is-listening' : ''}`} onSubmit={(e) => { e.preventDefault(); void add(text, 'typed').then(() => setText('')); }}>
      <label htmlFor={fid} className="sr-only">{t('ideas.addLabel')}</label>
      {voice.listening ? (
        <div className="wr-ideaadd-live" aria-live="polite">
          <LiveWave active level={voice.level} bars={18} height={20} barWidth={2} gap={2} color="var(--lap)" />
          <span className={`wr-ideaadd-said ${deva ? 'deva-book' : 'book'}`}>
            {voice.said || voice.interim ? <>{voice.said} <span className="live">{voice.interim}</span></> : <span className="wr-faint">{t('ideas.listening')}</span>}
          </span>
        </div>
      ) : (
        <input
          id={fid}
          className={`wr-ideaadd-input ${deva ? 'deva-book' : 'book'}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={empty ? t('ideas.phFirst') : t('ideas.ph')}
          autoComplete="off"
        />
      )}
      {text.trim() && !voice.listening ? (
        <button type="submit" className="btn btn-sm wr-ideaadd-go" disabled={busy}><Icon name="plus" size={15} />{t('ideas.add')}</button>
      ) : (
        <button
          type="button"
          className={`wr-ideaadd-mic${voice.listening ? ' is-on' : ''}`}
          onClick={voice.toggle}
          aria-pressed={voice.listening}
          aria-label={voice.listening ? t('ideas.stop') : t('ideas.speak')}
          title={voice.supported ? undefined : voice.error ?? undefined}
        >
          {voice.listening ? <span className="wr-stop" aria-hidden="true" /> : <Icon name="mic" size={16} />}
        </button>
      )}
    </form>
  );
}
