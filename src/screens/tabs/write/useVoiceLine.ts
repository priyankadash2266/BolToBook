import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentBook } from '@/app/context';
import { useT } from '@/i18n';
import { createDictationEngine, speechSupported, useMicLevel, type DictationEngine, type DictationError } from '@/lib/speech';
import { cleanTranscript, speechLocale } from '@/lib/text';

/**
 * One short spoken line (an idea, a chapter title). Tap to listen, tap again (or pause and stop)
 * to finish; `onDone` receives the author's words with punctuation tidied, nothing else changed.
 */
export function useVoiceLine(onDone: (text: string) => void) {
  const tc = useT('common');
  const { book, profile } = useCurrentBook();
  const lang = book?.lang ?? 'en';
  const locale = speechLocale(lang, profile?.country ?? book?.country ?? 'OTHER');
  const [listening, setListening] = useState(false);
  const [said, setSaid] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const engine = useRef<DictationEngine | null>(null);
  const saidRef = useRef('');
  const session = useRef(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const level = useMicLevel(listening);
  const supported = speechSupported();

  useEffect(() => () => { session.current++; engine.current?.abort(); }, []);

  const errText = (e: DictationError) => (e === 'not-allowed' ? tc('voice.denied') : e === 'network' ? tc('voice.network') : e === 'unsupported' ? tc('voice.unsupported') : tc('voice.error'));

  const start = useCallback(() => {
    if (!supported) { setError(tc('voice.unsupported')); return; }
    engine.current?.abort();
    engine.current = createDictationEngine();
    const my = ++session.current;
    saidRef.current = '';
    setSaid(''); setInterim(''); setError(null);
    setListening(true);
    let ended = false;
    engine.current.start(locale, {
      onInterim: (s) => { if (my === session.current) setInterim(s); },
      onFinal: (s) => {
        if (my !== session.current) return;
        saidRef.current = (saidRef.current + ' ' + s.trim()).trim();
        setSaid(saidRef.current);
        setInterim('');
      },
      onState: (s) => {
        if (my !== session.current) return;
        if (s === 'listening' || s === 'starting') setListening(true);
        if ((s === 'idle' || s === 'error') && !ended) {
          ended = true;
          setListening(false);
          setInterim('');
          const raw = saidRef.current.trim();
          saidRef.current = '';
          setSaid('');
          if (raw) doneRef.current(cleanTranscript(raw, lang, { capitalizeStart: true, endSentence: false }).text);
        }
      },
      onError: (e) => { if (my === session.current) setError(errText(e)); },
    });
  }, [supported, locale, lang, tc]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => { engine.current?.stop(); }, []);
  const toggle = useCallback(() => { if (listening) stop(); else start(); }, [listening, start, stop]);

  return { listening, said, interim, level, error, supported, start, stop, toggle };
}
