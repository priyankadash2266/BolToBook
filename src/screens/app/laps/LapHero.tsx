import { useErrorNotice } from '@/components/Toast';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { MicOrb, LiveWave } from '@/components/voice';
import { TabArt } from '@/components/TabArt';
import { useT } from '@/i18n';
import type { BookLang, Lap } from '@/data/types';
import { isDevanagari } from '@/lib/text';
import { parseLapCommand } from '@/lib/lapVoice';
import { useLapDictation, voiceErrorKey, type AudioTake } from './useLapDictation';
import { IntentLine, ParsedChips, SavedCheck } from './bits';

export type SubmitOutcome = { kind: 'created'; lap: Lap } | { kind: 'command' } | null;

interface Props {
  onSubmit: (text: string, source: 'voice' | 'typed', audio: AudioTake) => Promise<SubmitOutcome>;
  bookLang?: BookLang;
  /** Small line under the composer ("Saves to …"). */
  note?: string;
  /** No Laps yet: the panel doubles as the welcome. */
  empty?: boolean;
}

type Phase = 'idle' | 'listening' | 'saving' | 'saved';

/**
 * "Store ideas before they vanish": the one place to catch a thought on the Laps page.
 * One composer, two ways in: tap the orb and the words land in the field as you talk,
 * or type in the same field and press Enter. Both go through the same Lap commands.
 *
 * Layout (one grid): [orb | field] / [caption | helper row] / [· | hints + note].
 * On phones it stacks: orb + caption centred, then the field full width.
 */
