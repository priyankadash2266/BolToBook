import type {JSX} from 'react';
/**
 * Small visual pieces shared by Brief · Characters · World · Plot / Timeline:
 * per-name colours, portrait medallions, place motifs, numerals, and scrolling to a box.
 * Everything here is decoration or navigation; nothing writes words for the author.
 */
import type { CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import type { BoxFolds } from '@/components/kit';
import { useT } from '@/i18n';
import { isDevanagari } from '@/lib/text';
import { initials } from './detect';

/* ------------------------------------------------------------------ */
/* Folding                                                             */
/* ------------------------------------------------------------------ */

/** The chevron in a card header that folds the card down to its title. */
export function FoldToggle({ folded, onClick, name, controls }: { folded: boolean; onClick: () => void; name: string; controls?: string }) {
  const t = useT('simple');
  const label = folded ? t('fold.open', { name: name.trim() || t('fold.this') }) : t('fold.close', { name: name.trim() || t('fold.this') });
  return (
    <button type="button" className={`sim-fold ${folded ? 'is-folded' : ''}`} onClick={onClick} aria-expanded={!folded} aria-controls={controls} aria-label={label} title={label}>
      <Icon name="down" size={16} />
    </button>
  );
}

/** "Fold all" / "Unfold all" for a list of cards. */
export function FoldAll({ folds, ids }: { folds: BoxFolds; ids: string[] }) {
  const t = useT('simple');
  if (ids.length < 2) return null;
  const all = folds.allFolded(ids);
  return (
    <button type="button" className="btn btn-quiet btn-sm sim-foldall" onClick={() => folds.setAll(!all)} aria-pressed={all}>
      <Icon name={all ? 'down' : 'up'} size={15} />
      {all ? t('fold.unfoldAll') : t('fold.foldAll')}
    </button>
  );
}

/** A stable 1–6 from a string, used to pick --hue-1..6. */
export function hueIndex(seed: string): number {
  let h = 2166136261;
  for (const ch of seed.trim().toLocaleLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 6) + 1;
}

/** The CSS variable --sim-hue for a name's colour (tints are mixed from it in CSS). */
export function hueStyle(name: string, fallback = ''): CSSProperties {
  const n = hueIndex(name.trim() || fallback || '?');
  return { ['--sim-hue' as string]: `var(--hue-${n})` } as CSSProperties;
}

/** Round portrait with the name's initials in italic display type. */
export function Medallion({ name, fallback, size = 56, className = '' }: { name: string; fallback?: string; size?: number; className?: string }) {
  const empty = !name.trim();
  return (
    <span
      className={`sim-med ${empty ? 'is-empty' : ''} ${isDevanagari(name) ? 'is-deva' : ''} ${className}`}
      style={{ ...hueStyle(name, fallback), width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      <span className="sim-med-ini">{empty ? '' : initials(name)}</span>
    </span>
  );
}

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scroll a box into view and put the cursor in its title. */
export function focusBox(id: string) {
  const el = document.getElementById(`box-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
  el.classList.remove('sim-flash');
  void el.offsetWidth;
  el.classList.add('sim-flash');
  (document.getElementById(`bx-t-${id}`) as HTMLInputElement | null)?.focus({ preventScroll: true });
}

export function toRoman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

/** The first sentence of a description, for a one-line epigraph. */
export function firstLine(text: string, max = 110): string {
  const s = text.trim();
  if (!s) return '';
  const m = s.match(/^.+?[.!?।](?=\s|$)/u);
  const line = (m ? m[0] : s.split('\n')[0]).trim();
  const chars = Array.from(line);
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : line;
}

/* ------------------------------------------------------------------ */
/* Place motifs: a small landscape per place, picked by its name       */
/* ------------------------------------------------------------------ */

const L = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const MOTIFS: JSX.Element[] = [
  // Hills with a winding road
  <g key="hills" {...L}>
    <path d="M0 62c30-22 52-26 80-8 24-18 52-24 90-4 22-12 40-14 70 2" />
    <path d="M0 74c40-12 70-12 110 0s80 10 130-4" opacity=".55" />
    <path d="M118 74c-6-6 10-10 4-16s8-8 4-12" opacity=".55" />
    <circle cx="196" cy="22" r="9" className="sim-mo-sun" />
  </g>,
  // Sea and a far shore
  <g key="sea" {...L}>
    <path d="M0 46h70c10-10 24-12 36-4 10-6 22-6 30 0h104" opacity=".7" />
    <path d="M0 58c10-4 20-4 30 0s20 4 30 0 20-4 30 0 20 4 30 0 20-4 30 0 20 4 30 0 20-4 30 0 20 4 30 0" />
    <path d="M10 70c10-4 20-4 30 0s20 4 30 0 20-4 30 0 20 4 30 0 20-4 30 0 20 4 30 0 20-4 30 0" opacity=".5" />
    <path d="M168 40l8-18 8 18M176 22v18" opacity=".6" />
  </g>,
  // A city skyline
  <g key="city" {...L}>
    <path d="M0 76h240" opacity=".5" />
    <path d="M14 76V44h18v32M32 76V30h14v46M46 76V52h22v24M78 76V36l10-8 10 8v40M104 76V48h16v28M128 76V22h12v54M140 76V40h20v36M168 76V54h14v22M190 76V34c6-8 14-8 20 0v42M214 76V50h16v26" />
    <path d="M36 38h6M36 46h6M132 30h4M132 38h4M132 46h4" opacity=".5" />
  </g>,
  // A forest of pines
  <g key="forest" {...L}>
    <path d="M0 76h240" opacity=".5" />
    <path d="M24 76V66M14 66l10-26 10 26zM58 76V62M46 62l12-32 12 32zM96 76V68M88 68l8-20 8 20zM140 76V60M126 60l14-36 14 36zM182 76V66M172 66l10-26 10 26zM214 76V70M208 70l6-16 6 16z" />
    <circle cx="204" cy="20" r="6" className="sim-mo-sun" />
  </g>,
  // Dunes under a low sun
  <g key="dunes" {...L}>
    <circle cx="120" cy="54" r="16" className="sim-mo-sun" />
    <path d="M0 60c30-14 60-14 96 2 34-16 70-18 144-2" />
    <path d="M0 74c40-12 84-12 120 0 40-10 80-10 120 0" opacity=".55" />
  </g>,
  // Mountains with snow lines
  <g key="peaks" {...L}>
    <path d="M0 76l44-46 22 22 30-38 40 46 22-18 40 34h42" />
    <path d="M86 26l10 8 8-6M36 38l8 6 8-6" opacity=".6" />
    <path d="M0 76h240" opacity=".4" />
  </g>,
];

/** A tinted strip of landscape for a place card header. */
export function PlaceMotif({ name, fallback, className = '' }: { name: string; fallback?: string; className?: string }) {
  const n = hueIndex(name.trim() || fallback || '?');
  const motif = MOTIFS[(hueIndex(`${name}#m`) + n) % MOTIFS.length];
  return (
    <svg className={`sim-motif ${className}`} viewBox="0 0 240 84" preserveAspectRatio="xMidYMax slice" aria-hidden="true" style={hueStyle(name, fallback)}>
      {motif}
      {/* A small compass in the corner */}
      <g className="sim-mo-compass" transform="translate(222 18)">
        <circle r="9" fill="none" stroke="currentColor" strokeWidth=".9" />
        <path d="M0-12l2.6 12L0 12l-2.6-12z" fill="currentColor" opacity=".8" />
      </g>
    </svg>
  );
}

/** A tiny landscape glyph for chips in the atlas line. */
export function PlaceDot({ name, fallback }: { name: string; fallback?: string }) {
  return <span className="sim-pdot" style={hueStyle(name, fallback)} aria-hidden="true" />;
}
