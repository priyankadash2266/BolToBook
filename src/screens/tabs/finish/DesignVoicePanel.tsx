import { useErrorNotice } from '@/components/Toast';
import { useEffect, useRef, useState } from 'react';
import { useT, useDict } from '@/i18n';
import { Icon } from '@/components/Icon';
import { LiveWave, MicOrb } from '@/components/voice';
import { createDictationEngine, speechSupported, useMicLevel } from '@/lib/speech';

export type VoiceOutcome = { ok: true; chip: string } | { ok: false; reason: 'unknown' | 'noSelection' | 'noChapter' | 'style' };

interface Heard { id: number; said: string; out: VoiceOutcome }

interface Props {
  locale: string;
  /** Understand and apply one spoken (or typed) design command. */
  run: (text: string) => VoiceOutcome;
  onUndo: () => void;
  canUndo: boolean;
  disabled?: boolean;
}

/** Design by voice: speak a layout change, see what was understood, undo it in one tap. */
export function DesignVoice({ locale, run, onUndo, canUndo, disabled }: Props) {
  const t = useT('finish');
  const examples = useDict<Record<string, string>>('finish', 'design.voice.examples') ?? {};
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [heard, setHeard] = useState<Heard[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useErrorNotice(err);
  const [typed, setTyped] = useState('');
  const [showEx, setShowEx] = useState(false);
  const engine = useRef(createDictationEngine());
  const runRef = useRef(run);
  runRef.current = run;
  const seq = useRef(0);
  const level = useMicLevel(listening);
  useEffect(() => () => engine.current.abort(), []);
  useEffect(() => { if (disabled && listening) { engine.current.stop(); setListening(false); } }, [disabled, listening]);

  const take = (said: string) => {
    const text = said.trim();
    if (!text) return;
    const out = runRef.current(text);
    setHeard((h) => [{ id: ++seq.current, said: text, out }, ...h].slice(0, 3));
    if (!out.ok) setShowEx(true);
  };

  const start = () => {
    setErr(null);
    engine.current.start(locale, {
      onInterim: setInterim,
      onFinal: (f) => { setInterim(''); take(f); },
      onState: (s) => setListening(s === 'listening' || s === 'starting'),
      onError: (e) => { setErr(e === 'unsupported' ? t('design.voice.unsupported') : e === 'not-allowed' ? t('design.voice.denied') : t('design.voice.error')); setListening(false); },
    });
  };
  const stop = () => { engine.current.stop(); setListening(false); setInterim(''); };
  const supported = speechSupported();
  const last = heard[0];
  const exList = Object.values(examples);

  return (
    <section className={`gn-voice${listening ? ' is-on' : ''}`} aria-label={t('design.voice.title')}>
      <div className="gn-voice-head">
        <MicOrb listening={listening} level={level} onClick={listening ? stop : start} size={48} tone="brand" disabled={disabled || !supported}
          label={listening ? t('design.voice.stop') : t('design.voice.start')} />
        <div className="gn-voice-text">
          <span className="gn-voice-kick">{t('design.voice.title')}</span>
          {listening ? (
            <span className="gn-voice-live" aria-live="polite">
              <LiveWave active level={level} bars={22} height={18} barWidth={2} gap={2} color="var(--brand-2)" />
              <span>{interim ? <q className="gn-voice-words">{interim}</q> : t('design.voice.listening')}</span>
            </span>
          ) : (
            <span className="gn-voice-invite">{supported ? t('design.voice.invite') : t('design.voice.unsupported')}</span>
          )}
        </div>
      </div>

      {last && (
        <div className={`gn-voice-result${last.out.ok ? '' : ' is-miss'}`} role="status" aria-live="polite">
          <span className="gn-voice-said">“{last.said}”</span>
          {last.out.ok ? (
            <span className="gn-voice-chiprow">
              <span className="gn-chip"><Icon name="check" size={13} />{last.out.chip}</span>
              <button type="button" className="gn-voice-undo" onClick={onUndo} disabled={!canUndo}><Icon name="undo" size={13} />{t('design.undo')}</button>
            </span>
          ) : (
            <span className="gn-voice-miss">{t(`design.voice.miss.${last.out.reason}`)}</span>
          )}
        </div>
      )}

      <form className="gn-voice-type" onSubmit={(e) => { e.preventDefault(); take(typed); setTyped(''); }}>
        <label className="sr-only" htmlFor="gn-voice-in">{t('design.voice.typeLabel')}</label>
        <input id="gn-voice-in" className="gn-voice-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('design.voice.typePh')} disabled={disabled} autoComplete="off" />
        <button type="submit" className="gn-voice-go" disabled={disabled || !typed.trim()} aria-label={t('design.voice.apply')}><Icon name="arrow" size={16} /></button>
      </form>

      <button type="button" className="gn-voice-exbtn" onClick={() => setShowEx((v) => !v)} aria-expanded={showEx}>
        {t('design.voice.whatToSay')}<Icon name={showEx ? 'up' : 'down'} size={14} />
      </button>
      {showEx && (
        <ul className="gn-voice-ex">
          {exList.map((x) => (
            <li key={x}><button type="button" onClick={() => take(x)} disabled={disabled}>“{x}”</button></li>
          ))}
        </ul>
      )}
      {disabled && <p className="gn-voice-off">{t('design.voice.offInSnapshot')}</p>}
    </section>
  );
}
