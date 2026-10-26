import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/i18n';
import { useProfile } from '@/data/hooks';
import type { BookLang } from '@/data/types';
import { createDictationEngine, LapRecorder, useMicLevel, type DictationError } from '@/lib/speech';
import { cleanTranscript, joinText, speechLocale } from '@/lib/text';

export type AudioTake = Promise<{ blob: Blob; durationMs: number } | null> | null;

/**
 * One listening session for Laps: the author's words (final + live interim), the mic level for the
 * waves, and, when the author's setting keeps recordings, the audio itself.
 */
export function useLapDictation({ bookLang, record = true }: { bookLang?: BookLang; record?: boolean } = {}) {
  const { lang } = useLang();
  const { data: profile } = useProfile();
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<DictationError | null>(null);
  const engine = useRef(createDictationEngine());
  const rec = useRef<LapRecorder | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const interimRef = useRef(interim);
  interimRef.current = interim;
  const level = useMicLevel(listening);
  const blang: BookLang = bookLang ?? (lang === 'hi' ? 'hi' : 'en');
  const keepAudio = record && profile?.recordingRetention !== 'none';

  useEffect(() => () => { engine.current.abort(); rec.current?.cancel(); }, []);

  const start = useCallback(async () => {
    setError(null);
    setListening(true);
    if (keepAudio) {
      rec.current = new LapRecorder();
      await rec.current.start();
    }
    engine.current.start(speechLocale(blang, profile?.country ?? 'IN'), {
      onInterim: setInterim,
      onFinal: (f) => {
        const cur = textRef.current;
        const clean = cleanTranscript(f, blang, { capitalizeStart: !cur.trim() || /[.!?।]\s*$/.test(cur), endSentence: false }).text;
        const next = joinText(cur, clean);
        textRef.current = next;
        setText(next);
        setInterim('');
      },
      onState: (s) => setListening(s === 'listening' || s === 'starting'),
      onError: (e) => { setError(e); setListening(false); rec.current?.cancel(); rec.current = null; },
    });
  }, [blang, keepAudio, profile?.country]);

  /** Stops listening; resolves (after the recogniser's last words arrive) with everything said and the recording. */
  const stop = useCallback((): Promise<{ value: string; audio: AudioTake }> => {
    engine.current.stop();
    setListening(false);
    const audio = rec.current ? rec.current.stop() : null;
    rec.current = null;
    return new Promise((resolve) => {
      setTimeout(() => resolve({ value: joinText(textRef.current, interimRef.current).trim(), audio }), 450);
    });
  }, []);

  const reset = useCallback(() => { setText(''); setInterim(''); textRef.current = ''; interimRef.current = ''; }, []);
  const cancel = useCallback(() => { engine.current.abort(); rec.current?.cancel(); rec.current = null; setListening(false); setInterim(''); }, []);

  const shown = text + (interim ? (text && !/\s$/.test(text) ? ' ' : '') + interim : '');
  return { text, setText, interim, shown, listening, error, level, start, stop, reset, cancel };
}

export function voiceErrorKey(e: DictationError | null): 'voice.unsupported' | 'voice.denied' | 'voice.error' | null {
  return e === 'unsupported' ? 'voice.unsupported' : e === 'not-allowed' ? 'voice.denied' : e ? 'voice.error' : null;
}
