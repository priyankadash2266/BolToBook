/**
 * The front cover with the author's cover layout (title position, alignment, size) applied,
 * and the back cover. The front is drawn exactly like <CoverArt> (same SVG, same 600×900 grid)
 * so that with no layout changes the two are identical; it adds the three layout options and
 * a `data-k` on the title so it can be selected on the page.
 */
import type { CSSProperties } from 'react';
import type { CoverLayout, CoverSpec } from '@/data/types';
import { COVER_FONTS, DEFAULT_COVER, MOODS } from '@/components/CoverArt';

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
  layout?: CoverLayout;
  width?: number;
  /** Fill a box of another shape (the trim): the art is cropped like a printed cover. */
  height?: number;
  deva?: boolean;
  selectable?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function DesignedCover({ title, author, subtitle, spec = DEFAULT_COVER, layout, width = 600, height, deva, selectable, className, style }: Props) {
  const m = MOODS[spec.mood];
  const f = COVER_FONTS[spec.type];
  const W = 600, H = 900;
  const position = layout?.position ?? spec.layout;
  const align = layout?.align ?? (position === 'center' ? 'center' : 'left');
  const scale = layout?.scale ?? 1;
  const t = title.trim() || ' ';
  const len = t.length;
  const baseSize = (len < 14 ? 92 : len < 24 ? 76 : len < 40 ? 62 : 50) * f.scale * scale;
  const lines = wrap(t, Math.max(6, Math.round(560 / (baseSize * 0.52))));
  const lh = baseSize * 1.04;
  const blockH = lines.length * lh;
  const titleY = position === 'top' ? 190 + Math.max(0, baseSize - baseSize / scale) * 0.87 : position === 'center' ? H / 2 - blockH / 2 + baseSize * 0.8 : H - 170 - blockH + baseSize * 0.8;
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const x = align === 'center' ? W / 2 : align === 'right' ? W - 56 : 56;
  const motifY = spec.layout === 'top' ? 640 : spec.layout === 'center' ? 230 : 330;
  const family = deva ? "'Tiro Devanagari Hindi', serif" : f.family;
  const r = (n: number) => ((Math.sin(spec.seed * 9301 + n * 49297) + 1) / 2);
  const h = height ?? (width * 3) / 2;

  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} width={width} height={h} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${title} — ${author}`} style={style}>
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
      <text x={x} y={position === 'top' ? 92 : 80} fill={m.fg} fontFamily="'Hanken Grotesk', sans-serif" fontSize="20" letterSpacing="6" textAnchor={anchor} opacity=".85">
        {(subtitle ?? '').toUpperCase()}
      </text>
      <text data-k={selectable ? 'cover:title' : undefined} fill={m.fg} fontFamily={family} fontWeight={f.weight} fontStyle={f.italic && !deva ? 'italic' : 'normal'} fontSize={baseSize} letterSpacing={f.tracking} textAnchor={anchor}>
        {lines.map((l, i) => <tspan key={i} x={x} y={titleY + i * lh}>{l}</tspan>)}
      </text>
      <text x={x} y={H - 70} fill={m.fg} fontFamily={deva ? "'Mukta', sans-serif" : "'Hanken Grotesk', sans-serif"} fontSize="24" letterSpacing={deva ? 1 : 7} textAnchor={anchor}>
        {deva ? author : author.toUpperCase()}
      </text>
    </svg>
  );
}

/** The back cover: the author's few lines from the Brief, their name, and room for the barcode. */
export function BackCover({ spec = DEFAULT_COVER, blurb, author, placeholder, barcode, deva, width, height, blurbCss }: {
  spec?: CoverSpec; blurb: string; author: string; placeholder: string; barcode: string; deva: boolean; width: number; height: number; blurbCss?: CSSProperties;
}) {
  const m = MOODS[spec.mood];
  const u = width / 100;
  return (
    <div className="gn-back" style={{ width, height, background: m.bg, color: m.fg, padding: `${12 * u}px ${11 * u}px` }}>
      <div className={`gn-back-blurb ${deva ? 'deva-book' : 'book'}`} data-k="back:blurb" style={{ fontSize: `calc(${(4.1 * u).toFixed(2)}px * var(--s, 1))`, ...blurbCss }}>
        {blurb.trim() ? blurb.trim().split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>) : <p className="gn-back-ph">{placeholder}</p>}
      </div>
      <div className="gn-back-foot">
        <span className="gn-back-author" style={{ fontSize: 3.4 * u, letterSpacing: deva ? 0 : '.16em' }}>{deva ? author : author.toUpperCase()}</span>
        <span className="gn-back-code" style={{ width: 30 * u, height: 18 * u, fontSize: 2.4 * u }}>{barcode}</span>
      </div>
      <span className="gn-back-rule" style={{ background: m.acc }} aria-hidden="true" />
    </div>
  );
}
