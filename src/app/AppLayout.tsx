import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Monogram, LangToggle } from '@/components/bits';
import { Icon } from '@/components/Icon';
import { useT, useLang } from '@/i18n';
import { api } from '@/data/api';
import { useBooks, useProfile } from '@/data/hooks';
import { useCapture } from './CaptureLap';
import { Sidebar } from './Sidebar';
import { CreditsChip } from '@/components/credits';
import type { AppLang } from '@/data/types';

/** Keeps the interface language in sync with the author's profile. */
export function useAppLangSync() {
  const { data: profile } = useProfile();
  const { lang, setLang } = useLang();
  useEffect(() => { if (profile && profile.appLang !== lang) setLang(profile.appLang); }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  return (l: AppLang) => { setLang(l); api.profile.update({ appLang: l }); };
}

function BookSwitcher({ bookId }: { bookId?: string }) {
  const t = useT('common');
  const { data: books } = useBooks();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  const book = books?.find((b) => b.id === bookId);
  return (
    <div ref={ref} className="app-switcher" style={{ position: 'relative', minWidth: 0 }}>
      <button className="app-bookbtn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="app-bookspine" aria-hidden="true" />
        <span style={{ minWidth: 0, textAlign: 'left' }}>
          <span className="app-booktitle">{book ? book.title || t('untitled') : t('nav.library')}</span>
          {book && <span className="app-bookmeta">{t(`bookTypes.${book.type}`)} · {t(`stages.${book.stage}`)}</span>}
        </span>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div className="app-menu rise" role="menu">
          {books?.map((b) => (
            <button key={b.id} role="menuitem" className="app-menuitem" onClick={() => { setOpen(false); nav(`/app/b/${b.id}`); }}>
              <span className="app-bookspine" style={{ height: 22 }} aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title || t('untitled')}</span>
              {b.id === bookId && <Icon name="check" size={14} />}
            </button>
          ))}
          <div className="divider" style={{ margin: '6px 0' }} />
          <Link role="menuitem" className="app-menuitem" to="/app/library" onClick={() => setOpen(false)}><Icon name="book" size={16} />{t('nav.library')}</Link>
          <Link role="menuitem" className="app-menuitem" to="/start?new=1" onClick={() => setOpen(false)}><Icon name="plus" size={16} />{t('actions.add')}</Link>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const t = useT('common');
  const tl = useT('lifecycle');
  const { bookId } = useParams();
  const { lang } = useLang();
  const setAppLang = useAppLangSync();
  const capture = useCapture();
  const [moreOpen, setMoreOpen] = useState(false);
  const loc = useLocation();
  useEffect(()=>{if(new URLSearchParams(loc.search).get('capture')==='1')capture.open({listen:false});},[]);
  const onDesk = /\/write(\/|$)/.test(loc.pathname);
  const key = onDesk ? 'dictationer.sidebar.collapsed.desk' : 'dictationer.sidebar.collapsed';
  const [collapsed, setCollapsed] = useState<boolean>(() => readFlag(key, false));
  useEffect(() => { setCollapsed(readFlag(key, false)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMoreOpen(false); }, [loc.pathname]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(key, c ? '0' : '1'); } catch { /* */ } return !c; });
  const base = bookId ? `/app/b/${bookId}` : '';

  return (
    <div className="app">
      <header className={`app-header${bookId ? ' app-header-book' : ''}`}>
        {bookId && (
          <button className="app-iconbtn app-mapbtn" onClick={() => setMoreOpen(true)} aria-label={tl('sidebar.map')}><Icon name="menu" /></button>
        )}
        <Monogram to="/app/library" />
        <BookSwitcher bookId={bookId} />
        <div className="app-header-right">
          <button className={`app-capture${bookId ? ' app-capture-book' : ''}`} onClick={() => capture.open({ bookId })} title={t('lap.shortcut')}>
            <Icon name="mic" size={15} />
            <span className="app-capture-label">{tl('sidebar.capture')}</span>
          </button>
          <CreditsChip />
          <span className="app-lang"><LangToggle value={lang} onChange={setAppLang} variant="night" /></span>
          <Link to="/app/settings" className="app-iconbtn" aria-label={t('nav.settings')}><Icon name="gear" /></Link>
        </div>
      </header>

      <div className="app-body">
        {bookId && <Sidebar collapsed={collapsed} onToggle={toggle} />}
        <main className="app-main" id="main">
          <Suspense fallback={<div className="app-loading" aria-busy="true" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile: capture first */}
      <nav className="app-tabbar" aria-label={t('nav.book')}>
        {bookId ? (
          <>
            <NavLink to={`${base}/manuscript`} className="app-tab"><Icon name="pen" /><span>{tl('tabs.manuscript.label')}</span></NavLink>
            <NavLink to={`${base}/chapters`} className="app-tab"><Icon name="list" /><span>{tl('tabs.chapters.label')}</span></NavLink>
          </>
        ) : (
          <>
            <NavLink to="/app/library" className="app-tab"><Icon name="book" /><span>{t('nav.library')}</span></NavLink>
            <span className="app-tab" />
          </>
        )}
        <button className="app-tab app-tab-capture" onClick={() => capture.open({ bookId })} aria-label={tl('sidebar.capture')}>
          <span><Icon name="mic" size={24} /></span>
        </button>
        <NavLink to={bookId ? `${base}/laps` : '/app/laps'} className="app-tab"><Icon name="bookmark" /><span>{t('nav.laps')}</span></NavLink>
        <button className="app-tab" onClick={() => setMoreOpen(true)}><Icon name="list" /><span>{bookId ? tl('sidebar.map') : t('nav.more')}</span></button>
      </nav>
      {moreOpen && (
        <div className="scrim app-sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)}>
          <div className="modal rise app-sheet" role="dialog" aria-modal="true" aria-label={tl('sidebar.map')}>
            <div className="app-sheet-head">
              <LangToggle value={lang} onChange={setAppLang} variant="night" />
              <button className="app-iconbtn" onClick={() => setMoreOpen(false)} aria-label={t('actions.close')}><Icon name="x" /></button>
            </div>
            {bookId ? <Sidebar variant="sheet" onNavigate={() => setMoreOpen(false)} /> : (
              <div style={{ display: 'grid', gap: 8 }}>
                <Link to="/app/library" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}><Icon name="book" size={16} />{t('nav.library')}</Link>
                <Link to="/app/settings" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}><Icon name="gear" size={16} />{t('nav.settings')}</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function readFlag(key: string, fallback: boolean) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; }
}
