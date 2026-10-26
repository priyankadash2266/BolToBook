import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Wordmark } from '@/components/bits';
import { Icon } from '@/components/Icon';
import { useT, useLang } from '@/i18n';
import { api } from '@/data/api';
import { useProfile } from '@/data/hooks';
import { createDictationEngine, useMicLevel } from '@/lib/speech';
import { MicOrb } from '@/components/voice';
import { cleanTranscript, isDevanagari, speechLocale, usesDevanagari } from '@/lib/text';
import type { AppLang, BookLang, BookType, CountryCode, Stage } from '@/data/types';
import './onboarding.css';

const COUNTRIES: CountryCode[] = ['IN', 'US', 'GB', 'CA', 'AE', 'SG', 'AU', 'OTHER'];
const BOOK_LANGS: BookLang[] = ['en', 'hi', 'mr', 'mix'];
/* Cloth-bound spines: each kind of book its own bookcloth, all with cream lettering. */
const TYPES: { k: BookType; bg: string; fg: string; h: number }[] = [
  { k: 'fiction', bg: 'var(--brand)', fg: 'var(--study-ink)', h: 260 },
  { k: 'nonfiction', bg: 'var(--source-ink)', fg: 'var(--study-ink)', h: 240 },
  { k: 'memoir', bg: 'var(--hue-6)', fg: 'var(--study-ink)', h: 226 },
  { k: 'stories', bg: 'var(--hue-2)', fg: 'var(--study-ink)', h: 204 },
  { k: 'poetry', bg: 'var(--hue-4)', fg: 'var(--study-ink)', h: 190 },
  { k: 'other', bg: 'var(--hue-5)', fg: 'var(--study-ink)', h: 214 },
];
type Progress = 'idea' | 'plan' | 'some' | 'draft' | 'revise' | 'nearly';
const PROGRESS: { k: Progress; stage: Stage }[] = [
  { k: 'idea', stage: 'idea' },
  { k: 'plan', stage: 'planning' },
  { k: 'some', stage: 'writing' },
  { k: 'draft', stage: 'revision' },
  { k: 'revise', stage: 'editing' },
  { k: 'nearly', stage: 'design' },
];
const STEPS = 4;

