import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * One notice system for the whole app. Notices float at the top of the screen, above everything,
 * and never push the page around. `tone: 'error'` is for things that went wrong (mic blocked,
 * voice service unreachable, a failed export); errors stay a little longer and can be dismissed.
 */
type Tone = 'info' | 'error';
interface ToastItem { id: number; text: string; tone: Tone; action?: { label: string; onClick: () => void } }
interface ToastCtx {
  show: (text: string, action?: ToastItem['action'], ms?: number, opts?: { tone?: Tone }) => void;
  error: (text: string, action?: ToastItem['action']) => void;
}
const Ctx = createContext<ToastCtx>({ show: () => {}, error: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastCtx['show']>((text, action, ms, opts) => {
    const tone = opts?.tone ?? 'info';
    setItems((xs) => {
      // The same message twice in a row (e.g. a mic error on every retry) shows once.
      if (xs.some((x) => x.text === text)) return xs;
      const id = Date.now() + Math.random();
      setTimeout(() => remove(id), ms ?? (tone === 'error' ? 7000 : 4200));
      return [...xs.slice(-2), { id, text, tone, action }];
    });
  }, [remove]);
  const error = useCallback<ToastCtx['error']>((text, action) => show(text, action, undefined, { tone: 'error' }), [show]);
  return (
    <Ctx.Provider value={{ show, error }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            {t.tone === 'error' ? <span className="toast-ico" aria-hidden="true"><Icon name="flag" size={14} /></span> : <span className="toast-dot" aria-hidden="true" />}
            <span className="toast-text">{t.text}</span>
            {t.action && <button onClick={() => { t.action!.onClick(); remove(t.id); }}>{t.action.label}</button>}
            {t.tone === 'error' && (
              <button className="toast-x" onClick={() => remove(t.id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

/** Shows `message` as an error notice at the top whenever it changes to something non-empty. */
export function useErrorNotice(message: string | null | undefined) {
  const { error } = useToast();
  const last = useRef<string | null | undefined>(null);
  useEffect(() => {
    if (message && message !== last.current) error(message);
    last.current = message;
  }, [message, error]);
}
