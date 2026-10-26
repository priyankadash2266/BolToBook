import { useMemo, useState } from 'react';
import type { Entity } from '@/data/types';
import { useT } from '@/i18n';
import { initials, type Connection } from './detect';
import { focusBox, hueIndex } from './look';

/**
 * A read-only constellation: each character is a medallion, each connection found in the author's words
 * a soft curved thread. Hover or focus a character to see only their threads; click to open their card.
 */
export function ConnectionsMap({ chars, connections }: { chars: Entity[]; connections: Map<string, Connection[]> }) {
  const t = useT('simple');
  const [hot, setHot] = useState<string | null>(null);
  const nodes = chars.filter((c) => c.name.trim() && connections.get(c.id)?.length);
  const W = 560, H = 360, cx = W / 2, cy = H / 2 - 4;
  const rx = nodes.length <= 4 ? 150 : 190, ry = nodes.length <= 4 ? 100 : 118;

  const pos = useMemo(() => new Map(nodes.map((c, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
    // A little drift per name so it reads as a constellation, not a clock face.
    const j = (hueIndex(c.name) - 3.5) * 5;
    return [c.id, { x: cx + (rx + j) * Math.cos(a), y: cy + (ry + j * 0.6) * Math.sin(a) }];
  })), [nodes.map((n) => n.id + n.name).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const stars = useMemo(() => Array.from({ length: 26 }, (_, i) => {
    const h = hueIndex(`star${i}`) * 97 + i * 53;
    return { x: (h * 7.3) % W, y: (h * 3.1 + i * 29) % H, r: 0.6 + (i % 3) * 0.45 };
  }), []);

  const lines: { a: string; b: string; w: number; scenes: number }[] = [];
  for (const c of nodes) for (const l of connections.get(c.id) ?? []) {
    if (c.id < l.id && pos.has(l.id)) lines.push({ a: c.id, b: l.id, w: 1.1 + Math.min(l.scenes, 6) * 0.4, scenes: l.scenes });
  }
  const linked = (id: string) => hot === id || lines.some((l) => (l.a === hot && l.b === id) || (l.b === hot && l.a === id));
  const short = (s: string) => (Array.from(s.trim()).length > 16 ? `${Array.from(s.trim()).slice(0, 15).join('')}…` : s.trim());
  const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? '';

  return (
    <figure className={`sim-map ${hot ? 'has-hot' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t('characters.map.aria', { n: nodes.length })}>
        <g className="sim-map-stars" aria-hidden="true">
          {stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} />)}
        </g>
        <g aria-hidden="true">
          {lines.map((l) => {
            const p = pos.get(l.a)!, q = pos.get(l.b)!;
            const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
            const k = 0.38;
            const c1 = { x: mx + (cx - mx) * k, y: my + (cy - my) * k };
            const on = hot && (l.a === hot || l.b === hot);
            return (
              <path
                key={`${l.a}-${l.b}`}
                className={`sim-map-line ${on ? 'is-on' : ''} ${l.scenes >= 2 ? 'is-scene' : 'is-named'}`}
                d={`M${p.x},${p.y} Q${c1.x},${c1.y} ${q.x},${q.y}`}
                strokeWidth={l.w}
              />
            );
          })}
        </g>
        {nodes.map((c) => {
          const p = pos.get(c.id)!;
          const links = connections.get(c.id) ?? [];
          const label = `${c.name}: ${links.map((l) => name(l.id)).filter(Boolean).join(', ')}`;
          return (
            <g
              key={c.id}
              className={`sim-map-node ${hot === c.id ? 'is-hot' : ''} ${hot && !linked(c.id) ? 'is-dim' : ''}`}
              style={{ ['--sim-hue' as string]: `var(--hue-${hueIndex(c.name)})` }}
              role="button"
              tabIndex={0}
              aria-label={label}
              onMouseEnter={() => setHot(c.id)}
              onMouseLeave={() => setHot(null)}
              onFocus={() => setHot(c.id)}
              onBlur={() => setHot(null)}
              onClick={() => focusBox(c.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusBox(c.id); } }}
            >
              <circle className="sim-map-halo" cx={p.x} cy={p.y} r={30} />
              <circle className="sim-map-disc" cx={p.x} cy={p.y} r={22} />
              <text x={p.x} y={p.y} dy="0.36em" textAnchor="middle" className="sim-map-ini">{initials(c.name)}</text>
              <text x={p.x} y={p.y + 40} textAnchor="middle" className="sim-map-name">{short(c.name)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sim-map-key">
        <span><i className="sim-map-key-line is-scene" aria-hidden="true" />{t('characters.map.keyScenes')}</span>
        <span><i className="sim-map-key-line is-named" aria-hidden="true" />{t('characters.map.keyNamed')}</span>
      </figcaption>
    </figure>
  );
}
