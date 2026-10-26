import { useEffect, useRef, useState, type RefObject } from 'react';

/** True when the visitor asked the OS for less motion. Follows live changes. */
export function useReducedMotion(): boolean {
  const q = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** True while the element is at least partly on screen. */
export function useOnScreen<T extends Element>(ref: RefObject<T | null>, margin = '0px'): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin, threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}

/**
 * A looping clock in seconds, driven by requestAnimationFrame and throttled to ~12 updates
 * a second (enough for word-by-word text). Stops completely while `running` is false, and
 * also while the tab is hidden (rAF does not fire).
 */
export function useLoopClock(loop: number, running: boolean, start = 0) {
  const [t, setT] = useState(start);
  const tRef = useRef(start);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      acc += dt;
      tRef.current = (tRef.current + dt) % loop;
      if (acc >= 0.08) { acc = 0; setT(tRef.current); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running, loop]);
  return t;
}
