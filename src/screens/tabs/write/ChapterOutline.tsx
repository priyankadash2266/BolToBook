import { useEffect, useRef, useState } from 'react';
import { api } from '@/data/api';
import { SaveNote, VoiceTextarea } from '@/components/kit';
import { useDebouncedCallback } from '@/lib/hooks';
import { useT } from '@/i18n';
import type { Chapter } from '@/data/types';

/**
 * The chapter's outline in the author's own words (stored as chapter.goal), typed or spoken.
 * Mount with key={chapter.id} so a pending save always lands on the chapter it was written for.
 */
export function ChapterOutline({ chapter, rows = 3, hideLabel, className = '' }: { chapter: Chapter; rows?: number; hideLabel?: boolean; className?: string }) {
  const t = useT('write');
  const [goal, setGoal] = useState(chapter.goal ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const lastEdit = useRef(0);
  useEffect(() => { if (Date.now() - lastEdit.current > 2000) setGoal(chapter.goal ?? ''); }, [chapter.goal]);
  const saver = useDebouncedCallback(async (id: string, v: string) => {
    await api.chapters.update(id, { goal: v.trim() });
    setState('saved');
  }, 650);

  return (
    <div className={`wr-outline ${className}`}>
      <VoiceTextarea
        id={`wr-goal-${chapter.id}`}
        label={t('outline.label')}
        hideLabel={hideLabel}
        placeholder={t('outline.ph')}
        value={goal}
        rows={rows}
        onChange={(v) => { lastEdit.current = Date.now(); setGoal(v); setState('saving'); saver.call(chapter.id, v); }}
      />
      <SaveNote state={state} />
    </div>
  );
}
