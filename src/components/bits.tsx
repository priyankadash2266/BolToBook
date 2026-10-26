import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Segmented } from './Segmented';
import { TabArt } from './TabArt';
import { LANGS, useT } from '@/i18n';
import type { AppLang } from '@/data/types';

export function Wordmark({ to = '/', light = false, size = 24 }: { to?: string; light?: boolean; size?: number }) {
  return (
    <Link to={to} aria-label="Dictationer" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, textDecoration: 'none', color: light ? '#F4EFE6' : 'var(--brand)' }}>
      <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontWeight: 600, fontSize: size, letterSpacing: '-0.01em' }}>Dictationer</span>
      <span style={{ width: size / 4, height: size / 4, borderRadius: '50%', background: light ? '#E08A6F' : 'var(--edit)', display: 'inline-block' }} />
    </Link>
  );
}

export function Monogram({ to = '/app' }: { to?: string }) {
  return (
    <Link to={to} aria-label="Dictationer" style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: 'var(--mono, var(--brand))', textDecoration: 'none', lineHeight: 1 }}>
      D<span style={{ color: 'var(--mono-dot, var(--edit))' }}>.</span>
    </Link>
  );
}

/** EN | हिं — the same toggle on every page. */
export function LangToggle({ value, onChange, variant = 'light', size = 'sm' }: { value: AppLang; onChange: (l: AppLang) => void; variant?: 'light' | 'night'; size?: 'sm' | 'md' }) {
  const t = useT('common');
  return (
    <Segmented
      label={t('lang.label')}
      size={size}
      variant={variant}
      value={value}
      onChange={onChange}
      options={LANGS.map((l) => ({ value: l.code, label: l.short, ariaLabel: l.label, lang: l.code }))}
    />
  );
}

/**
 * An inviting empty state. `art` is a TabArt id (e.g. "laps") or your own decorative drawing;
 * without it a small brass ornament sits above the title.
 */
export function EmptyState({ title, body, children, art, className = '' }: { title: ReactNode; body?: ReactNode; children?: ReactNode; art?: string | ReactNode; className?: string }) {
  return (
    <div className={`empty ${className}`}>
      {typeof art === 'string' ? <TabArt id={art} className="empty-art" />
        : art ? <span className="empty-art" aria-hidden="true">{art}</span>
        : <span className="ornament empty-orn" aria-hidden="true" />}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {children}
    </div>
  );
}

export function PageHeader({ kicker, title, sub, actions }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
      <div style={{ minWidth: 0 }}>
        {kicker && <div className="kick" style={{ marginBottom: 8 }}>{kicker}</div>}
        <h1 className="display" style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', lineHeight: 1.1 }}>{title}</h1>
        {sub && <p className="muted" style={{ marginTop: 8, fontSize: 16, maxWidth: 640 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

/** Text that may be Devanagari: picks the right book face. */
export function BookText({ text, className = '', style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const deva = /[ऀ-ॿ]/.test(text);
  return <span className={`${deva ? 'deva-book' : 'book'} ${className}`} style={style}>{text}</span>;
}
