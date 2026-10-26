import { useErrorNotice } from '@/components/Toast';
/**
 * Add composer for characters, places and events. One spoken sentence ("Meera, a copywriter who left the hills…")
 * is split locally into the name and the description; nothing is kept until the author presses Add.
 * Only the author's own words are used; punctuation is tidied, nothing is added.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useCurrentBook } from '@/app/context';
import { useProfile } from '@/data/hooks';
import type { Entity } from '@/data/types';
import { MicOrb, LiveWave } from '@/components/voice';
import { TabArt } from '@/components/TabArt';
import { Icon } from '@/components/Icon';
import { VoiceTextarea, useBookFont } from '@/components/kit';
import { createDictationEngine, speechSupported, useMicLevel } from '@/lib/speech';
import { cleanTranscript, joinText, speechLocale } from '@/lib/text';
import { useT } from '@/i18n';

/* ------------------------------------------------------------------ */
/* Splitting what was said                                             */
/* ------------------------------------------------------------------ */

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const tidyName = (s: string) => s.trim().replace(/^["“'‘]+|["”'’]+$/g, '').replace(/[\s.,;:!?।—–-]+$/u, '').trim();
const capFirst = (s: string) => (/^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Split spoken words into a title and the rest.
 *  - 'name': "Meera, a copywriter…" · "Meera is a copywriter…" · "Meera a copywriter…" · "मीरा, एक…" · "मीरा जो…"
 *  - 'lead': only at a comma / dash / colon ("Monsoon 2014, Meera leaves Shimla").
 */
export function splitSpoken(text: string, mode: 'name' | 'lead' = 'name'): { title: string; desc: string } {
  const s = text.trim();
  if (!s) return { title: '', desc: '' };
  const maxWords = mode === 'name' ? 4 : 6;
  const punct = s.match(/^(.{1,60}?)\s*(?:,|:|—|–|\s-\s|।)\s*(.+)$/su);
  if (punct && words(punct[1]).length <= maxWords) return { title: tidyName(punct[1]), desc: capFirst(punct[2].trim()) };
  if (mode === 'name') {
    // "<Name> is / was / who / a / an / the …", and Hindi "<नाम> एक / जो / है …"
    const m = s.match(/^(.{1,50}?)\s+(is|was|who|a|an|the|एक|जो|हैं|है|थी|था|थे)\s+(.+)$/isu);
    if (m && words(m[1]).length <= 3) {
      const joiner = m[2].toLowerCase();
      const keep = ['who', 'a', 'an', 'the', 'एक', 'जो'].includes(joiner);
      return { title: tidyName(m[1]), desc: capFirst(keep ? `${m[2]} ${m[3]}`.trim() : m[3].trim()) };
    }
    if (words(s).length <= maxWords) return { title: tidyName(s), desc: '' };
    return { title: '', desc: s };
  }
  return { title: '', desc: s };
}

/* ------------------------------------------------------------------ */
/* The composer: one card, two equal ways in                           */
/* ------------------------------------------------------------------ */

interface SpokenAddProps {
  /** Creates the box (from BoxList's renderAdd). */
  add: (name?: string, fields?: Record<string, string>) => Promise<Entity | undefined>;
  mode?: 'name' | 'lead';
  /** Unique prefix for the field ids. */
  idBase: string;
  /** The round slot at the start of the card; gets the name typed or heard so far. */
  slot: (name: string) => ReactNode;
  heading: string;
  /** Example of saying both at once. */
  example: string;
  /** What "Say it all at once" fills in (e.g. "Name, then who they are"). */
  sayHint: string;
  titleLabel: string;
  titlePlaceholder: string;
  descLabel: string;
  descPlaceholder: string;
  keepLabel: (name: string) => string;
  /** First-time empty state (with the tab's drawing). */
  empty?: { art: string; warm: string };
  className?: string;
}

/**
 * "Add a …" composer. A name field and a description (with its own Say it pill) sit in one card, and a single
 * "Say it all at once" row above them fills both from one spoken sentence. Typing and speaking edit the same
 * fields; nothing is kept until the author presses the button.
 */
export function SpokenAdd({ add, mode = 'name', idBase, slot, heading, example, sayHint, titleLabel, titlePlaceholder, descLabel, descPlaceholder, keepLabel, empty, className = '' }: SpokenAddProps) {
  const t = useT('simple');
  const tk = useT('kit');
  const font = useBookFont();
  const { book } = useCurrentBook();
  const { data: profile } = useProfile();
  const lang = book?.lang ?? 'en';
  const engine = useRef(createDictationEngine());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useErrorNotice(err);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  /** What the fields held when speaking began, and everything heard since. */
  const base = useRef({ name: '', desc: '' });
  const heard = useRef('');
  const level = useMicLevel(listening);
  const supported = speechSupported();
  useEffect(() => () => engine.current.abort(), []);

  const fill = (spoken: string) => {
    const b = base.current;
    if (!b.name.trim()) {
      const s = splitSpoken(spoken, mode);
      setName(s.title);
      setDesc(s.desc ? joinText(b.desc, cleanTranscript(s.desc, lang, { capitalizeStart: true }).text) : b.desc);
    } else {
      setDesc(joinText(b.desc, cleanTranscript(spoken, lang, { capitalizeStart: true }).text));
    }
  };

  const start = () => {
    setErr(null);
    base.current = { name, desc };
    heard.current = '';
    engine.current.start(speechLocale(lang, profile?.country ?? 'IN'), {
      onInterim: setInterim,
      onFinal: (f) => {
        const clean = cleanTranscript(f, lang, { capitalizeStart: !heard.current.trim(), endSentence: false }).text;
        heard.current = joinText(heard.current, clean);
        setInterim('');
        fill(heard.current);
      },
      onState: (st) => setListening(st === 'listening' || st === 'starting'),
      onError: (e) => { setErr(e === 'unsupported' ? tk('voice.unsupported') : e === 'not-allowed' ? tk('voice.denied') : tk('voice.error')); setListening(false); },
    });
  };
  const stop = () => { engine.current.stop(); setListening(false); setInterim(''); };
  const clear = () => { engine.current.abort(); setListening(false); setInterim(''); setName(''); setDesc(''); setErr(null); };
  const can = !!(name.trim() || desc.trim()) && !busy;
  const keep = async () => {
    if (!can) return;
    if (listening) stop();
    setBusy(true);
    try { await add(name.trim(), { description: desc.trim() }); clear(); } finally { setBusy(false); }
  };

  return (
    <form
      className={`sim-comp ${empty ? 'is-first' : ''} ${listening ? 'is-listening' : ''} ${className}`}
      onSubmit={(e) => { e.preventDefault(); void keep(); }}
      aria-label={heading}
    >
      <div className="sim-comp-head">
        {empty
          ? <TabArt id={empty.art} className="sim-comp-art" />
          : <div className="sim-comp-slot">{slot(name)}</div>}
        <div className="sim-comp-headtext">
          {empty && <span className="sim-kick">{heading}</span>}
          <h3 className={`sim-comp-title display ${empty ? 'is-warm' : ''}`}>{empty ? empty.warm : heading}</h3>
          <p className="sim-comp-line">{t('compose.line')}</p>
        </div>
      </div>

      <div className={`sim-comp-say ${listening ? 'is-on' : ''}`}>
        <MicOrb listening={listening} level={level} onClick={listening ? stop : start} label={listening ? tk('voice.stop') : t('say.allAria', { what: heading })} size={48} disabled={!supported && !listening} />
        <div className="sim-comp-saytext" aria-live="polite">
          {listening ? <>
            <span className="sim-comp-status">
              <LiveWave active level={level} bars={18} height={16} barWidth={2} gap={2} color="var(--edit)" />
              {tk('voice.listening')}
            </span>
            <span className={`sim-comp-interim ${font}`}>{interim || '…'}</span>
          </> : <>
            <span className="sim-comp-saylabel">{t('say.all')}<span className="sim-comp-sayhint"> · {sayHint}</span></span>
            <span className={`sim-comp-eg ${font}`}>{supported ? example : tk('voice.unsupported')}</span>
          </>}
        </div>
        {listening && <button type="button" className="btn btn-ghost btn-sm sim-comp-done" onClick={stop}>{t('say.done')}</button>}
      </div>

      <div className="sim-comp-fields">
        <div className="sim-comp-field">
          <div className="sim-comp-lrow"><label className="label" htmlFor={`${idBase}-name`}>{titleLabel}</label></div>
          <input
            id={`${idBase}-name`}
            className={`input sim-comp-name ${font === 'book' ? 'display' : font}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={titlePlaceholder}
            autoComplete="off"
          />
        </div>
        <VoiceTextarea label={descLabel} id={`${idBase}-desc`} value={desc} onChange={setDesc} placeholder={descPlaceholder} rows={3} className="sim-comp-desc" />
      </div>

      <div className="sim-comp-foot">
        <button type="submit" className="btn btn-primary" disabled={!can}>
          <Icon name="plus" size={16} />{keepLabel(name.trim())}
        </button>
        {(name || desc) && <button type="button" className="btn btn-quiet" onClick={clear}>{t('say.clear')}</button>}
      </div>
    </form>
  );
}
