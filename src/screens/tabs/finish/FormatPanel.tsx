import { useState, type ReactNode } from 'react';
import type { FormatSpec } from '@/data/types';
import { useT } from '@/i18n';
import { Segmented } from '@/components/Segmented';
import { SaveNote } from '@/components/kit';
import { Icon } from '@/components/Icon';
import { FACES, MARGINS, TRIMS } from '@/lib/paginate';
import { changeCount, type BlockOp } from './layout';

interface Props {
  spec: FormatSpec;
  deva: boolean;
  saved: 'idle' | 'saving' | 'saved';
  disabled?: boolean;
  onFormat: <K extends keyof FormatSpec>(k: K, v: FormatSpec[K]) => void;
  onBlock: (key: string, op: BlockOp, effect: string) => void;
  onResetAll: () => void;
  /** Places a blank page can go after, in book order. */
  blankSpots: { key: string; label: string }[];
  /** Which groups to show (default: all). */
  sections?: Section[];
  title?: string;
  hint?: string;
}

export type Section = 'trim' | 'face' | 'size' | 'margins' | 'opening' | 'details' | 'blank' | 'changes';
const ALL: Section[] = ['trim', 'face', 'size', 'margins', 'opening', 'details', 'blank', 'changes'];

function Group({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <fieldset className="gn-fp-group" aria-labelledby={id}>
      <legend id={id} className="gn-fp-kick">{title}</legend>
      {children}
    </fieldset>
  );
}