export function LapHero({ onSubmit, bookLang, note, empty }: Props) {
  const t = useT('laps');
  const d = useLapDictation({ bookLang });
  const [phase, setPhase] = useState<Phase>('idle');
  const [typed, setTyped] = useState(()=>sessionStorage.getItem('dictationer.capture-draft')??'');
  const savingRef=useRef(false);
  useEffect(()=>{sessionStorage.setItem('dictationer.capture-draft',typed)},[typed]);
  const [saved, setSaved] = useState<Lap | null>(null);
  const [hints, setHints] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listening = d.listening || phase === 'listening';
  const live = listening || phase === 'saving';

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (d.error && phase === 'listening') setPhase('idle'); }, [d.error, phase]);

  const preview = useMemo(() => (d.shown.trim() ? parseLapCommand(d.shown) : null), [d.shown]);

  const finish = (out: SubmitOutcome) => {
    clearTimeout(timer.current);
    if (out?.kind === 'created') {
      setSaved(out.lap);
      setPhase('saved');
      timer.current = setTimeout(() => { setPhase('idle'); setSaved(null); }, 4200);
    } else setPhase('idle');
  };

  const start = () => {
    clearTimeout(timer.current);
    setSaved(null);
    d.reset();
    setPhase('listening');
    void d.start();
  };
  const stop = async () => {
    setPhase('saving');
    const { value, audio } = await d.stop();
    if (!value) { setPhase('idle'); return; }
    try{const out = await onSubmit(value, 'voice', audio);d.reset();if (!out) setTyped(value);finish(out);}
    catch{setTyped(value);setPhase('idle');}
  };
  const sendTyped = async () => {
    const v = typed.trim();
    if (!v || savingRef.current) return;
    savingRef.current=true;setPhase('saving');
    try{const out = await onSubmit(v, 'typed', null);if (out) setTyped('');finish(out);}
    catch{setPhase('idle');}finally{savingRef.current=false;}
  };

  const err = voiceErrorKey(d.error);
  useErrorNotice(err ? t(err) : null);
  const caption = phase === 'saving' ? t('hero.keeping') : listening ? t('hero.listening') : phase === 'saved' ? t('hero.saved') : t('hero.tap');
  const liveFont = isDevanagari(d.shown) ? 'deva-book' : 'book';
  const savedFont = saved && isDevanagari(saved.text + (saved.title ?? '')) ? 'deva-book' : 'book';
  const hasWords = live ? !!d.shown.trim() : !!typed.trim();

  return (
    <section className={`lap-hero${listening ? ' is-listening' : ''}${phase === 'saved' ? ' is-saved' : ''}${empty ? ' is-empty' : ''}`} aria-labelledby="lap-hero-h">
      <header className="lap-hero-head">
        <div className="lap-hero-text">
          <p className="lp-kicker">{t('hero.kicker')}</p>
          <h2 id="lap-hero-h" className="display lap-hero-h">{t('hero.title')}</h2>
          <p className="lap-hero-sub">{empty ? t('hero.firstLine') : t('hero.sub')}</p>
        </div>
        {empty && <TabArt id="laps" className="lap-hero-art" />}
      </header>

      <div className="lp-cap">
        {/* Speak: the orb, with its invitation centred under it. Never inside the field. */}
        <div className="lp-cap-orb">
          <MicOrb tone="lap" size={104} listening={listening} level={d.level} disabled={phase === 'saving'}
            onClick={listening ? () => void stop() : start} label={listening ? t('capture.stop') : t('capture.say')} />
        </div>
        <p className="lp-cap-caption" aria-hidden="true">
          {phase === 'saved' && <Icon name="check" size={14} />}{caption}
        </p>

        {/* The one field: live words while listening, the saved moment after, otherwise a place to type. */}
        <div className="lp-cap-field" aria-live="polite">
          {live ? (
            <div className={`lp-field is-live ${liveFont}${d.shown.trim() ? '' : ' is-empty'}`} role="status" aria-label={t('hero.fieldLabel')}>
              {phase==='saving' && typed ? typed : d.shown.trim()
                ? <>{d.text}{d.interim && <span className="lp-live-interim">{d.text && !/\s$/.test(d.text) ? ' ' : ''}{d.interim}</span>}</>
                : t('hero.wordsHere')}
            </div>
          ) : phase === 'saved' && saved ? (
            <div className="lp-field is-saved rise">
              <SavedCheck />
              <div className="lp-saved-body">
                <p className="lp-saved-h">{t('hero.savedLine')}</p>
                {saved.title && <p className={`lp-saved-title ${savedFont === 'deva-book' ? 'deva-book' : 'display'}`}>{saved.title}</p>}
                {!saved.title && saved.text && <p className={`lp-saved-text ${savedFont}`}>{saved.text}</p>}
                <ParsedChips tags={saved.tags ?? []} twist={saved.twist} />
              </div>
            </div>
          ) : (
            <>
              <label htmlFor="lp-typein" className="sr-only">{t('hero.fieldLabel')}</label>
              <textarea
                id="lp-typein"
                className={`lp-field lp-typein ${isDevanagari(typed) ? 'deva-book' : 'book'}`}
                rows={2}
                value={typed}
                placeholder={t('hero.typePh')}
                aria-describedby="lp-help"
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendTyped(); } }}
              />
            </>
          )}
        </div>

        {/* Helper row, on the field's left edge: what to do next, and the Keep button on the right. */}
        <div className="lp-cap-help" id="lp-help">
          <span className="lp-help-line">
            {live ? (
              <>
                <LiveWave active={d.listening} level={d.level} bars={24} height={18} barWidth={2} gap={2} color="var(--lap)" className="lp-help-wave" />
                <span>{phase === 'saving' ? t('hero.keeping') : t('hero.tapDone')}</span>
              </>
            ) : phase === 'saved' ? (
              <span>{t('hero.savedNote')}</span>
            ) : (
              <>
                <kbd className="lp-kbd" aria-hidden="true">↵</kbd>
                <span>{t('hero.enterHint')}</span>
                <span className="lp-help-more">· {t('hero.newLine')}</span>
              </>
            )}
          </span>
          {hasWords && phase !== 'saved' && (
            <button type="button" className="btn btn-lap btn-sm lp-keep" disabled={phase === 'saving'}
              onClick={() => (live ? void stop() : void sendTyped())}>
              <Icon name="check" size={15} />{t('capture.save')}
            </button>
          )}
        </div>

        <div className="lp-cap-extra">
          {live && preview && <IntentLine cmd={preview} />}

          <div className="lp-hintrow">
            <button type="button" className="lp-hintbtn" aria-expanded={hints} aria-controls="lp-hints" onClick={() => setHints((h) => !h)}>
              <Icon name={hints ? 'up' : 'down'} size={14} />{t('capture.hintToggle')}
            </button>
            {note && <span className="lp-capnote"><span className="lp-spine" aria-hidden="true" />{note}</span>}
          </div>
          {hints && (
            <div className="lp-hints rise" id="lp-hints">
              <ul>
                {(['create', 'append', 'find', 'used'] as const).map((k) => (
                  <li key={k}>
                    <span className="lp-hint-k">{t(`capture.exLabel.${k}`)}</span>
                    <q className="lp-hint-q">{t(`capture.ex.${k}`)}</q>
                  </li>
                ))}
              </ul>
              <p className="lp-hints-note">{t('capture.exNote')}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
