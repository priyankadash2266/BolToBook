import { Component, type ReactNode } from 'react';
import { translate } from '@/i18n';
import type { AppLang } from '@/data/types';

/**
 * Catches a page that fails to load or draw, so the author sees a calm message (and the details to send us)
 * instead of a blank screen. The rest of the app keeps working.
 */
export class PageBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[Dictationer] page failed:', error); }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const lang = (document.documentElement.lang === 'hi' ? 'hi' : 'en') as AppLang;
    const t = (k: string) => translate(lang, 'common', `pageError.${k}`);
    const details = `${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(0, 6).join('\n')}`;
    return (
      <div className="kit-page" role="alert">
        <div className="empty" style={{ textAlign: 'left', maxWidth: 680 }}>
          <h3>{t('title')}</h3>
          <p style={{ margin: '0 0 16px' }}>{t('body')}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => location.reload()}>{t('reload')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard?.writeText(details); }}>{t('copy')}</button>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--ink-3)', background: 'var(--desk-2)', padding: 12, borderRadius: 8, margin: 0 }}>{details}</pre>
        </div>
      </div>
    );
  }
}
