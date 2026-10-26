import { useRef, type CSSProperties, type ReactNode } from 'react';
import type { FormatSpec } from '@/data/types';
import { useLang, useT } from '@/i18n';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { FACES } from '@/lib/paginate';
import { fmtNumber } from '@/lib/format';
import { SIZE_IDS, SIZE_SHAPE, STYLE_IDS, stylePatch, type SizeId, type StyleId } from './variants';

export function useVariantNames() {
  const t = useT('finish');
  const sizeName = (s: SizeId) => (s === 'ebook' ? t('pv.size.ebook') : t(`gen.trim.${s}`));
  const styleName = (s: StyleId) => t(`pv.style.${s}.name`);
  return { sizeName, styleName, label: (size: SizeId, style: StyleId) => `${sizeName(size)} · ${styleName(style)}` };
}

/** A page silhouette in the trim's true proportions (an eBook is drawn as a reader). */
export function Sheet({ size, h = 34, className = '' }: { size: SizeId; h?: number; className?: string }) {
  const s = SIZE_SHAPE[size];
  return <span className={`gn-sheetmark${size === 'ebook' ? ' is-ebook' : ''} ${className}`} style={{ width: Math.round((s.w / s.h) * h), height: h }} aria-hidden="true" />;
}

/** One line describing what a style sets: typeface, size (large print) and chapter opening. */
export function useStyleDesc(deva: boolean, mine: FormatSpec) {
  const t = useT('finish');
  return (style: StyleId) => {
    const p = stylePatch(style, deva, mine);
    const face = FACES[p.face ?? 'literata'].label;
    return [face, ...(p.pt ? [t('pv.pt', { n: p.pt })] : []), t(`gen.opening.${p.opening ?? 'drop'}`)].join(' · ');
  };
}

const toggle = <T,>(list: T[], v: T, order: T[]) => (list.includes(v) ? list.filter((x) => x !== v) : order.filter((x) => x === v || list.includes(x)));

interface RailProps {
  deva: boolean;
  /** The book's own format (for "My current settings" and the details). */
  mine: FormatSpec;
  sizes: SizeId[];
  styles: StyleId[];
  onSizes: (s: SizeId[]) => void;
  onStyles: (s: StyleId[]) => void;
  /** The option of each category drawn on the sample page. */
  showSize: SizeId;
  showStyle: StyleId;
  onShowSize: (s: SizeId) => void;
  onShowStyle: (s: StyleId) => void;
  /** Hovering a row peeks at it on the page (null = back to the one showing). */
  onPeek: (p: { size?: SizeId; style?: StyleId } | null) => void;
  onEditMine: () => void;
  onDetail: <K extends keyof FormatSpec>(k: K, v: FormatSpec[K]) => void;
  disabled?: boolean;
}

/**
 * The left rail of "Design your book": Size and Style as calm rows, Details as quiet switches.
 * A ticked row is included in the next "Make previews"; the highlighted row ("Showing") drives the sample page.
 */
