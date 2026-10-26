import {IdeaAssembly} from '@/components/IdeaAssembly';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TabPage, useDeva } from '@/components/kit';
import { TabArt } from '@/components/TabArt';
import { Segmented } from '@/components/Segmented';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { api } from '@/data/api';
import { useLaps } from '@/data/hooks';
import { bookPath, useCurrentBook } from '@/app/context';
import { useT } from '@/i18n';
import type { Chapter } from '@/data/types';
import { ChapterCard, ChapterRow } from './write/ChapterCard';
import { AddChapterCard } from './write/AddChapterCard';
import './write/write.css';

type View = 'outline' | 'compact';
const VIEW_KEY = 'dictationer.chapters.view';
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'compact' ? 'compact' : 'outline'; } catch { return 'outline'; } };

/**
 * Chapters: plan first, then write. An outline board of chapter cards in order: what happens
 * (the outline, in the author's words), ideas kept for that chapter, progress, and the way into the desk.
 */
export default function Page() {
  const t = useT('write');
  const tc = useT('common');
  const toast = useToast();
  const nav = useNavigate();
  const { book, chapters } = useCurrentBook();
  const deva = useDeva();
  const { data: lapsData } = useLaps({ bookId: book?.id });
  const laps = useMemo(() => lapsData ?? [], [lapsData]);
  const [view, setView] = useState<View>(readView);
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [planning, setPlanning] = useState(false);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* */ } }, [view]);
  useEffect(() => { setOrder(null); }, [chapters]);

  const list = useMemo(() => {
    if (!order) return chapters;
    const byId = new Map(chapters.map((c) => [c.id, c]));
    const out = order.map((id) => byId.get(id)).filter((c): c is Chapter => !!c);
    return out.length === chapters.length ? out : chapters;
  }, [order, chapters]);

  if (!book) return null;
  const bookId = book.id;
  const totalWords = list.reduce((n, c) => n + c.wordCount, 0);
  const maxWords = Math.max(1, ...list.map((c) => c.wordCount));
  const ideaCount = laps.filter((l) => l.chapterId && l.status !== 'discarded' && list.some((c) => c.id === l.chapterId)).length;
  const done = list.filter((c) => c.status === 'done').length;

  const reorder = async (ids: string[], movedId: string) => {
    setOrder(ids);
    const pos = ids.indexOf(movedId) + 1;
    setSaid(''); setTimeout(() => setSaid(t('board.movedTo', { n: pos })), 30);
    await api.chapters.reorder(bookId, ids);
  };
  const move = (c: Chapter, dir: -1 | 1) => {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(c.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reorder(ids, c.id);
  };
  const dropOn = (targetId: string) => {
    const from = dragId;
    setDragId(null); setOverId(null);
    if (!from || from === targetId) return;
    const ids = list.map((x) => x.id);
    const a = ids.indexOf(from), b = ids.indexOf(targetId);
    if (a < 0 || b < 0) return;
    ids.splice(a, 1);
    ids.splice(b, 0, from);
    void reorder(ids, from);
  };
  const remove = async (c: Chapter) => {
    const i = list.indexOf(c);
    const name = c.title.trim() || tc('chapterN', { n: i + 1 });
    const snap = { title: c.title, content: c.content, goal: c.goal, notes: c.notes, status: c.status, position: i };
    const rest = list.filter((x) => x.id !== c.id);
    await api.chapters.remove(c.id);
    if (rest.length) await api.chapters.reorder(bookId, rest.map((x) => x.id));
    toast.show(t('board.deleted', { name }), {
      label: tc('actions.undo'),
      onClick: async () => {
        const created = await api.chapters.create(bookId, { title: snap.title, content: snap.content, goal: snap.goal, notes: snap.notes, order: snap.position + 1 });
        if (snap.status === 'done') await api.chapters.update(created.id, { status: 'done' });
        const now = (await api.chapters.list(bookId)).filter((x) => x.id !== created.id).map((x) => x.id);
        now.splice(snap.position, 0, created.id);
        await api.chapters.reorder(bookId, now);
        toast.show(t('board.restored'));
      },
    }, 8000);
  };

  const actions = list.length ? (
    <>
      <Segmented
        size="sm"
        label={t('board.viewLabel')}
        value={view}
        onChange={setView}
        options={[
          { value: 'outline', label: <span className="wr-seg"><Icon name="layout" size={14} />{t('board.outline')}</span>, ariaLabel: t('board.outline') },
          { value: 'compact', label: <span className="wr-seg"><Icon name="list" size={14} />{t('board.compact')}</span>, ariaLabel: t('board.compact') },
        ]}
      />
      <a href="#wr-add" className="btn btn-ghost btn-sm" onClick={(e) => { e.preventDefault(); const el = document.getElementById('wr-add'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); (el as HTMLButtonElement | null)?.click?.(); }}>
        <Icon name="plus" size={15} />{t('board.add')}
      </a>
    </>
  ) : undefined;

  return (
    <TabPage tabId="chapters" actions={actions} wide={view === 'outline'}>
      <IdeaAssembly/>
      <div className="sr-only" role="status" aria-live="polite">{said}</div>

      {list.length === 0 ? (
        <div className="wr-empty">
          <TabArt id="chapters" className="wr-empty-art" />
          <h2 className="wr-empty-title">{t('empty.title')}</h2>
          <p className="wr-empty-body">{t('empty.body')}</p>
          {planning ? (
            <div className="wr-empty-add"><AddChapterCard bookId={bookId} nextNumber={1} startOpen deva={deva} /></div>
          ) : (
            <div className="wr-empty-actions">
              <button type="button" className="btn btn-primary" onClick={() => setPlanning(true)}><Icon name="list" size={16} />{t('empty.plan')}</button>
              <Link to={bookPath(bookId, 'manuscript')} className="btn btn-ghost"><Icon name="pen" size={16} />{t('empty.write')}</Link>
            </div>
          )}
          <p className="wr-empty-foot">{t('empty.foot')}</p>
        </div>
      ) : (
        <>
          <div className="wr-summary" aria-label={t('board.summary')}>
            <span className="wr-sum"><strong>{list.length}</strong> {list.length === 1 ? t('board.chaptersOne') : t('board.chapters')}</span>
            <span className="wr-sum-dot" aria-hidden="true" />
            <span className="wr-sum"><strong>{totalWords.toLocaleString()}</strong> {totalWords === 1 ? t('board.wordOne') : t('board.words')}</span>
            <span className="wr-sum-dot" aria-hidden="true" />
            <span className="wr-sum"><strong>{ideaCount}</strong> {ideaCount === 1 ? t('board.ideaOne') : t('board.ideas')}</span>
            <span className="wr-sum-dot" aria-hidden="true" />
            <span className="wr-sum"><strong>{done}</strong> {t('board.done')}</span>
            <Link to={bookPath(bookId, 'manuscript')} className="wr-sum-link"><Icon name="pen" size={14} />{t('board.toManuscript')}</Link>
          </div>

          {view === 'outline' ? (
            <div className="wr-board" onDragLeave={(e) => { if (e.currentTarget === e.target) setOverId(null); }}>
              {list.map((c, i) => (
                <ChapterCard
                  key={c.id}
                  bookId={bookId}
                  chapter={c}
                  index={i}
                  total={list.length}
                  laps={laps}
                  maxWords={maxWords}
                  deva={deva}
                  onMove={(d) => move(c, d)}
                  onDelete={() => void remove(c)}
                  drag={{
                    dragging: dragId === c.id,
                    over: !!dragId && overId === c.id && dragId !== c.id,
                    onStart: () => setDragId(c.id),
                    onOver: () => { if (dragId) setOverId(c.id); },
                    onDrop: () => dropOn(c.id),
                    onEnd: () => { setDragId(null); setOverId(null); },
                  }}
                />
              ))}
              <AddChapterCard bookId={bookId} nextNumber={list.length + 1} deva={deva} />
            </div>
          ) : (
            <>
              <ol className="wr-rows">
                {list.map((c, i) => (
                  <ChapterRow key={c.id} bookId={bookId} chapter={c} index={i} total={list.length} laps={laps} deva={deva} onMove={(d) => move(c, d)} />
                ))}
              </ol>
              <div className="wr-rows-add"><AddChapterCard bookId={bookId} nextNumber={list.length + 1} deva={deva} compact /></div>
            </>
          )}
          <p className="wr-foot">
            <button type="button" className="wr-foot-link" onClick={() => nav(bookPath(bookId, 'write', list[0].id))}>{t('board.startAt')}</button>
          </p>
        </>
      )}
    </TabPage>
  );
}
