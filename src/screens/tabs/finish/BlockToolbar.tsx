import type { ReactNode } from 'react';
import type { BlockStyle, CoverLayout, FormatSpec } from '@/data/types';
import { useT } from '@/i18n';
import { Icon } from '@/components/Icon';
import { STEP, controlsFor, kindOf, shownStyle, type BlockOp, type CoverOp } from './layout';

type Align = NonNullable<BlockStyle['align']>;

/** Small line drawings for alignment (four rules). */
function AlignGlyph({ a }: { a: Align }) {
  const rows = [16, 11, 16, 9];
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      {rows.map((w, i) => {
        const ww = a === 'justify' ? 16 : w;
        const x = a === 'left' || a === 'justify' ? 2 : a === 'right' ? 18 - ww : 10 - ww / 2;
        return <rect key={i} x={x} y={3 + i * 4} width={ww} height="1.8" rx=".9" fill="currentColor" />;
      })}
    </svg>
  );
}

function Btn({ label, onClick, on, children, disabled }: { label: string; onClick: () => void; on?: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={`gn-tb-btn${on ? ' is-on' : ''}`} onClick={onClick} aria-label={label} title={label} aria-pressed={on} disabled={disabled}>
      {children}
    </button>
  );
}

function Stepper({ label, value, onLess, onMore, min, max, unit }: { label: string; value: number; onLess: () => void; onMore: () => void; min: number; max: number; unit: string }) {
  const t = useT('finish');
  return (
    <span className="gn-tb-step" role="group" aria-label={label}>
      <span className="gn-tb-steplabel">{label}</span>
      <button type="button" className="gn-tb-btn gn-tb-sm" onClick={onLess} disabled={value <= min} aria-label={t('design.tb.less', { what: label })}>−</button>
      <span className="gn-tb-val" aria-live="polite">{unit}</span>
      <button type="button" className="gn-tb-btn gn-tb-sm" onClick={onMore} disabled={value >= max} aria-label={t('design.tb.more', { what: label })}>+</button>
    </span>
  );
}

const Sep = () => <span className="gn-tb-sep" aria-hidden="true" />;

interface Props {
  blockKey: string;
  spec: FormatSpec;
  name: string;
  /** Chapter headings: change this one or all of them. */
  scope: 'one' | 'all';
  onScope: (s: 'one' | 'all') => void;
  onBlock: (key: string, op: BlockOp, effect: string) => void;
  onCover: (op: CoverOp, effect: string) => void;
  onClose: () => void;
  /** Where the cover design places the title when the author hasn't moved it. */
  coverDefault?: CoverLayout['position'];
}