export function DesignRail(p: RailProps) {
  const t = useT('finish');
  const { lang } = useLang();
  const { sizeName, styleName } = useVariantNames();
  const desc = useStyleDesc(p.deva, p.mine);
  const peekTimer = useRef<number | undefined>(undefined);
  const peek = (v: { size?: SizeId; style?: StyleId } | null) => {
    window.clearTimeout(peekTimer.current);
    if (!v) { p.onPeek(null); return; }
    peekTimer.current = window.setTimeout(() => p.onPeek(v), 90);
  };

  const pickSize = (s: SizeId) => { p.onShowSize(s); if (!p.sizes.includes(s)) p.onSizes(toggle(p.sizes, s, SIZE_IDS)); };
  const pickStyle = (s: StyleId) => { p.onShowStyle(s); if (!p.styles.includes(s)) p.onStyles(toggle(p.styles, s, STYLE_IDS)); };
  const tickSize = (s: SizeId) => {
    const next = toggle(p.sizes, s, SIZE_IDS);
    p.onSizes(next);
    if (next.includes(s)) p.onShowSize(s);
    else if (s === p.showSize && next.length) p.onShowSize(next[next.length - 1]);
  };
  const tickStyle = (s: StyleId) => {
    const next = toggle(p.styles, s, STYLE_IDS);
    p.onStyles(next);
    if (next.includes(s)) p.onShowStyle(s);
    else if (s === p.showStyle && next.length) p.onShowStyle(next[next.length - 1]);
  };

  return (
    <aside className="gn-rail" aria-label={t('pv2.railLabel')} onMouseLeave={() => peek(null)}>
      <Group id="gn-g-size" title={t('pv2.size')} count={t('pv2.chosen', { n: fmtNumber(p.sizes.length, lang) })}>
        {SIZE_IDS.map((s) => (
          <Row key={s} name={sizeName(s)} checked={p.sizes.includes(s)} showing={p.showSize === s} disabled={p.disabled}
            art={<span className="gn-opt-art"><Sheet size={s} h={30} /></span>} sub={t(`pv.sizeSub.${s}`)}
            onPick={() => pickSize(s)} onTick={() => tickSize(s)} onPeek={() => peek({ size: s })} />
        ))}
      </Group>

      <Group id="gn-g-style" title={t('pv2.style')} count={t('pv2.chosen', { n: fmtNumber(p.styles.length, lang) })}>
        {STYLE_IDS.map((y) => {
          const sp = stylePatch(y, p.deva, p.mine);
          const head = FACES[sp.headFace ?? sp.face ?? 'literata'].family;
          return (
            <Row key={y} name={styleName(y)} checked={p.styles.includes(y)} showing={p.showStyle === y} disabled={p.disabled}
              art={<span className="gn-opt-aa" style={{ ['--aa' as string]: head } as CSSProperties} aria-hidden="true">{p.deva ? 'अक' : 'Aa'}</span>}
              sub={desc(y)} onPick={() => pickStyle(y)} onTick={() => tickStyle(y)} onPeek={() => peek({ style: y })}
              extra={y === 'mine' ? (
                <button type="button" className="gn-opt-edit" onClick={p.onEditMine} disabled={p.disabled} aria-label={t('pv.editMine')} title={t('pv.editMine')}>
                  <Icon name="pen" size={15} />
                </button>
              ) : undefined} />
          );
        })}
      </Group>

      <section className="gn-rail-group gn-rail-details" aria-labelledby="gn-g-details">
        <header className="gn-rail-head">
          <h3 id="gn-g-details" className="gn-rail-kick">{t('pv2.details')}</h3>
        </header>
        <p className="gn-rail-hint">{t('pv2.detailsHint')}</p>
        <div className="gn-switches">
          <Switch label={t('gen.fp.halfTitle')} on={p.mine.halfTitle !== false} onChange={(v) => p.onDetail('halfTitle', v)} />
          <Switch label={t('gen.fp.contents')} on={p.mine.includeContents} onChange={(v) => p.onDetail('includeContents', v)} />
          <Switch label={t('gen.fp.headers')} on={p.mine.headers} onChange={(v) => p.onDetail('headers', v)} />
          <div className="gn-switch-row">
            <span className="gn-switch-l">{t('gen.fp.numbers')}</span>
            <Segmented size="sm" label={t('gen.fp.numbers')} value={p.mine.pageNumbers} onChange={(v) => p.onDetail('pageNumbers', v)}
              options={(['outer', 'center'] as const).map((k) => ({ value: k, label: t(`gen.fp.num.${k}`) }))} />
          </div>
          <div className="gn-switch-row">
            <span className="gn-switch-l">{t('gen.fp.paragraphs')}</span>
            <Segmented size="sm" label={t('gen.fp.paragraphs')} value={p.mine.paragraphs} onChange={(v) => p.onDetail('paragraphs', v)}
              options={(['indent', 'block'] as const).map((k) => ({ value: k, label: t(`gen.fp.para.${k}`) }))} />
          </div>
        </div>
      </section>
    </aside>
  );
}

function Group({ id, title, count, children }: { id: string; title: string; count: string; children: ReactNode }) {
  return (
    <section className="gn-rail-group" aria-labelledby={id}>
      <header className="gn-rail-head">
        <h3 id={id} className="gn-rail-kick">{title}</h3>
        <span className="gn-rail-count">{count}</span>
      </header>
      <ul className="gn-opts">{children}</ul>
    </section>
  );
}

function Row({ name, sub, art, checked, showing, disabled, onPick, onTick, onPeek, extra }: {
  name: string; sub: string; art: ReactNode; checked: boolean; showing: boolean; disabled?: boolean;
  onPick: () => void; onTick: () => void; onPeek: () => void; extra?: ReactNode;
}) {
  const t = useT('finish');
  return (
    <li className={`gn-opt${checked ? ' is-checked' : ''}${showing ? ' is-showing' : ''}`} onMouseEnter={onPeek}>
      <label className="gn-opt-check" title={t('pv2.include', { name })}>
        <input type="checkbox" checked={checked} onChange={onTick} disabled={disabled} aria-label={t('pv2.include', { name })} />
        <span className="gn-box" aria-hidden="true"><Icon name="check" size={13} /></span>
      </label>
      <button type="button" className="gn-opt-main" aria-pressed={showing} onClick={onPick} onFocus={onPeek} disabled={disabled}
        aria-label={`${name}. ${sub}`} title={t('pv2.showOnPage', { name })}>
        {art}
        <span className="gn-opt-text">
          <span className="gn-opt-name">{name}</span>
          <span className="gn-opt-sub">{sub}</span>
        </span>
        {showing && <span className="gn-opt-tag">{t('pv2.showing')}</span>}
      </button>
      {extra}
    </li>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="gn-toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="gn-switch" aria-hidden="true" />
    </label>
  );
}
