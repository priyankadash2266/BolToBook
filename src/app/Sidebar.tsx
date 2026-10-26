import { useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useT } from '@/i18n';
import { api } from '@/data/api';
import { useEntities, useFeedback, useLaps } from '@/data/hooks';
import { useCurrentBook, bookPath } from './context';
import { useCapture } from './CaptureLap';
import { tabsFor, tabCount, GROUPS } from './lifecycle';
import './sidebar.css';

/**
 * The book's places, grouped the way an author works: Gather · Write · Finish.
 * Laps carries its own quick mic (one place for ideas, reachable from anywhere).
 * Chapters lists every chapter underneath, so any chapter is one tap away.
 */
export function Sidebar({ collapsed, onToggle, variant = 'rail', onNavigate }: { collapsed?: boolean; onToggle?: () => void; variant?: 'rail' | 'sheet'; onNavigate?: () => void }) {
  const t = useT('lifecycle');
  const tc = useT('common');
  const { book, chapters } = useCurrentBook();
  const { data: entities } = useEntities(book?.id);
  const { data: laps } = useLaps({ bookId: book?.id });
  const { data: feedback } = useFeedback(book?.id);
  const capture = useCapture();
  const nav = useNavigate();
  const loc = useLocation();
  const [chaptersOpen, setChaptersOpen] = useState(true);
  const tabs = useMemo(() => (book ? tabsFor(book.type) : []), [book]);
  if (!book) return null;
  const ctx = { entities: entities ?? [], laps: laps ?? [], chapters, feedback: feedback ?? [] };
  const base = bookPath(book.id);
  const onDesk = loc.pathname.startsWith(`${base}/write`);
  const activeChapter = onDesk ? loc.pathname.split('/')[5] : undefined;
  const words = chapters.reduce((n, c) => n + c.wordCount, 0);
  const maxWords = Math.max(1, ...chapters.map((c) => c.wordCount));

  const newChapter = async () => {
    const ch = await api.chapters.create(book.id);
    onNavigate?.();
    nav(bookPath(book.id, 'write', ch.id));
  };
  const quickIdea = () => { onNavigate?.(); capture.open({ bookId: book.id }); };

  if (collapsed && variant === 'rail') {
    return (
      <nav className="sb sb-collapsed" aria-label={t('sidebar.label')}>
        <button className="sb-toggle" onClick={onToggle} aria-label={t('sidebar.expand')} title={t('sidebar.expand')}><Icon name="right" size={16} /></button>
        <button className="sb-railidea" onClick={quickIdea} aria-label={t('sidebar.capture')} title={t('sidebar.capture')}><Icon name="mic" size={17} /></button>
        {GROUPS.map((g) => (
          <div key={g} className="sb-railgroup">
            {tabs.filter((x) => x.group === g).map((tab) => (
              <NavLink
                key={tab.id}
                to={`${base}/${tab.id}`}
                className={({ isActive }) => `sb-railitem${isActive || (tab.id === 'chapters' && onDesk) ? ' is-active' : ''}`}
                title={t(`tabs.${tab.id}.label`)}
                aria-label={t(`tabs.${tab.id}.label`)}
              >
                <Icon name={tab.icon} size={18} />
              </NavLink>
            ))}
          </div>
        ))}
        <div className="sb-railfoot">
          <NavLink to={`${base}/history`} className="sb-railitem" title={t('sidebar.history')} aria-label={t('sidebar.history')}><Icon name="clock" size={18} /></NavLink>
        </div>
      </nav>
    );
  }

  return (
    <nav className={`sb sb-${variant}`} aria-label={t('sidebar.label')}>
      <div className="sb-book">
        <span className="sb-spine" aria-hidden="true"><span /></span>
        <span className="sb-bookmeta">
          <span className={`sb-booktitle${/[ऀ-ॿ]/.test(book.title) ? ' deva-book' : ''}`}>{book.title.trim() || tc('untitled')}</span>
          <span className="sb-bookwords">{t('sidebar.words', { n: words.toLocaleString() })}</span>
        </span>
        {variant === 'rail' && onToggle && (
          <button className="sb-toggle" onClick={onToggle} aria-label={t('sidebar.collapse')} title={t('sidebar.collapse')}><Icon name="left" size={16} /></button>
        )}
      </div>

      {GROUPS.map((g) => (
        <div key={g} className="sb-group">
          <div className="sb-grouplabel">{t(`groups.${g}`)}</div>
          <ul className="sb-list">
            {tabs.filter((x) => x.group === g).map((tab) => {
              const n = tabCount(tab, ctx);
              const isChapters = tab.id === 'chapters';
              const isLaps = tab.id === 'laps';
              return (
                <li key={tab.id}>
                  <div className="sb-row">
                    <NavLink
                      to={`${base}/${tab.id}`}
                      className={({ isActive }) => `sb-tab${isActive || (isChapters && onDesk) ? ' is-active' : ''}`}
                      onClick={onNavigate}
                      title={t(`tabs.${tab.id}.purpose`)}
                    >
                      <Icon name={tab.icon} size={16} />
                      <span className="sb-tabtext">
                        <span className="sb-tablabel">{t(`tabs.${tab.id}.label`)}</span>
                        <span className="sb-tabsub">{t(`tabs.${tab.id}.sub`)}</span>
                      </span>
                      {!isChapters && n !== undefined && n > 0 && <span className={tab.badge ? 'sb-badge' : 'sb-count'}>{n}</span>}
                    </NavLink>
                    {isLaps && (
                      <button className="sb-idea" onClick={quickIdea} aria-label={t('sidebar.capture')} title={t('sidebar.capture')}>
                        <Icon name="mic" size={15} />
                      </button>
                    )}
                    {isChapters && chapters.length > 0 && (
                      <button className="sb-caretbtn" onClick={() => setChaptersOpen((o) => !o)} aria-expanded={chaptersOpen} aria-label={t('sidebar.chapters')}>
                        <Icon name="down" size={14} className={`sb-caret${chaptersOpen ? ' is-open' : ''}`} />
                      </button>
                    )}
                  </div>
                  {isChapters && chaptersOpen && (
                    <ul className="sb-chapters">
                      {chapters.map((ch, i) => (
                        <li key={ch.id}>
                          <NavLink to={bookPath(book.id, 'write', ch.id)} className={`sb-chapter${activeChapter === ch.id ? ' is-active' : ''}`} onClick={onNavigate}>
                            <span className="sb-chnum">{i + 1}</span>
                            <span className="sb-chtext">
                              <span className="sb-tablabel">{ch.title.trim() || tc('chapterN', { n: i + 1 })}</span>
                              <span className="sb-chbar" aria-hidden="true"><span style={{ width: `${Math.round((ch.wordCount / maxWords) * 100)}%` }} /></span>
                            </span>
                            {ch.wordCount > 0 && <span className="sb-count">{ch.wordCount >= 1000 ? `${(ch.wordCount / 1000).toFixed(1)}k` : ch.wordCount}</span>}
                          </NavLink>
                        </li>
                      ))}
                      <li>
                        <button className="sb-chapter sb-newch" onClick={newChapter}><Icon name="plus" size={14} />{t('sidebar.newChapter')}</button>
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="sb-foot">
        <NavLink to={`${base}/history`} className={({ isActive }) => `sb-tab sb-tab-small${isActive ? ' is-active' : ''}`} onClick={onNavigate}><Icon name="clock" size={15} /><span className="sb-tablabel">{t('sidebar.history')}</span></NavLink>
        <Link to="/app/library" className="sb-tab sb-tab-small" onClick={onNavigate}><Icon name="book" size={15} /><span className="sb-tablabel">{t('sidebar.library')}</span></Link>
        <NavLink to="/app/settings" className="sb-tab sb-tab-small" onClick={onNavigate}><Icon name="gear" size={15} /><span className="sb-tablabel">{t('sidebar.settings')}</span></NavLink>
      </div>
    </nav>
  );
}
