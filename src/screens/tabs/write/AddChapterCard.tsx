import { useRef, useState } from 'react';
import { api } from '@/data/api';
import { Icon } from '@/components/Icon';
import { LiveWave } from '@/components/voice';
import { VoiceTextarea } from '@/components/kit';
import { useT } from '@/i18n';
import { useVoiceLine } from './useVoiceLine';

/** The dashed "+ Add a chapter" card: a title (typed or said) and, if the author likes, what happens in it. */
export function AddChapterCard({ bookId, nextNumber, startOpen = false, deva, compact }: { bookId: string; nextNumber: number; startOpen?: boolean; deva: boolean; compact?: boolean }) {
  const t = useT('write');
  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceLine((w) => setTitle((cur) => (cur.trim() ? `${cur.trim()} ${w}` : w).replace(/[.।]$/, '')));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.chapters.create(bookId, { title: title.trim(), goal: goal.trim() || undefined });
      setAdded(title.trim() || t('add.untitled', { n: nextNumber }));
      setTitle(''); setGoal('');
      setTimeout(() => titleRef.current?.focus(), 30);
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" id="wr-add" className={`wr-add${compact ? ' is-compact' : ''}`} onClick={() => { setOpen(true); setTimeout(() => titleRef.current?.focus(), 40); }}>
        <span className="wr-add-plus" aria-hidden="true"><Icon name="plus" size={22} /></span>
        <span className="wr-add-text">
          <span className="wr-add-title">{t('add.cta')}</span>
          <span className="wr-add-sub">{t('add.sub', { n: nextNumber })}</span>
        </span>
      </button>
    );
  }

  return (
    <form id="wr-add" className={`wr-add is-open${compact ? ' is-compact' : ''}`} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="wr-card-head">
        <span className="wr-num"><span className="wr-num-k">{t('card.chapter')}</span><span className="wr-num-n">{nextNumber}</span></span>
        <button type="button" className="wr-tool" onClick={() => setOpen(false)} aria-label={t('add.close')}><Icon name="x" size={16} /></button>
      </div>
      <label htmlFor="wr-new-title" className="sr-only">{t('add.titleLabel')}</label>
      <div className={`wr-add-titlebox${voice.listening ? ' is-listening' : ''}`}>
        {voice.listening ? (
          <div className="wr-add-live" aria-live="polite">
            <LiveWave active level={voice.level} bars={16} height={22} barWidth={2} gap={2} color="var(--brand-2)" />
            <span className={deva ? 'deva-book' : ''}>{voice.said} <span className="live">{voice.interim}</span>{!voice.said && !voice.interim && <span className="wr-faint">{t('add.sayTitle')}</span>}</span>
          </div>
        ) : (
          <input
            id="wr-new-title"
            ref={titleRef}
            className={`wr-card-title${deva ? ' deva-book' : ''}`}
            value={title}
            placeholder={t('add.titlePh')}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
        )}
        <button type="button" className={`wr-ideaadd-mic${voice.listening ? ' is-on' : ''}`} onClick={voice.toggle} aria-pressed={voice.listening} aria-label={voice.listening ? t('ideas.stop') : t('add.speakTitle')}>
          {voice.listening ? <span className="wr-stop" aria-hidden="true" /> : <Icon name="mic" size={16} />}
        </button>
      </div>
      <VoiceTextarea id="wr-new-goal" label={t('add.goalLabel')} placeholder={t('outline.ph')} value={goal} onChange={setGoal} rows={3} />
      <div className="wr-add-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || voice.listening}><Icon name="plus" size={15} />{t('add.submit')}</button>
        {added && <span className="wr-added rise" role="status"><Icon name="check" size={13} weight={2.5} />{t('add.added', { name: added })}</span>}
      </div>
    </form>
  );
}
