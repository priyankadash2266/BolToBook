import type { CoverSpec } from '@/data/types';

/** Four starting directions. Each is a full CoverSpec the author can then adjust. */
export const DIRECTIONS: (Omit<CoverSpec, 'seed'> & { key: string })[] = [
  { key: 'night', direction: 'night', mood: 'night', type: 'serif', motif: 'rail', layout: 'bottom' },
  { key: 'letter', direction: 'letter', mood: 'paper', type: 'italic', motif: 'letter', layout: 'top' },
  { key: 'hills', direction: 'hills', mood: 'monsoon', type: 'serif', motif: 'hills', layout: 'top' },
  { key: 'sun', direction: 'sun', mood: 'ember', type: 'sans', motif: 'sun', layout: 'center' },
];

export const MOOD_KEYS: CoverSpec['mood'][] = ['night', 'monsoon', 'paper', 'ember'];
export const TYPE_KEYS: CoverSpec['type'][] = ['serif', 'italic', 'sans', 'hand'];
export const MOTIF_KEYS: CoverSpec['motif'][] = ['rail', 'letter', 'hills', 'sun', 'none'];
export const LAYOUT_KEYS: CoverSpec['layout'][] = ['top', 'center', 'bottom'];

export const directionSpec = (i: number, seed = 1): CoverSpec => {
  const { key: _k, ...d } = DIRECTIONS[i];
  return { ...d, seed };
};

/** A new take: a new seed for the imagery, and every other take nudges the layout. */
export function newTake(spec: CoverSpec): CoverSpec {
  const seed = spec.seed + 1;
  const layouts = LAYOUT_KEYS;
  const layout = seed % 2 === 0 ? layouts[(layouts.indexOf(spec.layout) + 1) % layouts.length] : spec.layout;
  return { ...spec, seed, layout };
}

export const sameSpec = (a?: CoverSpec, b?: CoverSpec) =>
  !!a && !!b && a.mood === b.mood && a.type === b.type && a.motif === b.motif && a.layout === b.layout && a.seed === b.seed && a.direction === b.direction;
