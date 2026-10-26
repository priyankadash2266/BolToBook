import { useState } from 'react';
import { BoxList, SaveNote, TabPage, VoiceTextarea, useBookField, useBoxFolds, useEntityCollection, type BoxParts } from '@/components/kit';
import { useCurrentBook } from '@/app/context';
import type { Entity } from '@/data/types';
import { Icon } from '@/components/Icon';
import { TabArt } from '@/components/TabArt';
import { countWords } from '@/lib/text';
import { fmtNumber } from '@/lib/format';
import { translate, useLang, useT } from '@/i18n';
import { FoldAll, FoldToggle, toRoman } from './simple/look';
import './simple/simple.css';

const THEMES = ['love', 'loss', 'family', 'identity', 'power', 'freedom', 'justice', 'home', 'comingOfAge', 'betrayal', 'hope', 'survival'] as const;

/** One small line motif per theme (decorative). */
const GLYPH: Record<(typeof THEMES)[number], string> = {
  love: 'M8 13.5S2.5 10 2.5 6.2A2.7 2.7 0 0 1 8 5a2.7 2.7 0 0 1 5.5 1.2C13.5 10 8 13.5 8 13.5z',
  loss: 'M12.5 3C7 3.5 3.5 7 3.5 12.5 9 12 12.5 8.5 12.5 3zM3.5 12.5l5-5',
  family: 'M5 6.5a1.6 1.6 0 1 0 0-.01M11 6.5a1.6 1.6 0 1 0 0-.01M8 9.5a1.3 1.3 0 1 0 0-.01M2.5 13c.5-2 4.5-2 5 0M8.5 13c.5-2 4.5-2 5 0',
  identity: 'M8 2.5a5.5 5.5 0 0 1 5.5 5.5M8 5a3 3 0 0 1 3 3v1.5M5 8a3 3 0 0 1 1-2.2M8 8v3.5M5 10.5c0 1.2.4 2.2 1 3M2.5 8a5.5 5.5 0 0 1 2-4.2',
  power: 'M2.5 12h11l-1-6.5L10 8 8 3.5 6 8 3.5 5.5z',
  freedom: 'M2 9c3-1 5-3.5 6-6.5 1 3 3 5.5 6 6.5M5 11.5c1-.4 2-1.2 3-2.5 1 1.3 2 2.1 3 2.5',
  justice: 'M8 2.5v11M5 13.5h6M3 5h10M3 5l-1.5 4h3zM13 5l-1.5 4h3z',
  home: 'M2.5 8 8 3l5.5 5M4 7v6.5h8V7M7 13.5V10h2v3.5',
  comingOfAge: 'M8 13.5V7M8 9c-3 0-4.5-2-4.5-4.5C6.5 4.5 8 6 8 9zM8 7.5c0-2.5 1.5-4 4.5-4C12.5 6 11 7.5 8 7.5z',
  betrayal: 'M3 13 9.5 6.5M8 5l3 3M10.5 2.5l3 3-2 2-3-3zM2.5 10.5l3 3',
  hope: 'M2.5 11h11M4.5 11a3.5 3.5 0 0 1 7 0M8 2.5V5M3.5 4.5 5 6M12.5 4.5 11 6',
  survival: 'M8 13.5c-2.5 0-4-1.7-4-3.8C4 7 6.5 5.5 6.5 2.5 9 4 12 6.5 12 9.7c0 2.1-1.5 3.8-4 3.8zM8 13.5c-1 0-1.8-.8-1.8-1.9 0-1.3 1.8-2.4 1.8-2.4s1.8 1.1 1.8 2.4c0 1.1-.8 1.9-1.8 1.9z',
};

const splitList = (raw: string) => raw.split(',').map((s) => s.trim()).filter(Boolean);
const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
/** A preset theme matches its label in any interface language, so switching language keeps the picks. */
const presetLabels = (k: string) => (['en', 'hi'] as const).map((l) => translate(l, 'simple', `brief.theme.${k}`));

