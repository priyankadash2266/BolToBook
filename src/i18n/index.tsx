/**
 * i18n. Each namespace lives in its own file: src/i18n/locales/<lang>/<namespace>.ts,
 * exporting a default nested object of strings. Adding a language = adding a folder.
 *
 *   const t = useT('editor');
 *   t('dock.dictate')                 // "Dictate"
 *   t('words', { n: 12 })             // "{n} words" → "12 words"
 *
 * Missing keys fall back to English, then to the key itself.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppLang } from '@/data/types';

type Dict = { [k: string]: string | Dict };
const modules = import.meta.glob('./locales/*/*.ts', { eager: true }) as unknown as Record<string,{default:Dict}>;

const catalog: Record<string, Record<string, Dict>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const m = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.ts$/);
  if (!m) continue;
  (catalog[m[1]] ??= {})[m[2]] = mod.default;
}

export const LANGS: { code: AppLang; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हिं' },
];

function lookup(d: Dict | undefined, key: string): string | undefined {
  if (!d) return undefined;
  const direct = d[key];
  if (typeof direct === 'string') return direct;
  // Walk dotted paths; keys may themselves contain dots (e.g. "trim.5.5x8.5").
  let i = key.indexOf('.');
  while (i > 0) {
    const head = d[key.slice(0, i)];
    if (head && typeof head !== 'string') {
      const r = lookup(head, key.slice(i + 1));
      if (r !== undefined) return r;
    }
    i = key.indexOf('.', i + 1);
  }
  return undefined;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nCtx { lang: AppLang; setLang: (l: AppLang) => void }
const Ctx = createContext<I18nCtx>({ lang: 'en', setLang: () => {} });

export function I18nProvider({ children, initial = 'en' }: { children: ReactNode; initial?: AppLang }) {
  const [lang, setLang] = useState<AppLang>(initial);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function translate(lang: AppLang, ns: string, key: string, vars?: Record<string, string | number>): string {
  let s = lookup(catalog[lang]?.[ns], key) ?? lookup(catalog.en?.[ns], key) ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function useT(ns: string): TFn {
  const { lang } = useLang();
  return useCallback((key, vars) => translate(lang, ns, key, vars), [lang, ns]);
}

/** Returns a raw sub-object (for lists such as FAQ items). */
export function useDict<T = Dict>(ns: string, key: string): T | undefined {
  const { lang } = useLang();
  const pick = (l: string) => {
    let cur: string | Dict | undefined = catalog[l]?.[ns];
    for (const part of key.split('.')) { if (!cur || typeof cur === 'string') return undefined; cur = cur[part]; }
    return cur as unknown as T;
  };
  return pick(lang) ?? pick('en');
}