/** The format, set like a typesetter would: trim, face, size, margins, chapter openings, details. */
export function FormatPanel({ spec, deva, saved, disabled, onFormat, onBlock, onResetAll, blankSpots, sections = ALL, title, hint }: Props) {
  const t = useT('finish');
  const has = (k: Section) => sections.includes(k);
  const [spot, setSpot] = useState('');
  const n = changeCount(spec);
  const blanks = blankSpots.filter((s) => spec.layout?.blocks?.[s.key]?.blankAfter);
  const sample = deva ? t('gen.fp.sampleDeva') : t('gen.fp.sample');

  return (
    <aside className={`gn-fp${disabled ? ' is-off' : ''}`} aria-label={t('gen.format')}>
      <div className="gn-fp-head">
        <h2 className="gn-fp-title">{title ?? t('gen.format')}</h2>
        <SaveNote state={saved} />
      </div>
      {hint && <p className="gn-hint gn-fp-hint">{hint}</p>}
      <fieldset className="gn-fp-body" disabled={disabled}>
        {has('trim') && <Group title={t('gen.g.trim')} id="gn-fp-trim">
          <div className="gn-trims" role="radiogroup" aria-labelledby="gn-fp-trim">
            {(Object.keys(TRIMS) as FormatSpec['trim'][]).map((k) => {
              const tr = TRIMS[k];
              return (
                <button key={k} type="button" role="radio" aria-checked={spec.trim === k} className={`gn-trim${spec.trim === k ? ' is-on' : ''}`} onClick={() => onFormat('trim', k)}>
                  <span className="gn-trim-sheet" style={{ width: tr.w * 5.2, height: tr.h * 5.2 }} aria-hidden="true" />
                  <span className="gn-trim-l">{t(`gen.trim.${k}`)}</span>
                </button>
              );
            })}
          </div>
        </Group>}

        {has('face') && <Group title={t('gen.g.face')} id="gn-fp-face">
          <div className="gn-faces" role="radiogroup" aria-labelledby="gn-fp-face">
            {(Object.keys(FACES) as FormatSpec['face'][]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={spec.face === k} className={`gn-face${spec.face === k ? ' is-on' : ''}`} onClick={() => onFormat('face', k)}>
                <span className="gn-face-aa" style={{ fontFamily: FACES[k].family }} aria-hidden="true">{k === 'tiro' ? 'अक' : 'Aa'}</span>
                <span className="gn-face-text">
                  <span className="gn-face-name">{FACES[k].label}</span>
                  <span className="gn-face-sample" style={{ fontFamily: FACES[k].family }} lang={deva ? 'hi' : 'en'}>{sample}</span>
                </span>
                {spec.face === k && <Icon name="check" size={16} className="gn-face-tick" />}
              </button>
            ))}
          </div>
          {deva && spec.face !== 'tiro' && <p className="gn-hint">{t('gen.faceDeva')}</p>}
        </Group>}

        {has('size') && <Group title={t('gen.g.size')} id="gn-fp-size">
          <Segmented size="sm" label={t('gen.g.size')} value={spec.size} onChange={(v) => onFormat('size', v)}
            options={(['s', 'm', 'l'] as const).map((k) => ({ value: k, label: <span style={{ fontSize: k === 's' ? 12.5 : k === 'm' ? 14 : 16 }}>{t(`gen.size.${k}`)}</span>, ariaLabel: t(`gen.size.${k}`) }))} />
        </Group>}

        {has('margins') && <Group title={t('gen.g.margins')} id="gn-fp-margins">
          <div className="gn-margins" role="radiogroup" aria-labelledby="gn-fp-margins">
            {(['tight', 'standard', 'generous'] as const).map((k) => {
              const m = MARGINS[k];
              const s = 20;
              return (
                <button key={k} type="button" role="radio" aria-checked={spec.margins === k} className={`gn-margin${spec.margins === k ? ' is-on' : ''}`} onClick={() => onFormat('margins', k)}>
                  <span className="gn-margin-sheet" aria-hidden="true">
                    <span style={{ top: m.top * s, bottom: m.bottom * s, left: m.inner * s, right: m.outer * s }} />
                  </span>
                  <span className="gn-trim-l">{t(`gen.margins.${k}`)}</span>
                </button>
              );
            })}
          </div>
        </Group>}

        {has('opening') && <Group title={t('gen.g.opening')} id="gn-fp-open">
          <div className="gn-openings" role="radiogroup" aria-labelledby="gn-fp-open">
            {(['drop', 'sunk', 'ornament'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={spec.opening === k} className={`gn-opening gn-opening-${k}${spec.opening === k ? ' is-on' : ''}`} onClick={() => onFormat('opening', k)}>
                <span className="gn-opening-sheet" aria-hidden="true">
                  {k === 'ornament' && <span className="gn-op-orn">❦</span>}
                  <span className="gn-op-head" />
                  <span className="gn-op-lines">
                    {k === 'drop' && <span className="gn-op-dc">D</span>}
                    <i /><i /><i /><i />
                  </span>
                </span>
                <span className="gn-trim-l">{t(`gen.opening.${k}`)}</span>
              </button>
            ))}
          </div>
        </Group>}

        {has('details') && <Group title={t('gen.fp.details')} id="gn-fp-details">
          <div className="gn-toggles">
            <Toggle label={t('gen.fp.halfTitle')} on={spec.halfTitle !== false} onChange={(v) => onFormat('halfTitle', v)} />
            <Toggle label={t('gen.fp.contents')} on={spec.includeContents} onChange={(v) => onFormat('includeContents', v)} />
            <Toggle label={t('gen.fp.headers')} on={spec.headers} onChange={(v) => onFormat('headers', v)} />
            <div className="gn-fp-row">
              <span className="gn-fp-rowl">{t('gen.fp.numbers')}</span>
              <Segmented size="sm" label={t('gen.fp.numbers')} value={spec.pageNumbers} onChange={(v) => onFormat('pageNumbers', v)}
                options={(['outer', 'center'] as const).map((k) => ({ value: k, label: t(`gen.fp.num.${k}`) }))} />
            </div>
            <div className="gn-fp-row">
              <span className="gn-fp-rowl">{t('gen.fp.paragraphs')}</span>
              <Segmented size="sm" label={t('gen.fp.paragraphs')} value={spec.paragraphs} onChange={(v) => onFormat('paragraphs', v)}
                options={(['indent', 'block'] as const).map((k) => ({ value: k, label: t(`gen.fp.para.${k}`) }))} />
            </div>
          </div>
        </Group>}

        {has('blank') && <Group title={t('gen.fp.blank')} id="gn-fp-blank">
          <div className="gn-blank">
            <label className="sr-only" htmlFor="gn-blank-sel">{t('gen.fp.blankAfter')}</label>
            <select id="gn-blank-sel" className="select" value={spot} onChange={(e) => setSpot(e.target.value)}>
              <option value="">{t('gen.fp.blankAfter')}</option>
              {blankSpots.filter((s) => !spec.layout?.blocks?.[s.key]?.blankAfter).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!spot} onClick={() => { onBlock(spot, { set: { blankAfter: true } }, 'blankAfter'); setSpot(''); }}>
              <Icon name="plus" size={15} />{t('gen.fp.insert')}
            </button>
          </div>
          {blanks.length > 0 && (
            <ul className="gn-blanks">
              {blanks.map((b) => (
                <li key={b.key} className="gn-chip gn-chip-soft">
                  {t('gen.fp.blankAt', { place: b.label })}
                  <button type="button" onClick={() => onBlock(b.key, { set: { blankAfter: false } }, 'noBlank')} aria-label={t('gen.fp.removeBlank', { place: b.label })}><Icon name="x" size={13} /></button>
                </li>
              ))}
            </ul>
          )}
        </Group>}

        {has('changes') && <div className="gn-fp-changes">
          <p className="gn-hint">{n ? t('gen.fp.changes', { n }) : t('gen.fp.noChanges')}</p>
          {n > 0 && <button type="button" className="btn btn-quiet btn-sm" onClick={onResetAll}><Icon name="undo" size={14} />{t('gen.fp.resetAll')}</button>}
        </div>}
      </fieldset>
    </aside>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="gn-toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="gn-switch" aria-hidden="true" />
    </label>
  );
}
