import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { bookPath } from '@/app/context';
import type { Book } from '@/data/types';
import { useT } from '@/i18n';
import { SaveNote, VoiceTextarea, useBookFont } from '@/components/kit';
import { Segmented } from '@/components/Segmented';
import { Icon } from '@/components/Icon';
import { isDevanagari } from '@/lib/text';
import type { WordMatch } from '@/screens/tabs/finish/coverWords';
import { MOOD_KEYS, MOTIF_KEYS, TYPE_KEYS } from './presets';
import type { CoverPrefs } from './coverJobs';

/** A book detail that edits in place and saves on blur / Enter. */
function Fact({ label, value, onSave, placeholder, lang, id, disabled }: { label: string; value: string; onSave: (v: string) => void; placeholder?: string; lang?: string; id: string; disabled?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v.trim() !== value.trim()) onSave(v.trim()); };
  return (
    <div className="cd-fact">
      <label className="cd-fact-l" htmlFor={id}>{label}</label>
      <input id={id} className="cd-fact-in" value={v} placeholder={placeholder} lang={lang} disabled={disabled}
        onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur(); } }} />
    </div>
  );
}

/** One preference as a row of chips; the first chip is "Let the words decide". */
function ChipPick<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="c2-pref" role="radiogroup" aria-label={label}>
      <span className="c2-pref-l" aria-hidden="true">{label}</span>
      <div className="c2-pref-chips">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-pressed={o.value === value}
            className={`chip c2-chip${o.value === 'auto' ? ' c2-chip-auto' : ''}`} disabled={disabled} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface BriefPanelProps {
  book: Book;
  summary: string;
  themes: string[];
  coverBrief: string;
  setCoverBrief: (v: string) => void;
  briefState: 'idle' | 'saving' | 'saved';
  matches: WordMatch[];
  prefs: CoverPrefs;
  setPrefs: (p: CoverPrefs) => void;
  count: number;
  setCount: (n: number) => void;
  running: boolean;
  onSaveBook: (patch: Partial<Book>) => void;
  /** The send button + job progress. */
  send: ReactNode;
}

export function BriefPanel(p: BriefPanelProps) {
  const t = useT('cover2');
  const font = useBookFont();
  const { book } = p;
  const titleLang = isDevanagari(book.title) ? 'hi' : undefined;
  const auto = { value: 'auto' as const, label: t('auto') };
  const setPref = <K extends keyof CoverPrefs>(k: K, v: CoverPrefs[K]) => p.setPrefs({ ...p.prefs, [k]: v });

  return (
    <section className="cd-say" aria-labelledby="cd-say-h">
      <div>
        <h2 id="cd-say-h" className="kit-section-title">{t('say')}</h2>
        <p className="kit-section-hint">{t('sayHint')}</p>
      </div>

      <div className="cd-block">
        <div className="cd-block-head">
          <span className="kick">{t('summary')}</span>
          <Link className="cd-edit" to={bookPath(book.id, 'brief')}>{t('editBrief')}<Icon name="arrow" size={13} /></Link>
        </div>
        {p.summary ? <p className={`cd-summary ${font}`}>{p.summary}</p> : <p className="cd-empty">{t('summaryEmpty')}</p>}
        <div className="c2-themes">
          <span className="c2-sub-l">{t('themes')}</span>
          {p.themes.length ? (
            <ul className="cd-themes">{p.themes.map((th) => <li key={th} className="chip chip-static">{th}</li>)}</ul>
          ) : <span className="cd-empty c2-inline-empty">{t('themesEmpty')}</span>}
        </div>
      </div>

      <div className="cd-block">
        <VoiceTextarea id="c2-describe" label={t('describe')} value={p.coverBrief} onChange={p.setCoverBrief} placeholder={t('describePh')} rows={4} />
        <div className="c2-picked" aria-live="polite">
          {p.matches.length ? (
            <>
              <span className="cd-picked-l">{t('picked')}</span>
              <ul className="cd-picked-list">
                {p.matches.slice(0, 8).map((m) => <li key={m.word} className="tag tag-brand" lang={isDevanagari(m.word) ? 'hi' : undefined}>{m.word}</li>)}
              </ul>
            </>
          ) : <p className="cd-picked-how">{t('pickedNone')}</p>}
          <span className="c2-save"><SaveNote state={p.briefState} /></span>
        </div>
      </div>

      <details className="cd-block c2-prefs">
        <summary className="c2-prefs-sum">
          <span className="kick">{t('prefs')}</span>
          <span className="c2-prefs-now">{prefSummary(p.prefs, t)}</span>
          <Icon name="down" size={16} className="c2-caret" />
        </summary>
        <p className="cd-note">{t('prefsHint')}</p>
        <ChipPick label={t('g.mood')} value={p.prefs.mood} disabled={p.running} onChange={(v) => setPref('mood', v)}
          options={[auto, ...MOOD_KEYS.map((k) => ({ value: k, label: t(`mood.${k}`) }))]} />
        <ChipPick label={t('g.type')} value={p.prefs.type} disabled={p.running} onChange={(v) => setPref('type', v)}
          options={[auto, ...TYPE_KEYS.map((k) => ({ value: k, label: t(`type.${k}`) }))]} />
        <ChipPick label={t('g.motif')} value={p.prefs.motif} disabled={p.running} onChange={(v) => setPref('motif', v)}
          options={[auto, ...MOTIF_KEYS.map((k) => ({ value: k, label: t(`motif.${k}`) }))]} />
      </details>

      <div className="cd-block">
        <span className="kick">{t('details')}</span>
        <Fact id="cd-title" label={t('title')} value={book.title} onSave={(v) => p.onSaveBook({ title: v })} lang={titleLang} disabled={p.running} />
        <Fact id="cd-sub" label={t('subtitle')} value={book.subtitle ?? ''} placeholder={t('subtitlePh')} onSave={(v) => p.onSaveBook({ subtitle: v || undefined })} disabled={p.running} />
        <Fact id="cd-author" label={t('author')} value={book.author} placeholder={t('authorPh')} onSave={(v) => p.onSaveBook({ author: v })} disabled={p.running} />
        <p className="cd-note">{t('detailsNote')}</p>
      </div>

      <div className="c2-send">
        <div className="c2-count">
          <span className="c2-sub-l" id="c2-count-l">{t('count')}</span>
          <Segmented size="sm" label={t('count')} value={String(p.count)} onChange={(v) => !p.running && p.setCount(Number(v))}
            options={['2', '4', '6'].map((n) => ({ value: n, label: t('countN', { n }) }))} />
        </div>
        {p.send}
      </div>
    </section>
  );
}

export function prefSummary(prefs: CoverPrefs, t: (k: string, v?: Record<string, string | number>) => string) {
  const parts = [
    prefs.mood !== 'auto' && t(`mood.${prefs.mood}`),
    prefs.type !== 'auto' && t(`type.${prefs.type}`),
    prefs.motif !== 'auto' && t(`motif.${prefs.motif}`),
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : t('auto');
}
