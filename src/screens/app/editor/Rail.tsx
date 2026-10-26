import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useT } from '@/i18n';
import { bookPath } from '@/app/context';
import type { Chapter } from '@/data/types';

interface Props {
  bookId: string;
  chapters: Chapter[];
  currentId?: string;
  /** Live word count of the open chapter (the stored one lags by a moment). */
  currentWords: number;
  deva: boolean;
  onAdd: () => void;
  onRename: (ch: Chapter, title: string) => void;
  onMove: (ch: Chapter, dir: -1 | 1) => void;
  onDelete: (ch: Chapter) => void;
  onCollapse?: () => void;
  onNavigate?: () => void;
  drawer?: boolean;
  scanId?: string;
}

export function Rail(p: Props) {
  const t = useT('editor');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const off = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) { setMenuFor(null); setConfirming(null); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuFor(null); setConfirming(null); } };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [menuFor]);

  const name = (c: Chapter) => c.title.trim() || t('top.chapterN', { n: c.order });

  const startRename = (c: Chapter) => { setMenuFor(null); setRenaming(c.id); setDraft(c.title); };
  const finishRename = (c: Chapter) => {
    setRenaming(null);
    if (draft.trim() !== c.title.trim()) p.onRename(c, draft.trim());
  };

  return (
    <nav className="ed-rail-inner" aria-label={t('rail.label')}>
      <div className="ed-rail-head">
        <span className="kick">{t('rail.title')}</span>
        <span className="ed-rail-head-actions">
          <button type="button" className="btn btn-quiet btn-icon btn-sm" onClick={p.onAdd} aria-label={t('rail.add')} title={t('rail.add')}><Icon name="plus" size={16} /></button>
          {p.onCollapse && (
            <button type="button" className="btn btn-quiet btn-icon btn-sm" onClick={p.onCollapse} aria-label={p.drawer ? t('rail.close') : t('rail.collapse')} title={p.drawer ? t('rail.close') : t('rail.collapse')}>
              <Icon name={p.drawer ? 'x' : 'left'} size={16} />
            </button>
          )}
        </span>
      </div>
      <ol className="ed-rail-list">
        {p.chapters.map((c, i) => {
          const cur = c.id === p.currentId;
          const words = cur ? p.currentWords : c.wordCount;
          return (
            <li key={c.id} className={`ed-rail-item${cur ? ' is-current' : ''}${p.scanId === c.id ? ' is-scan' : ''}`}>
              {renaming === c.id ? (
                <form className="ed-rail-rename" onSubmit={(e) => { e.preventDefault(); finishRename(c); }}>
                  <span className="ed-rail-n">{c.order}</span>
                  <input
                    autoFocus
                    className={`input ed-rail-input${p.deva ? ' deva-book' : ''}`}
                    aria-label={t('rail.renameLabel')}
                    value={draft}
                    placeholder={t('top.chapterN', { n: c.order })}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => finishRename(c)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setRenaming(null); } }}
                  />
                </form>
              ) : (
                <>
                  <Link
                    to={bookPath(p.bookId, 'write', c.id)}
                    className="ed-rail-link"
                    aria-current={cur ? 'page' : undefined}
                    onClick={p.onNavigate}
                    onDoubleClick={() => startRename(c)}
                  >
                    <span className="ed-rail-n">{c.order}</span>
                    <span className={`ed-rail-t${c.title.trim() ? '' : ' is-ph'}${p.deva ? ' deva-book' : ''}`}>{name(c)}</span>
                    <span className="ed-rail-w">{words > 0 ? t('rail.words', { n: words >= 1000 ? (words / 1000).toFixed(1) + 'k' : words }) : ''}</span>
                  </Link>
                  <div className="ed-rail-more" ref={menuFor === c.id ? menuRef : undefined}>
                    <button type="button" className="ed-rail-dots" aria-label={t('rail.actions', { name: name(c) })} aria-expanded={menuFor === c.id} aria-haspopup="menu" onClick={() => { setConfirming(null); setMenuFor(menuFor === c.id ? null : c.id); }}>
                      <span aria-hidden="true">⋯</span>
                    </button>
                    {menuFor === c.id && (
                      <div className="app-menu ed-rail-menu rise" role="menu">
                        {confirming === c.id ? (
                          <div className="ed-rail-confirm">
                            <p>{c.wordCount ? t('rail.confirmDelete', { name: name(c), n: c.wordCount }) : t('rail.confirmDeleteEmpty', { name: name(c) })}</p>
                            <button type="button" className="btn btn-danger btn-sm" autoFocus onClick={() => { setMenuFor(null); setConfirming(null); p.onDelete(c); }}>{t('rail.confirmYes')}</button>
                          </div>
                        ) : (
                          <>
                            <button type="button" role="menuitem" className="app-menuitem" onClick={() => startRename(c)}><Icon name="pen" size={15} />{t('rail.rename')}</button>
                            <button type="button" role="menuitem" className="app-menuitem" disabled={i === 0} onClick={() => { setMenuFor(null); p.onMove(c, -1); }}><Icon name="up" size={15} />{t('rail.moveUp')}</button>
                            <button type="button" role="menuitem" className="app-menuitem" disabled={i === p.chapters.length - 1} onClick={() => { setMenuFor(null); p.onMove(c, 1); }}><Icon name="down" size={15} />{t('rail.moveDown')}</button>
                            <button type="button" role="menuitem" className="app-menuitem ed-danger" onClick={() => setConfirming(c.id)}><Icon name="trash" size={15} />{t('rail.delete')}</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn btn-quiet btn-sm ed-rail-add" onClick={p.onAdd}><Icon name="plus" size={15} />{t('rail.add')}</button>
    </nav>
  );
}
