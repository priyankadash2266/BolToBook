import { useCallback, useEffect, useRef, useState } from 'react';

/** Debounce a save; pending calls are flushed on unmount so nothing the author typed is lost. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...a: A) => void | Promise<unknown>, ms = 600) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<A | null>(null);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current) {
      const a = pending.current;
      pending.current = null;
      void fnRef.current(...a);
    }
  }, []);
  const call = useCallback((...a: A) => {
    pending.current = a;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, ms);
  }, [ms, flush]);
  useEffect(() => flush, [flush]);
  return { call, flush };
}

/**
 * Deletes after a grace period so "Undo" in the toast keeps the very same record.
 * Pending deletes are carried out if the page closes.
 */
export function useDeferredRemove(remove: (id: string) => Promise<unknown>, ms = 5200) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const removeRef = useRef(remove);
  removeRef.current = remove;
  const unhide = (id: string) => setHidden((s) => { const n = new Set(s); n.delete(id); return n; });
  const schedule = useCallback((id: string) => {
    setHidden((s) => new Set(s).add(id));
    const tm = setTimeout(() => {
      timers.current.delete(id);
      removeRef.current(id).catch(() => unhide(id));
    }, ms);
    timers.current.set(id, tm);
  }, [ms]);
  const undo = useCallback((id: string) => {
    const tm = timers.current.get(id);
    if (tm) clearTimeout(tm);
    timers.current.delete(id);
    unhide(id);
  }, []);
  useEffect(() => () => {
    timers.current.forEach((tm, id) => { clearTimeout(tm); removeRef.current(id).catch(() => {}); });
    timers.current.clear();
  }, []);
  return { hidden, schedule, undo };
}

export type SaveState = 'idle' | 'saving' | 'saved';
