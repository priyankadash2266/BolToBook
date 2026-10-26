import type { CoverSpec } from '@/data/types';

export const DEFAULT_COVER: CoverSpec = { direction: 'night', mood: 'night', type: 'serif', motif: 'rail', layout: 'bottom', seed: 1 };

export const MOODS: Record<CoverSpec['mood'], { bg: string; fg: string; acc: string; acc2: string }> = {
  night: { bg: '#22324A', fg: '#EDE6D8', acc: '#C9A44A', acc2: '#3A4D69' },
  monsoon: { bg: '#183C39', fg: '#EDE6D8', acc: '#8FB3A3', acc2: '#24504B' },
  paper: { bg: '#E8DFCC', fg: '#183C39', acc: '#8C6F4A', acc2: '#D6CAB2' },
  ember: { bg: '#B8432F', fg: '#FCFAF5', acc: '#1E2422', acc2: '#C9604C' },
};

export const COVER_FONTS: Record<CoverSpec['type'], { family: string; weight: number; italic: boolean; scale: number; tracking: number }> = {
  serif: { family: "'Fraunces', Georgia, serif", weight: 400, italic: false, scale: 1, tracking: -0.5 },
  italic: { family: "'Fraunces', Georgia, serif", weight: 400, italic: true, scale: 1.04, tracking: 0 },
  sans: { family: "'Hanken Grotesk', sans-serif", weight: 600, italic: false, scale: 0.86, tracking: -1 },
  hand: { family: "'Caveat', cursive", weight: 500, italic: false, scale: 1.25, tracking: 0 },
};

/** Greedy line breaking for SVG text. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5);
}

interface Props {
  title: string;
  author: string;
  subtitle?: string;
  spec?: CoverSpec;
  width?: number;
  className?: string;
  /** Devanagari titles use the Devanagari book face. */
  deva?: boolean;
  id?: string;
}

/**
 * The book cover, drawn as SVG so it scales from a 48px thumbnail to print and can be
 * exported directly (see lib/exporters). 2:3 aspect ratio, viewBox 600×900.
 */
export function CoverArt({ title, author, subtitle, spec = DEFAULT_COVER, width = 200, className, deva, id }: Props) {
  const m = MOODS[spec.mood];
  const f = COVER_FONTS[spec.type];
  const W = 600, H = 900;
  const t = title.trim() || ' ';
  const len = t.length;
  const baseSize = (len < 14 ? 92 : len < 24 ? 76 : len < 40 ? 62 : 50) * f.scale;
  const lines = wrap(t, Math.max(8, Math.round(560 / (baseSize * 0.52))));
  const lh = baseSize * 1.04;
  const blockH = lines.length * lh;
  const titleY = spec.layout === 'top' ? 190 : spec.layout === 'center' ? H / 2 - blockH / 2 + baseSize * 0.8 : H - 170 - blockH + baseSize * 0.8;
  const anchor = spec.layout === 'center' ? 'middle' : 'start';
  const x = spec.layout === 'center' ? W / 2 : 56;
  const motifY = spec.layout === 'top' ? 640 : spec.layout === 'center' ? 230 : 330;
  const family = deva ? "'Tiro Devanagari Hindi', serif" : f.family;
  const r = (n: number) => ((Math.sin(spec.seed * 9301 + n * 49297) + 1) / 2);

  return (
    <svg id={id} className={className} viewBox={`0 0 ${W} ${H}`} width={width} height={(width * 3) / 2} role="img" aria-label={`${title} — ${author}`} style={{ borderRadius: width < 80 ? 2 : 3 }}>
      <rect width={W} height={H} fill={m.bg} />
      {spec.motif === 'rail' && (
        <g>
          <line x1="-10" x2={W + 10} y1={motifY} y2={motifY} stroke={m.acc} strokeWidth="5" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={70 + i * 118 + r(i) * 6} y={motifY - 62} width={i === 0 ? 112 : 104} height="56" rx={i === 0 ? 14 : 4} fill={m.acc} opacity={1 - i * 0.22} />
          ))}
          <circle cx={W - 120} cy={motifY - 190} r="46" fill="none" stroke={m.acc} strokeWidth="4" />
          <line x1={W - 120} y1={motifY - 190} x2={W - 120 + 20} y2={motifY - 220} stroke={m.acc} strokeWidth="4" strokeLinecap="round" />
        </g>
      )}
      {spec.motif === 'letter' && (
        <g transform={`translate(${W / 2} ${motifY - 40}) rotate(${-6 + r(1) * 4})`}>
          <rect x="-150" y="-95" width="300" height="190" fill="#F4EFE6" />
          <path d="M-150 -95 L0 20 L150 -95" fill="none" stroke={m.acc} strokeWidth="4" />
          <rect x="88" y="-80" width="44" height="52" fill="none" stroke={m.acc} strokeWidth="3" strokeDasharray="6 5" />
        </g>
      )}
      {spec.motif === 'hills' && (
        <g>
          <path d={`M0 ${motifY + 120} L120 ${motifY + 40} L240 ${motifY + 100} L380 ${motifY + 10} L500 ${motifY + 80} L600 ${motifY + 30} L600 ${H} L0 ${H}Z`} fill={m.acc} opacity=".32" />
          <path d={`M0 ${motifY + 200} L180 ${motifY + 130} L330 ${motifY + 190} L470 ${motifY + 140} L600 ${motifY + 180} L600 ${H} L0 ${H}Z`} fill={m.acc} opacity=".7" />
          {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={180 + i * 46 + r(i) * 20} cy={motifY + 175 - r(i + 3) * 30} r="5" fill="#F6D98A" />)}
        </g>
      )}
      {spec.motif === 'sun' && (
        <g>
          <circle cx={W / 2} cy={motifY} r="150" fill={m.acc} />
          <rect x="0" y={motifY + 30} width={W} height="140" fill={m.bg} opacity=".88" />
        </g>
      )}
      <text x={x} y={spec.layout === 'top' ? 92 : 80} fill={m.fg} fontFamily="'Hanken Grotesk', sans-serif" fontSize="20" letterSpacing="6" textAnchor={anchor} opacity=".85">
        {(subtitle ?? '').toUpperCase()}
      </text>
      <text fill={m.fg} fontFamily={family} fontWeight={f.weight} fontStyle={f.italic && !deva ? 'italic' : 'normal'} fontSize={baseSize} letterSpacing={f.tracking} textAnchor={anchor}>
        {lines.map((l, i) => <tspan key={i} x={x} y={titleY + i * lh}>{l}</tspan>)}
      </text>
      <text x={x} y={H - 70} fill={m.fg} fontFamily={deva ? "'Mukta', sans-serif" : "'Hanken Grotesk', sans-serif"} fontSize="24" letterSpacing={deva ? 1 : 7} textAnchor={anchor}>
        {deva ? author : author.toUpperCase()}
      </text>
    </svg>
  );
}
