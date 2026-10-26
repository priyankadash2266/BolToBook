import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/data/api';
import type { Chapter, VersionOptions } from '@/data/types';
import { diffStats } from '@/lib/diff';

const SAVE_MS = 700;
const CHECKPOINT_MS = 5 * 60 * 1000;

export type SaveState = 'saved' | 'saving' | 'error';

/**
 * The local draft of one chapter.
 * - Typing updates local text immediately; the server gets it ~700ms after the author pauses.
 * - Typing becomes a recoverable version at most every 5 minutes of activity, on chapter switch and on leave.
 * - Server refreshes (another tab, a restore) are adopted only when nothing local is unsaved,
 *   so the caret and scroll never jump while the author is writing.
 */
export function useDraft(chapter: Chapter | undefined, typingSummary: (added: number, removed: number) => string) {
  const id = chapter?.id;
  const [text, setTextState] = useState('');
  const [loadedId, setLoadedId] = useState<string | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const idRef = useRef<string | undefined>(undefined);
  const textRef = useRef('');
  const baselineRef = useRef('');
  const lastSentRef = useRef('');
  const pendingRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstEditRef = useRef<number | null>(null);
  const lastDoneRef = useRef(0);
  const chapterRef = useRef(chapter);
  chapterRef.current = chapter;
  const summaryRef = useRef(typingSummary);
  summaryRef.current = typingSummary;

  const settle = useCallback(() => {
    if (!timerRef.current && pendingRef.current === 0) setSaveState(textRef.current===lastSentRef.current?'saved':'error');
  }, []);

  const adopt = useCallback(() => {
    const ch = chapterRef.current;
    if (!ch || ch.id !== idRef.current) return;
    if (pendingRef.current > 0 || timerRef.current) return;
    if (textRef.current !== lastSentRef.current) return;
    if (Date.now() - lastDoneRef.current < 200) { setTimeout(adopt, 220); return; }
    if (ch.content !== textRef.current) {
      textRef.current = baselineRef.current = lastSentRef.current = ch.content;
      setTextState(ch.content);
    }
  }, []);

  const send = useCallback(async (cid: string, content: string, version?: VersionOptions) => {
    pendingRef.current++;
    if (cid === idRef.current) lastSentRef.current = content;
    try {
      await api.chapters.update(cid, { content }, version);
      if(localStorage.getItem(`dictationer.draft.${cid}`)===content)localStorage.removeItem(`dictationer.draft.${cid}`);
    } catch {
      // Keep the text local; the next save tries again.
      if (cid === idRef.current) lastSentRef.current = '\u0000';
    } finally {
      pendingRef.current--;
      lastDoneRef.current = Date.now();
      settle();
      setTimeout(adopt, 230);
    }
  }, [adopt, settle]);

  /** Turns typing since the last version into one version (before = last version point). */
  const checkpointWith = useCallback(async (cid: string, content: string, base: string, sent: string) => {
    if (content === base) {
      if (content !== sent) await send(cid, content);
      return;
    }
    const { added, removed } = diffStats(base, content);
    pendingRef.current++;
    try {
      // The version must span the whole typing session, so the stored text steps back to the last version point first.
      // Never temporarily replace saved text with an older checkpoint.
      await send(cid, content, { source: 'typing', summary: summaryRef.current(added, removed) });
      if (cid === idRef.current) { baselineRef.current = content; firstEditRef.current = null; }
    } finally {
      pendingRef.current--;
      settle();
    }
  }, [send, settle]);

  const save = useCallback(async () => {
    timerRef.current = null;
    const cid = idRef.current;
    if (!cid) return;
    const content = textRef.current;
    if (content === lastSentRef.current) { settle(); return; }
    const due = firstEditRef.current !== null && Date.now() - firstEditRef.current >= CHECKPOINT_MS;
    if (due && content !== baselineRef.current) await checkpointWith(cid, content, baselineRef.current, lastSentRef.current);
    else await send(cid, content);
  }, [checkpointWith, send, settle]);

  // Load a chapter; when leaving it (switch or unmount), keep its typing as a version.
  useEffect(() => {
    const ch = chapterRef.current;
    if (!ch) return;
    const cid = ch.id;
    idRef.current = cid;
    const recovery=localStorage.getItem(`dictationer.draft.${cid}`);
    textRef.current = recovery??ch.content;baselineRef.current = lastSentRef.current = ch.content;
    firstEditRef.current = null;
    setTextState(textRef.current);
    setLoadedId(cid);
    setSaveState(recovery!==null&&recovery!==ch.content?'error':'saved');
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      const content = textRef.current, base = baselineRef.current, sent = lastSentRef.current;
      idRef.current = undefined;
      checkpointWith(cid, content, base, sent).catch(() => {});
    };
  }, [id, checkpointWith]);

  // Adopt server text (other tab, restore) when nothing local is waiting.
  useEffect(() => { adopt(); }, [chapter?.content, chapter?.id, adopt]);

  // Leaving the page: write whatever is pending right away.
  useEffect(() => {
    // Plain write only: never step back to the version point while the page may be closing.
    const flushNow = () => {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const cid = idRef.current;
      if (cid && textRef.current !== lastSentRef.current) void send(cid, textRef.current);
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flushNow(); };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pagehide', flushNow); document.removeEventListener('visibilitychange', onVis); };
  }, [send]);

  const setText = useCallback((s: string) => {
    textRef.current = s;
    if(idRef.current)localStorage.setItem(`dictationer.draft.${idRef.current}`,s);
    setTextState(s);
    if (firstEditRef.current === null) firstEditRef.current = Date.now();
    setSaveState('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void save(); }, SAVE_MS);
  }, [save]);

  /** Records any typing as its own version now (before dictation or a voice edit). */
  const checkpoint = useCallback(async () => {
    const cid = idRef.current;
    if (!cid) return;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    await checkpointWith(cid, textRef.current, baselineRef.current, lastSentRef.current);
  }, [checkpointWith]);

  /** Writes new chapter text as one version (dictation, voice edit, undo). */
  const commit = useCallback(async (content: string, version: VersionOptions) => {
    const cid = idRef.current;
    if (!cid) return;
    setSaveState('saving');
    await checkpoint();
    if (cid !== idRef.current) { await api.chapters.update(cid, { content }, version); return; }
    textRef.current = baselineRef.current = content;
    firstEditRef.current = null;
    setTextState(content);
    await send(cid, content, version);
  }, [checkpoint, send]);

  return { text, textRef, loadedId, saveState, setText, checkpoint, commit, retry:save };
}

export type Draft = ReturnType<typeof useDraft>;
