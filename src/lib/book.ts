/**
 * Detection helpers over the author's manuscript. They find where the author's own words
 * appear; they never advise or change anything.
 */
import type { Chapter } from '@/data/types';
import { escapeRegExp, toParagraphs } from '@/lib/text';
import { plainOf } from '@/lib/markdown';

/** Case-insensitive whole-word matcher that also works for Devanagari (no \b). */
export function nameRegex(name: string): RegExp | null {
  const n = name.trim();
  if (n.length < 2) return null;
  try {
    return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRegExp(n)}(?![\\p{L}\\p{M}\\p{N}])`, 'giu');
  } catch {
    return null;
  }
}

/** How many times `name` is written in each chapter (same order as `chapters`). */
export function mentionCounts(name: string, chapters: Chapter[]): number[] {
  const re = nameRegex(name);
  return chapters.map((ch) => {
    if (!re || !ch.content) return 0;
    re.lastIndex = 0;
    return (ch.content.match(re) ?? []).length;
  });
}

/** Every paragraph that mentions `name`, in reading order. */
export function mentionsOf(name: string, chapters: Chapter[]): { chapter: Chapter; chapterIndex: number; paraIndex: number; text: string }[] {
  const re = nameRegex(name);
  if (!re) return [];
  const out: { chapter: Chapter; chapterIndex: number; paraIndex: number; text: string }[] = [];
  chapters.forEach((chapter, chapterIndex) => {
    toParagraphs(chapter.content).forEach((raw, paraIndex) => {
      const text = plainOf(raw);
      re.lastIndex = 0;
      if (re.test(text)) out.push({ chapter, chapterIndex, paraIndex, text });
    });
  });
  return out;
}

/** Index (0-based) of the first chapter that mentions `name`, or -1. */
export function firstMention(name: string, chapters: Chapter[]): number {
  return mentionCounts(name, chapters).findIndex((c) => c > 0);
}
