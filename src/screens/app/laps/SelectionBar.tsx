import { useErrorNotice } from '@/components/Toast';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { MicOrb, LiveWave } from '@/components/voice';
import { chapterName } from '@/components/kit';
import { useT } from '@/i18n';
import type { BookLang, Chapter } from '@/data/types';
import { joinText } from '@/lib/text';
import { useLapDictation, voiceErrorKey } from './useLapDictation';

interface Props {
  n: number;
  chapters: Chapter[];
  bookLang?: BookLang;
  onUsed: (where: string, chapterId?: string) => void;
  onUnused: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/** Floating bar for selected Laps, in the study's colours. "Mark used" asks where, by voice, typing or a chapter. */
export function SelectionBar({ n, chapters, bookLang, onUsed, onUnused, onDelete, onClear }: Props) {
  const t = useT('laps');
  const c = useT('common');
  const [asking, setAsking] = useState(false);
  const [where, setWhere] = useState('');
  const [chapterId, setChapterId] = useState<string | undefined>();
  const d = useLapDictation({ bookLang, record: false });

  const chLabel = (ch: Chapter, i: number) => (ch.title.trim() ? `${c('chapterN', { n: i + 1 })} · ${ch.title.trim()}` : chapterName(ch, i, c));
  const pickChapter = (ch: Chapter, i: number) => {
    if (chapterId === ch.id) { setChapterId(undefined); return; }
    setChapterId(ch.id);
    const label = chLabel(ch, i);
    if (!where.trim() || chapters.some((x, j) => where === chLabel(x, j))) setWhere(label);
  };
  const speak = async () => {
    if (d.listening) {
      const { value } = await d.stop();
      if (value) setWhere((w) => joinText(w, value));
      d.reset();
    } else { d.reset(); void d.start(); }
  };
  const close = () => { if (d.listening) d.cancel(); d.reset(); setAsking(false); };
  const save = () => { onUsed(where, chapterId); close(); setWhere(''); setChapterId(undefined); };
  const err = voiceErrorKey(d.error);
  useErrorNotice(err ? t(err) : null);
  const shownWhere = d.listening ? joinText(where, d.shown) : where;

  return (
    <div className="lp-selbar rise" role="region" aria-label={t('select.n', { n })}>
      {asking && (
        <div className="lp-where rise">
          <p className="lp-where-h display">{t('select.whereTitle')}</p>
          <div className={`lp-where-row${d.listening ? ' is-listening' : ''}`}>
            <MicOrb tone="study" size={48} listening={d.listening} level={d.level} onClick={() => void speak()} label={d.listening ? t('select.stopWhere') : t('select.sayWhere')} />
            <div className="lp-where-field">
              <label htmlFor="lp-where-in" className="sr-only">{t('select.where')}</label>
              <input id="lp-where-in" className="lp-where-in book" value={shownWhere} readOnly={d.listening}
                placeholder={d.listening ? t('hero.listening') : t('select.wherePh')}
                onChange={(e) => setWhere(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } }} />
              {d.listening
                ? <span className="lp-where-live"><LiveWave active level={d.level} bars={20} height={16} barWidth={2} gap={2} color="var(--brass)" />{t('hero.listening')}</span>
                : <span className="lp-where-hint">{t('select.where')}</span>}
            </div>
          </div>
          {chapters.length > 0 && (
            <div className="lp-where-chs" role="group" aria-label={t('select.chapters')}>
              <span className="lp-where-k">{t('select.chapters')}</span>
              <div className="lp-where-chiprow">
                {chapters.map((ch, i) => (
                  <button key={ch.id} type="button" className="lp-darkchip" aria-pressed={chapterId === ch.id} onClick={() => pickChapter(ch, i)}>
                    <span className="lp-darkchip-n">{i + 1}</span>{ch.title.trim() || c('chapterN', { n: i + 1 })}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="lp-where-actions">
            <button type="button" className="lp-sbtn is-quiet" onClick={close}>{t('select.cancel')}</button>
            <button type="button" className="lp-sbtn is-brass" onClick={save}><Icon name="check" size={15} />{t('select.save')}</button>
          </div>
        </div>
      )}
      <div className="lp-selbar-row">
        <span className="lp-seln"><span className="lp-seln-n">{n}</span>{t('select.nLabel', { n })}</span>
        <div className="lp-selbar-actions">
          <button type="button" className="lp-sbtn is-brass" aria-expanded={asking} onClick={() => (asking ? close() : setAsking(true))}><Icon name="check" size={15} />{t('select.markUsed')}</button>
          <button type="button" className="lp-sbtn" onClick={onUnused}><Icon name="undo" size={15} />{t('select.markUnused')}</button>
          <button type="button" className="lp-sbtn is-danger" onClick={onDelete}><Icon name="trash" size={15} />{t('select.delete')}</button>
          <button type="button" className="lp-sbtn is-icon" onClick={onClear} aria-label={t('select.clear')} title={t('select.clear')}><Icon name="x" size={16} /></button>
        </div>
      </div>
    </div>
  );
}
