import type { AppLang } from '@/data/types';

const loc = (lang: AppLang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');

export function fmtNumber(n: number, lang: AppLang) { return new Intl.NumberFormat(loc(lang)).format(n); }

export function fmtDate(iso: string, lang: AppLang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat(loc(lang), opts).format(new Date(iso));
}

export function fmtTime(iso: string, lang: AppLang) {
  return new Intl.DateTimeFormat(loc(lang), { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** "just now", "5 min ago", "yesterday", "12 Mar". */
export function fmtRelative(iso: string, lang: AppLang): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(loc(lang), { numeric: 'auto' });
  if (diff < 45) return rtf.format(0, 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400 && new Date().getDate() === d.getDate()) return rtf.format(-Math.round(diff / 3600), 'hour');
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5);
  if (days === 1) return rtf.format(-1, 'day');
  if (days < 7) return new Intl.DateTimeFormat(loc(lang), { weekday: 'long' }).format(d);
  return fmtDate(iso, lang, { day: 'numeric', month: 'short' });
}

export function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function download(filename: string, data: Blob | string, mime = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'book';