export function BlockToolbar({ blockKey, spec, name, scope, onScope, onBlock, onCover, onClose, coverDefault = 'bottom' }: Props) {
  const t = useT('finish');
  const kind = kindOf(blockKey);
  const key = kind === 'heading' && scope === 'all' ? 'all:chtitle' : blockKey;
  const c = controlsFor(blockKey);
  const s = shownStyle(spec, key);
  const fmtLines = (n: number) => t('design.tb.lines', { n: Number.isInteger(n) ? n : n.toFixed(1) });
  const op = (o: BlockOp, effect: string) => onBlock(key, o, effect);

  if (kind === 'cover') {
    const cv: CoverLayout = spec.layout?.cover ?? {};
    const pos = cv.position ?? coverDefault;
    const align = cv.align ?? (pos === 'center' ? 'center' : 'left');
    return (
      <div className="gn-tb" role="toolbar" aria-label={t('design.tb.label', { name })}>
        <span className="gn-tb-name">{name}</span>
        <Sep />
        <span className="gn-tb-group" role="group" aria-label={t('design.tb.position')}>
          {(['top', 'center', 'bottom'] as const).map((p) => (
            <Btn key={p} label={t(`design.tb.pos.${p}`)} on={pos === p} onClick={() => onCover({ set: { position: p } }, p === 'center' ? 'middle' : p)}>
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="2" width="14" height="16" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="5.5" y={p === 'top' ? 4.5 : p === 'center' ? 9 : 13.5} width="9" height="2" rx="1" fill="currentColor" /></svg>
            </Btn>
          ))}
        </span>
        <Sep />
        <span className="gn-tb-group" role="group" aria-label={t('design.tb.align')}>
          {(['left', 'center', 'right'] as const).map((a) => (
            <Btn key={a} label={t(`design.tb.al.${a}`)} on={align === a} onClick={() => onCover({ set: { align: a } }, a)}><AlignGlyph a={a} /></Btn>
          ))}
        </span>
        <Sep />
        <Stepper label={t('design.tb.size')} value={cv.scale ?? 1} min={0.6} max={1.6} unit={`${Math.round((cv.scale ?? 1) * 100)}%`}
          onLess={() => onCover({ addScale: -0.08 }, 'smaller')} onMore={() => onCover({ addScale: 0.08 }, 'bigger')} />
        <Sep />
        <button type="button" className="gn-tb-text" onClick={() => onCover({ reset: true }, 'reset')}><Icon name="undo" size={14} />{t('design.tb.reset')}</button>
        <button type="button" className="gn-tb-btn gn-tb-close" onClick={onClose} aria-label={t('design.tb.close')}><Icon name="x" size={16} /></button>
      </div>
    );
  }

  const aligns: Align[] = c.justify ? ['left', 'center', 'right', 'justify'] : ['left', 'center', 'right'];
  const curAlign = s.align;
  return (
    <div className="gn-tb" role="toolbar" aria-label={t('design.tb.label', { name })}>
      <span className="gn-tb-name">{name}</span>
      {kind === 'heading' && (
        <span className="gn-tb-scope" role="group" aria-label={t('design.tb.scope')}>
          <button type="button" className={scope === 'one' ? 'is-on' : ''} aria-pressed={scope === 'one'} onClick={() => onScope('one')}>{t('design.tb.scopeOne')}</button>
          <button type="button" className={scope === 'all' ? 'is-on' : ''} aria-pressed={scope === 'all'} onClick={() => onScope('all')}>{t('design.tb.scopeAll')}</button>
        </span>
      )}
      <Sep />
      {c.align && (
        <span className="gn-tb-group" role="group" aria-label={t('design.tb.align')}>
          {aligns.map((a) => <Btn key={a} label={t(`design.tb.al.${a}`)} on={curAlign === a} onClick={() => op({ set: { align: a } }, a)}><AlignGlyph a={a} /></Btn>)}
        </span>
      )}
      {c.move && (
        <>
          <Sep />
          <span className="gn-tb-group" role="group" aria-label={t('design.tb.move')}>
            <Btn label={t('design.tb.up')} onClick={() => op({ add: { shift: -STEP.shift } }, 'up')}><Icon name="up" size={16} /></Btn>
            <Btn label={t('design.tb.down')} onClick={() => op({ add: { shift: STEP.shift } }, 'down')}><Icon name="down" size={16} /></Btn>
          </span>
        </>
      )}
      {c.space && (
        <>
          <Sep />
          <Stepper label={t('design.tb.before')} value={s.spaceBefore ?? 0} min={0} max={12} unit={fmtLines(s.spaceBefore ?? 0)}
            onLess={() => op({ add: { spaceBefore: -STEP.space } }, 'spaceBeforeLess')} onMore={() => op({ add: { spaceBefore: STEP.space } }, 'spaceBeforeMore')} />
          <Stepper label={t('design.tb.after')} value={s.spaceAfter ?? 0} min={0} max={12} unit={fmtLines(s.spaceAfter ?? 0)}
            onLess={() => op({ add: { spaceAfter: -STEP.space } }, 'spaceAfterLess')} onMore={() => op({ add: { spaceAfter: STEP.space } }, 'spaceAfterMore')} />
        </>
      )}
      {c.size && (
        <>
          <Sep />
          <Stepper label={t('design.tb.size')} value={s.scale ?? 1} min={0.6} max={2.4} unit={`${Math.round((s.scale ?? 1) * 100)}%`}
            onLess={() => op({ add: { scale: -STEP.scale } }, 'smaller')} onMore={() => op({ add: { scale: STEP.scale } }, 'bigger')} />
        </>
      )}
      {(c.indent || c.italic) && <Sep />}
      {c.indent && (
        <Btn label={s.indent === false ? t('design.tb.indentOn') : t('design.tb.indentOff')} on={s.indent !== false} onClick={() => op({ set: { indent: s.indent === false } }, s.indent === false ? 'indentOn' : 'indentOff')}>
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="4" width="11" height="1.8" rx=".9" fill="currentColor" /><rect x="2" y="9" width="16" height="1.8" rx=".9" fill="currentColor" /><rect x="2" y="14" width="16" height="1.8" rx=".9" fill="currentColor" /><path d="M2 3l3 2-3 2z" fill="currentColor" /></svg>
        </Btn>
      )}
      {c.italic && (
        <Btn label={t('design.tb.italic')} on={!!s.italic} onClick={() => op({ set: { italic: !s.italic } }, s.italic ? 'italicOff' : 'italicOn')}>
          <span className="gn-tb-i" aria-hidden="true">I</span>
        </Btn>
      )}
      {(c.breakBefore || c.recto || c.blankAfter) && <Sep />}
      {c.breakBefore && (
        <button type="button" className={`gn-tb-text${s.breakBefore ? ' is-on' : ''}`} aria-pressed={!!s.breakBefore} onClick={() => op({ set: { breakBefore: !s.breakBefore } }, s.breakBefore ? 'noNewPage' : 'newPage')}>
          <Icon name="file" size={14} />{t('design.tb.newPage')}
        </button>
      )}
      {c.recto && (
        <button type="button" className={`gn-tb-text${s.recto !== false ? ' is-on' : ''}`} aria-pressed={s.recto !== false} onClick={() => op({ set: { recto: s.recto === false } }, s.recto === false ? 'recto' : 'anySide')}>
          <Icon name="book" size={14} />{t('design.tb.recto')}
        </button>
      )}
      {c.blankAfter && (
        <button type="button" className={`gn-tb-text${s.blankAfter ? ' is-on' : ''}`} aria-pressed={!!s.blankAfter} onClick={() => op({ set: { blankAfter: !s.blankAfter } }, s.blankAfter ? 'noBlank' : 'blankAfter')}>
          <Icon name="plus" size={14} />{t('design.tb.blankAfter')}
        </button>
      )}
      <Sep />
      <button type="button" className="gn-tb-text" onClick={() => op({ reset: true }, 'reset')}><Icon name="undo" size={14} />{t('design.tb.reset')}</button>
      <button type="button" className="gn-tb-btn gn-tb-close" onClick={onClose} aria-label={t('design.tb.close')}><Icon name="x" size={16} /></button>
    </div>
  );
}
