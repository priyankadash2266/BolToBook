import { useEffect, useState } from 'react';
import type { CoverSpec } from '@/data/types';
import { useT } from '@/i18n';
import { CoverArt, MOODS } from '@/components/CoverArt';
import { Segmented } from '@/components/Segmented';
import { Icon } from '@/components/Icon';
import { LAYOUT_KEYS, MOOD_KEYS, MOTIF_KEYS, TYPE_KEYS, newTake } from './presets';
import { Book3D, StoreThumbs, type CoverText } from './Previews';

type View = 'front' | 'paper' | 'store';

function useWidth() {
  const [el, ref] = useState<HTMLElement | null>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [el]);
  return { ref, w };
}

interface Props {
  text: CoverText;
  spec: CoverSpec;
  /** 'saved' = this is the book's cover; 'draft' = adjusted by hand, not kept; 'none' = no cover chosen yet. */
  state: 'saved' | 'draft' | 'none';
  spinePx: number;
  onChange: (spec: CoverSpec) => void;
  onKeep: () => void;
  onReset: () => void;
  onPng: () => Promise<void>;
  onSvg: () => Promise<void>;
}

/** The chosen cover in the study, with Front / Paperback / Thumbnail previews and hand adjustments. */
export function Stage({ text, spec, state, spinePx, onChange, onKeep, onReset, onPng, onSvg }: Props) {
  const t = useT('cover2');
  const [view, setView] = useState<View>('front');
  const [busy, setBusy] = useState<'' | 'png' | 'svg'>('');
  const { ref, w: stageW } = useWidth();
  const isPhone = stageW < 520;
  const coverW = Math.round(Math.max(180, Math.min(isPhone ? stageW * 0.7 : 300, stageW - 32)));
  const sp = Math.max(10, Math.round(spinePx * coverW));
  const set = <K extends keyof CoverSpec>(k: K, v: CoverSpec[K]) => onChange({ ...spec, [k]: v });
  const run = (k: 'png' | 'svg', fn: () => Promise<void>) => async () => { setBusy(k); try { await fn(); } finally { setBusy(''); } };

  return (
    <section className="cd-art" aria-label={t('stage.current')} ref={ref}>
      <div className="c2-stage-head">
        <span className="c2-stage-k">{t('stage.current')}</span>
        {state !== 'saved' && <span className={`c2-stage-state is-${state}`}>{state === 'draft' ? t('stage.unsaved') : t('stage.none')}</span>}
      </div>
      <div className="cd-views">
        <Segmented size="sm" variant="night" label={t('stage.view')} value={view} onChange={setView}
          options={(['front', 'paper', 'store'] as View[]).map((v) => ({ value: v, label: t(`stage.views.${v}`) }))} />
      </div>
      <div className={`cd-show cd-show-${view}${state === 'none' ? ' is-none' : ''}`}>
        <span className="cd-spot" aria-hidden="true" />
        {view === 'front' && <div className="cv-shadow"><CoverArt title={text.title} subtitle={text.subtitle} author={text.author} spec={spec} width={coverW} deva={text.deva} /></div>}
        {view === 'paper' && <Book3D text={text} spec={spec} width={Math.round(coverW * 0.86)} spinePx={sp} />}
        {view === 'store' && <StoreThumbs text={text} spec={spec} />}
      </div>
      {view === 'paper' && <p className="cd-note cd-center">{t('stage.spineNote')}</p>}
      {state === 'none' && <p className="cd-note cd-center c2-none-hint">{t('stage.noneHint')}</p>}

      <div className="cd-downloads">
        <span className="cd-dl-l">{t('stage.download')}</span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={run('png', onPng)} disabled={!!busy}><Icon name="download" size={15} />{t('stage.png')}</button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={run('svg', onSvg)} disabled={!!busy}><Icon name="download" size={15} />{t('stage.svg')}</button>
      </div>

      <details className="c2-adjust">
        <summary>
          <Icon name="pen" size={15} />
          <span>{t('adjust.title')}</span>
          <span className="c2-free">{t('adjust.free')}</span>
          <Icon name="down" size={15} className="c2-caret" />
        </summary>
        <p className="cd-note">{t('adjust.hint')}</p>
        <div className="cd-controls">
          <Pick label={t('g.mood')} id="cd-mood" value={spec.mood} onChange={(v) => set('mood', v)} options={MOOD_KEYS.map((k) => ({ value: k, label: t(`mood.${k}`) }))} swatch={MOODS[spec.mood].bg} />
          <Pick label={t('g.type')} id="cd-type" value={spec.type} onChange={(v) => set('type', v)} options={TYPE_KEYS.map((k) => ({ value: k, label: t(`type.${k}`) }))} />
          <Pick label={t('g.motif')} id="cd-motif" value={spec.motif} onChange={(v) => set('motif', v)} options={MOTIF_KEYS.map((k) => ({ value: k, label: t(`motif.${k}`) }))} />
          <Pick label={t('g.layout')} id="cd-layout" value={spec.layout} onChange={(v) => set('layout', v)} options={LAYOUT_KEYS.map((k) => ({ value: k, label: t(`layout.${k}`) }))} />
        </div>
        <div className="cd-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(newTake(spec))}>
            <Icon name="undo" size={15} style={{ transform: 'scaleX(-1)' }} />{t('adjust.newTake')}
          </button>
          {state === 'draft' && <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>{t('adjust.reset')}</button>}
          <button type="button" className="btn btn-brass btn-sm cd-use" onClick={onKeep} disabled={state === 'saved'}>
            <Icon name="check" size={16} />{state === 'saved' ? t('adjust.kept') : t('adjust.keep')}
          </button>
        </div>
      </details>
    </section>
  );
}

function Pick<T extends string>({ label, id, value, onChange, options, swatch }: { label: string; id: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; swatch?: string }) {
  return (
    <div className="cd-pick">
      <label className="cd-pick-l" htmlFor={id}>{swatch && <span className="cd-swatch" style={{ background: swatch }} aria-hidden="true" />}{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
