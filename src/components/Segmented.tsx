import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface SegOption<T extends string> { value: T; label: ReactNode; ariaLabel?: string; lang?: string }

interface Props<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark' | 'night';
  label: string;
  className?: string;
}

/**
 * The one toggle used everywhere (language, view modes, filters).
 * Geometry is concentric: indicator radius = track radius − inset, so the inner and
 * outer curves stay parallel at every size. The indicator slides under the active option.
 */
export function Segmented<T extends string>({ options, value, onChange, size = 'md', variant = 'light', label, className = '' }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const track = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[idx];
      const tr = track.current;
      if (!el || !tr) return;
      const pad = parseFloat(getComputedStyle(tr).paddingLeft) || 0;
      setInd({ x: el.offsetLeft - pad, w: el.offsetWidth });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && track.current) ro.observe(track.current);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro?.disconnect();
  }, [idx, options.length]);

  const cls = ['seg', size === 'sm' ? 'seg-sm' : size === 'lg' ? 'seg-lg' : '', variant === 'dark' ? 'seg-dark' : variant === 'night' ? 'seg-night' : '', className].join(' ');
  return (
    <div ref={track} className={cls} role="group" aria-label={label}>
      <span className="seg-indicator" aria-hidden="true" style={ind ? { width: ind.w, transform: `translateX(${ind.x}px)` } : { opacity: 0 }} />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          aria-pressed={o.value === value}
          aria-label={o.ariaLabel}
          lang={o.lang}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
