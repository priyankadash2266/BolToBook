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
import locale0 from './locales/en/common';
import locale1 from './locales/en/cover2';
import locale2 from './locales/en/editor';
import locale3 from './locales/en/finish';
import locale4 from './locales/en/history';
import locale5 from './locales/en/kit';
import locale6 from './locales/en/landing';
import locale7 from './locales/en/laps';
import locale8 from './locales/en/library';
import locale9 from './locales/en/lifecycle';
import locale10 from './locales/en/onboarding';
import locale11 from './locales/en/settings';
import locale12 from './locales/en/simple';
import locale13 from './locales/en/write';
import locale14 from './locales/hi/common';
import locale15 from './locales/hi/cover2';
import locale16 from './locales/hi/editor';
import locale17 from './locales/hi/finish';
import locale18 from './locales/hi/history';
import locale19 from './locales/hi/kit';
import locale20 from './locales/hi/landing';
import locale21 from './locales/hi/laps';
import locale22 from './locales/hi/library';
import locale23 from './locales/hi/lifecycle';
import locale24 from './locales/hi/onboarding';
import locale25 from './locales/hi/settings';
import locale26 from './locales/hi/simple';
import locale27 from './locales/hi/write';
const modules = {
 './locales/en/common.ts': {default:locale0},
 './locales/en/cover2.ts': {default:locale1},
 './locales/en/editor.ts': {default:locale2},
 './locales/en/finish.ts': {default:locale3},
 './locales/en/history.ts': {default:locale4},
 './locales/en/kit.ts': {default:locale5},
 './locales/en/landing.ts': {default:locale6},
 './locales/en/laps.ts': {default:locale7},
 './locales/en/library.ts': {default:locale8},
 './locales/en/lifecycle.ts': {default:locale9},
 './locales/en/onboarding.ts': {default:locale10},
 './locales/en/settings.ts': {default:locale11},
 './locales/en/simple.ts': {default:locale12},
 './locales/en/write.ts': {default:locale13},
 './locales/hi/common.ts': {default:locale14},
 './locales/hi/cover2.ts': {default:locale15},
 './locales/hi/editor.ts': {default:locale16},
 './locales/hi/finish.ts': {default:locale17},
 './locales/hi/history.ts': {default:locale18},
 './locales/hi/kit.ts': {default:locale19},
 './locales/hi/landing.ts': {default:locale20},
 './locales/hi/laps.ts': {default:locale21},
 './locales/hi/library.ts': {default:locale22},
 './locales/hi/lifecycle.ts': {default:locale23},
 './locales/hi/onboarding.ts': {default:locale24},
 './locales/hi/settings.ts': {default:locale25},
 './locales/hi/simple.ts': {default:locale26},
 './locales/hi/write.ts': {default:locale27}
} as unknown as Record<string,{default:Dict}>;

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