export default function Brief() {
  const t = useT('simple');
  const { lang } = useLang();
  const { book } = useCurrentBook();
  const [brief, setBrief, briefState] = useBookField('brief');
  const [rawThemes, setThemes, themesState] = useBookField('themes');
  const [own, setOwn] = useState('');

  const picked = splitList(rawThemes);
  const isPreset = (v: string) => THEMES.some((k) => presetLabels(k).some((l) => same(l, v)));
  const presetOn = (k: string) => picked.some((v) => presetLabels(k).some((l) => same(l, v)));
  const custom = picked.filter((v) => !isPreset(v));
  const save = (list: string[]) => setThemes(list.join(', '));

  const togglePreset = (k: string) => {
    const labels = presetLabels(k);
    if (presetOn(k)) save(picked.filter((v) => !labels.some((l) => same(l, v))));
    else save([...picked, t(`brief.theme.${k}`)]);
  };
  const addOwn = () => {
    const v = own.replace(/,/g, ' ').trim();
    if (!v) return;
    if (!picked.some((p) => same(p, v))) save([...picked, v]);
    setOwn('');
  };

  const words = countWords(brief);
  const folds = useBoxFolds(`${book?.id ?? ''}.summary`);
  const { items: parts } = useEntityCollection('summary');
  const partIds = parts.map((p) => p.id);

  return (
    <TabPage tabId="brief">
      <div className="sim-scope">
        {/* Back-cover copy: the label is the heading, the Say it pill sits on the same row, above the page. */}
        <section className="sim-blurb" aria-label={t('brief.lines.title')}>
          <div className="sim-blurb-frame">
            <span className="sim-kick">{t('brief.lines.kick')}</span>
            <VoiceTextarea label={t('brief.lines.title')} value={brief} onChange={setBrief} placeholder={t('brief.lines.ph')} rows={5} id="sim-brief" className="sim-blurb-vt" />
            <div className="sim-blurb-foot">
              <p className="sim-blurb-hint">{t('brief.lines.hint')}</p>
              <span className="sim-blurb-meta">
                <SaveNote state={briefState} />
                <span className="sim-count" aria-live="polite">{t('brief.lines.words', { n: fmtNumber(words, lang) })}</span>
              </span>
            </div>
          </div>
        </section>

        {/* Themes */}
        <section className="sim-sec" aria-labelledby="sim-themes-title">
          <div className="sim-sec-head">
            <div>
              <h2 id="sim-themes-title" className="kit-section-title">{t('brief.themes.title')}</h2>
              <p className="kit-section-hint">{t('brief.themes.hint')}</p>
            </div>
            <SaveNote state={themesState} />
          </div>
          <div className="sim-chips" role="group" aria-label={t('brief.themes.group')}>
            {THEMES.map((k) => (
              <button key={k} type="button" className="sim-theme" aria-pressed={presetOn(k)} onClick={() => togglePreset(k)}>
                <svg className="sim-theme-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path d={GLYPH[k]} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t(`brief.theme.${k}`)}
                {presetOn(k) && <Icon name="check" size={13} className="sim-theme-check" />}
              </button>
            ))}
            {custom.map((v) => (
              <button key={v} type="button" className="sim-theme is-own" aria-pressed="true" aria-label={t('brief.themes.remove', { name: v })} onClick={() => save(picked.filter((p) => p !== v))}>
                <span className="sim-theme-dot" aria-hidden="true" />
                {v}
                <Icon name="x" size={13} className="sim-theme-check" />
              </button>
            ))}
            <form className="sim-own" onSubmit={(e) => { e.preventDefault(); addOwn(); }}>
              <label className="sr-only" htmlFor="sim-own-theme">{t('brief.themes.addOwn')}</label>
              <span className="sim-own-plus" aria-hidden="true"><Icon name="plus" size={15} /></span>
              <input id="sim-own-theme" className="sim-own-input" value={own} onChange={(e) => setOwn(e.target.value)} placeholder={t('brief.themes.addOwn')} />
              {own.trim() && <button type="submit" className="btn btn-ghost btn-xs">{t('brief.themes.add')}</button>}
            </form>
          </div>
          {picked.length > 0 && <p className="sim-theme-count faint">{t('brief.themes.count', { n: fmtNumber(picked.length, lang) })}</p>}
        </section>

        {/* The story, part by part */}
        <section className="sim-sec sim-sec-arc" aria-labelledby="sim-arc-title">
          <div className="sim-sec-head">
            <div>
              <h2 id="sim-arc-title" className="kit-section-title">{t('brief.summary.title')}</h2>
              <p className="kit-section-hint">{t('brief.summary.hint')}</p>
            </div>
            <FoldAll folds={folds} ids={partIds} />
          </div>
          <BoxList
            kind="summary"
            ordered={false}
            columns={1}
            variant="arc"
            folds={folds}
            showDescLabel
            titleLabel={t('brief.summary.titleLabel')}
            titlePlaceholder={t('brief.summary.titlePh')}
            descLabel={t('brief.summary.descLabel')}
            descPlaceholder={t('brief.summary.descPh')}
            addLabel={t('brief.summary.add')}
            emptyHint={t('brief.summary.empty')}
            renderBox={(e, p) => <StoryPart e={e} p={p} />}
            renderAdd={({ add, empty, loading }) => loading || !empty ? null : (
              <div className="sim-arc-first">
                <TabArt id="brief" className="sim-say-art" />
                <p className="sim-say-warm display">{t('brief.summary.warm')}</p>
                <p className="sim-arc-first-line">{t('brief.summary.empty')}</p>
                <button type="button" className="btn btn-primary" onClick={() => { void add(); }}>
                  <Icon name="plus" size={16} />{t('brief.summary.addFirst')}
                </button>
              </div>
            )}
          />
        </section>
      </div>
    </TabPage>
  );
}

/** One part of the story: numeral, name, and what happens; folds down to its name. "Add after" sits under it. */
function StoryPart({ e, p }: { e: Entity; p: BoxParts }) {
  const t = useT('simple');
  const { lang } = useLang();
  const n = toRoman(p.index + 1);
  const bodyId = `sim-part-body-${e.id}`;
  const last = p.index === p.count - 1;
  return (
    <>
      <div className={`sim-part ${p.folded ? 'is-folded' : ''}`}>
        <div className="sim-part-top">
          <span className="sim-part-num" title={t('brief.summary.part', { n })} aria-hidden="true">{n}</span>
          <span className="sr-only">{t('brief.summary.part', { n })}</span>
          <div className="sim-part-title">{p.title}</div>
          {p.tools}
          <FoldToggle folded={p.folded} onClick={p.toggleFold} name={e.name || t('brief.summary.part', { n })} controls={bodyId} />
        </div>
        {!p.folded && <div id={bodyId} className="sim-part-body">{p.desc}</div>}
      </div>
      <div className={`sim-part-after ${last ? 'is-last' : ''}`}>
        <button type="button" className="sim-addafter" onClick={p.insertAfter} aria-label={last ? undefined : t('brief.summary.addAfterAria', { n: fmtNumber(p.index + 1, lang) })}>
          <Icon name="plus" size={14} />
          {last ? t('brief.summary.addNext') : t('brief.summary.addAfter')}
        </button>
      </div>
    </>
  );
}