export default function Onboarding() {
  const t = useT('onboarding');
  const c = useT('common');
  const { lang, setLang } = useLang();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: profile } = useProfile();
  const returning = !!profile?.onboarded || params.get('new') === '1';

  const [step, setStep] = useState(0);
  const [country, setCountry] = useState<CountryCode>('IN');
  const [bookLang, setBookLang] = useState<BookLang>('en');
  const [type, setType] = useState<BookType>('fiction');
  const [progress, setProgress] = useState<Progress>('some');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [listening, setListening] = useState(false);
  const engine = useRef(createDictationEngine());
  const prefilled = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const level = useMicLevel(listening);

  // Prefill what we already know about a returning author.
  useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    if (profile.onboarded || returning) {
      setCountry(profile.country);
      setName(profile.name);
      if (profile.appLang !== lang) setLang(profile.appLang);
    } else if (profile.name) setName(profile.name);
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => engine.current.abort(), []);
  useEffect(() => { bodyRef.current?.querySelector<HTMLElement>('h1')?.focus(); }, [step]);

  const pickAppLang = (l: AppLang) => {
    setLang(l);
    if (profile) api.profile.update({ appLang: l }).catch(() => {});
  };

  const sayTitle = () => {
    if (listening) { engine.current.stop(); setListening(false); return; }
    engine.current.start(speechLocale(bookLang, country), {
      onFinal: (f) => setTitle(cleanTranscript(f, bookLang, { endSentence: false }).text.replace(/[.।]$/, '')),
      onInterim: (i) => { if (i) setTitle(i); },
      onState: (s) => setListening(s === 'listening' || s === 'starting'),
      onError: () => setListening(false),
    });
  };

  const open = async () => {
    setBusy(true); setFailed(false);
    engine.current.abort();
    try {
      const stage = PROGRESS.find((p) => p.k === progress)!.stage;
      const book = await api.books.create({ title: title.trim(), author: name.trim(), type, lang: bookLang, stage, country });
      await api.profile.update({
        ...(profile?.onboarded ? {} : { country, appLang: lang }),
        name: name.trim() || profile?.name || '',
        onboarded: true,
        currentBookId: book.id,
      });
      nav(`/app/b/${book.id}`, { replace: true });
    } catch {
      setFailed(true); setBusy(false);
    }
  };

  const deva = usesDevanagari(bookLang) && (isDevanagari(title) || bookLang !== 'mix');
  const titleDeva = isDevanagari(title) || (!title && deva);
  const countryName = country === 'OTHER' ? null : c(`countries.${country}`);
  const stageLabel = t(`s2.opts.${progress}.0`);

  return (
    <div className="ob">
      <aside className="ob-left" aria-label={t('preview')}>
        <div className="ob-mark">
          <Wordmark light to={returning ? '/app/library' : '/'} />
          {returning && <Link to="/app/library" className="btn btn-quiet btn-sm ob-back">{t('toLibrary')}</Link>}
        </div>
        <div className="ob-stage">
          <div className="ob-titlepage" aria-live="polite">
            <div className="ob-tp-type">{c(`bookTypes.${type}`)}</div>
            <div className="ob-tp-mid">
              <div className={`ob-tp-title${titleDeva ? ' is-deva' : ''}${title ? '' : ' is-empty'}`}>{title || t('untitled')}</div>
              <div className="ob-tp-rule" aria-hidden="true"><i /></div>
              <div className={`ob-tp-by${isDevanagari(name) ? ' ob-deva' : ''}`}>{name.trim() ? t('by', { name: name.trim() }) : t('byNobody')}</div>
            </div>
            <div className="ob-tp-foot">
              {t('writtenIn', { lang: c(`bookLangs.${bookLang}`) })}<br />
              {countryName ? t('publishedFrom', { country: countryName }) : t('publishedFromOther')}
            </div>
          </div>
        </div>
        <p className="ob-note">{returning ? t('leftNoteNew') : t('leftNote')}</p>
      </aside>

      <main className="ob-right">
        <div className="ob-top">
          <div className="ob-dots" role="progressbar" aria-label={t('progress')} aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1}>
            {Array.from({ length: STEPS }, (_, i) => <span key={i} className={`ob-dot${i < step ? ' is-done' : ''}${i === step ? ' is-cur' : ''}`} />)}
          </div>
          <span className="ob-stepof">{t('stepOf', { n: step + 1, total: STEPS })}</span>
        </div>

        <div className="ob-body" ref={bodyRef}>
          {step === 0 && (
            <div className="rise" key="s0">
              <div className="kick">{t('s0.kick')}</div>
              <h1 className="ob-q" tabIndex={-1}>{returning ? t('s0.qNew') : t('s0.q')}</h1>
              {!returning && (
                <>
                  <span className="ob-lbl" id="ob-country">{t('s0.country')}</span>
                  <div className="ob-opts" role="group" aria-labelledby="ob-country">
                    {COUNTRIES.map((k) => (
                      <button key={k} type="button" className="opt" aria-pressed={country === k} onClick={() => setCountry(k)}>{c(`countries.${k}`)}</button>
                    ))}
                  </div>
                  <div className="ob-help">{t('s0.countryHelp')}</div>
                </>
              )}
              <div className="ob-cols" style={returning ? { gridTemplateColumns: '1fr', marginTop: 8 } : undefined}>
                {!returning && (
                  <div>
                    <span className="ob-lbl" id="ob-app">{t('s0.appLang')}</span>
                    <div className="ob-opts" role="group" aria-labelledby="ob-app">
                      <button type="button" className="opt" aria-pressed={lang === 'en'} onClick={() => pickAppLang('en')} lang="en">English</button>
                      <button type="button" className="opt ob-deva" aria-pressed={lang === 'hi'} onClick={() => pickAppLang('hi')} lang="hi">हिन्दी</button>
                    </div>
                    <div className="ob-help">{t('s0.appHelp')}</div>
                  </div>
                )}
                <div>
                  <span className="ob-lbl" id="ob-book">{t('s0.bookLang')}</span>
                  <div className="ob-opts" role="group" aria-labelledby="ob-book">
                    {BOOK_LANGS.map((k) => (
                      <button key={k} type="button" className="opt" aria-pressed={bookLang === k} onClick={() => setBookLang(k)}>{c(`bookLangs.${k}`)}</button>
                    ))}
                  </div>
                  <div className="ob-help">{t('s0.bookHelp')}</div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="rise" key="s1">
              <div className="kick">{t('s1.kick')}</div>
              <h1 className="ob-q" tabIndex={-1}>{t('s1.q')}</h1>
              <p className="ob-h">{t('s1.h')}</p>
              <div className="ob-shelf" role="group" aria-label={t('s1.q')}>
                {TYPES.map((ty) => (
                  <button key={ty.k} type="button" className="ob-spine" aria-pressed={type === ty.k} onClick={() => setType(ty.k)}
                    style={{ height: ty.h, background: ty.bg, color: ty.fg }}>
                    <span>{c(`bookTypes.${ty.k}`)}</span>
                  </button>
                ))}
              </div>
              <p className="ob-typedesc rise" key={type} aria-live="polite">{t(`s1.desc.${type}`)}</p>
            </div>
          )}

          {step === 2 && (
            <div className="rise" key="s2">
              <div className="kick">{t('s2.kick')}</div>
              <h1 className="ob-q" tabIndex={-1}>{t('s2.q')}</h1>
              <p className="ob-h">{t('s2.h')}</p>
              <div className="ob-stages" role="group" aria-label={t('s2.q')}>
                {PROGRESS.map((p) => (
                  <button key={p.k} type="button" className="opt ob-stageopt" aria-pressed={progress === p.k} onClick={() => setProgress(p.k)}>
                    <b>{t(`s2.opts.${p.k}.0`)}</b><small>{t(`s2.opts.${p.k}.1`)}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="rise" key="s3">
              <div className="kick">{t('s3.kick')}</div>
              <h1 className="ob-q" tabIndex={-1}>{t('s3.q')}</h1>
              <p className="ob-h">{t('s3.h')}</p>
              <label className="ob-lbl" htmlFor="ob-name">{t('s3.name')}</label>
              <input id="ob-name" className="ob-bigin is-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('s3.namePh')} autoComplete="name" />
              <div style={{ height: 28 }} />
              <label className="ob-lbl" htmlFor="ob-title">{t('s3.title')}</label>
              <input id="ob-title" className={`ob-bigin${titleDeva ? ' is-deva' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('s3.titlePh')}
                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) open(); }} />
              <div className="ob-say">
                {engine.current.supported && (
                  <span className={`ob-sayorb${listening ? ' is-on' : ''}`}>
                    <MicOrb listening={listening} level={level} onClick={sayTitle} size={48} label={listening ? t('s3.listening') : t('s3.say')} />
                    <span className="ob-saytext" aria-hidden="true">{listening ? t('s3.listening') : t('s3.say')}</span>
                  </span>
                )}
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setTitle(''); engine.current.abort(); setListening(false); }}>{t('s3.skip')}</button>
              </div>
              <div className="ob-next">
                <div className="kick">{t('s3.nextK')}</div>
                <p>{t('s3.summary', { type: c(`bookTypes.${type}`).toLowerCase(), stage: stageLabel, lang: c(`bookLangs.${bookLang}`), country: countryName ?? t('s3.summaryOther') })}</p>
              </div>
              {failed && <p className="ob-err" role="alert">{t('failed')}</p>}
            </div>
          )}
        </div>

        <div className="ob-foot">
          <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} style={{ visibility: step === 0 ? 'hidden' : 'visible' }}>
            <Icon name="left" size={16} />{c('actions.back')}
          </button>
          {step < STEPS - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>{c('actions.next')}<Icon name="right" size={16} /></button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={open} disabled={busy}>{busy ? t('creating') : t('create')}</button>
          )}
        </div>
      </main>
    </div>
  );
}
