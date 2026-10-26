import { useEffect, useRef, useState } from 'react';
import { api } from '@/data/api';
import type { Chapter } from '@/data/types';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useT } from '@/i18n';
import { isDevanagari } from '@/lib/text';

type Action = 'move' | 'copy';

/**
 * Shown while the author has text selected on the page: move or copy that passage into any
 * chapter, or into a new one named right here. Nothing is reworded; the passage goes in exactly
 * as written, at the end of the chosen chapter, as a new restorable version. Moving takes it out
 * of this page as a version too, so both sides can be undone.
 */
export function SelectionBar({ bookId, chapters, current, isDraft, selected, words, openSignal, onTakeOut, onPutBack, onDone }: {
  bookId: string;
  chapters: Chapter[];
  current: Chapter;
  isDraft: boolean;
  /** The selected passage as chapter Markdown (formatting goes with it). */
  selected: string;
  /** Words in the passage (marks not counted). */
  words?: number;
  /** Changes when the floating bar's "Move to chapter" is pressed: opens the move menu. */
  openSignal?: number;
  /** Removes the passage from this page (versioned). Resolves with the text as it was before. */
  onTakeOut: (summary: string, command: string) => Promise<string | undefined>;
  onPutBack: (prev: string, summary: string) => void;
  onDone: () => void;
}) {
  const t = useT('editor');
  const tc = useT('common');
  const toast = useToast();
  const others = chapters.filter((c) => c.id !== current.id);
  const [open, setOpen] = useState<Action | null>(null);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const passage = selected.trim();
  const n = words ?? (passage ? passage.split(/\s+/).length : 0);

  useEffect(() => { if (openSignal) { setNaming(false); setOpen('move'); } }, [openSignal]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(null); setNaming(false); } };
    document.addEventListener('keydown', esc, true);
    return () => document.removeEventListener('keydown', esc, true);
  }, [open]);

  const nameOf = (c: Chapter, i: number) => `${tc('chapterN', { n: i + 1 })}${c.title.trim() ? ` · ${c.title.trim()}` : ''}`;
  const fromLabel = isDraft ? t('sel.fromMs') : nameOf(current, chapters.findIndex((x) => x.id === current.id));

  const place = async (action: Action, target: { id: string } | { title: string }) => {
    if (!passage || busy) return;
    setBusy(true);
    try {
      let ch: Chapter | undefined;
      let created = false;
      if ('id' in target) ch = (await api.chapters.get(target.id)) ?? chapters.find((c) => c.id === target.id);
      else { ch = await api.chapters.create(bookId, { title: target.title.trim() }); created = true; }
      if (!ch) return;
      const index = created ? chapters.length : chapters.findIndex((c) => c.id === ch!.id);
      const name = nameOf(ch, index);
      const old = ch.content;
      const base = old.replace(/\s+$/, '');
      const content = base ? `${base}\n\n${passage}` : passage;
      await api.chapters.update(ch.id, { content }, { source: 'typing', summary: t('sel.version', { from: fromLabel }) });
      const prev = action === 'move' ? await onTakeOut(t('sel.movedOut', { to: name }), `move:${ch.id}`) : undefined;
      const target2 = ch;
      toast.show(action === 'move' ? t('sel.moved', { to: name }) : t('sel.copied', { to: name }), {
        label: tc('actions.undo'),
        onClick: () => {
          if (created) void api.chapters.remove(target2.id);
          else void api.chapters.update(target2.id, { content: old }, { source: 'restore', summary: t('sel.undone') });
          if (prev !== undefined) onPutBack(prev, t('sel.undone'));
        },
      }, 7000);
      setOpen(null); setNaming(false); setTitle('');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="ed-selbar rise" role="group" aria-label={t('sel.label')} ref={ref}>
      <span className="ed-selbar-lead"><Icon name="file" size={15} />{n === 1 ? t('sel.leadOne') : t('sel.lead', { n })}</span>
      <span className="ed-selbar-actions">
        <button type="button" className="btn btn-primary btn-sm" aria-expanded={open === 'move'} aria-haspopup="menu" onMouseDown={keep} onClick={() => { setNaming(false); setOpen(open === 'move' ? null : 'move'); }}>
          {t('sel.moveTo')}<Icon name="up" size={14} />
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === 'copy'} aria-haspopup="menu" onMouseDown={keep} onClick={() => { setNaming(false); setOpen(open === 'copy' ? null : 'copy'); }}>
          {t('sel.copyTo')}
        </button>
      </span>

      {open && (
        <div className="ed-selmenu rise" role="menu" aria-label={open === 'move' ? t('sel.moveTo') : t('sel.copyTo')}>
          <div className="ed-selmenu-head">{open === 'move' ? t('sel.moveHead') : t('sel.copyHead')}</div>
          {others.length > 0 && (
            <ul className="ed-selmenu-list">
              {others.map((c) => {
                const i = chapters.findIndex((x) => x.id === c.id);
                return (
                  <li key={c.id}>
                    <button type="button" role="menuitem" className="ed-selmenu-item" disabled={busy} onMouseDown={keep} onClick={() => place(open, { id: c.id })}>
                      <span className="ed-selmenu-n">{i + 1}</span>
                      <span className={`ed-selmenu-t${c.title.trim() ? '' : ' is-ph'}${isDevanagari(c.title) ? ' deva-book' : ''}`}>{c.title.trim() || tc('chapterN', { n: i + 1 })}</span>
                      <span className="ed-selmenu-w">{c.wordCount ? t('sel.words', { n: c.wordCount.toLocaleString() }) : t('sel.emptyCh')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {naming ? (
            <form className="ed-selmenu-new" onSubmit={(e) => { e.preventDefault(); void place(open, { title }); }}>
              <label htmlFor="ed-sel-newtitle" className="sr-only">{t('sel.newTitle')}</label>
              <input
                id="ed-sel-newtitle"
                className="input"
                autoFocus
                value={title}
                placeholder={t('sel.newPh', { n: chapters.length + 1 })}
                onChange={(e) => setTitle(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{open === 'move' ? t('sel.createMove') : t('sel.createCopy')}</button>
            </form>
          ) : (
            <button type="button" role="menuitem" className="ed-selmenu-item ed-selmenu-newbtn" onMouseDown={keep} onClick={() => setNaming(true)}>
              <span className="ed-selmenu-n"><Icon name="plus" size={14} /></span>
              <span className="ed-selmenu-t">{t('sel.newChapter')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
