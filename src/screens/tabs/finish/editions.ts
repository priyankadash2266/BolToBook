/**
 * Generated versions ('edition' entities): a frozen copy of the text, layout and cover.
 * name = label; fields: n, format (FormatSpec JSON), cover (CoverSpec JSON or ''), chapters
 * (JSON [{id,title,content}]), words, pages, trim.
 */
import type { Book, Chapter, CoverSpec, Entity, FormatSpec } from '@/data/types';
import { countWords } from '@/lib/text';

export interface SnapChapter { id: string; title: string; content: string }

export interface Snapshot {
  id: string;
  label: string;
  createdAt: string;
  n: number;
  spec: FormatSpec;
  cover?: CoverSpec;
  chapters: SnapChapter[];
  words: number;
  pages: number;
}

function json<T>(s: string | undefined): T | undefined {
  if (!s) return undefined;
  try { return JSON.parse(s) as T; } catch { return undefined; }
}

export function snapshotOf(e: Entity): Snapshot | undefined {
  const spec = json<FormatSpec>(e.fields.format);
  const chapters = json<SnapChapter[]>(e.fields.chapters);
  if (!spec || !Array.isArray(chapters)) return undefined;
  return {
    id: e.id, label: e.name, createdAt: e.createdAt, n: Number(e.fields.n) || 0, spec,
    cover: json<CoverSpec>(e.fields.cover), chapters,
    words: Number(e.fields.words) || 0, pages: Number(e.fields.pages) || 0,
  };
}

/** Chapter objects built from a snapshot, for preview and export (never saved). */
export function snapshotChapters(s: Snapshot, bookId: string): Chapter[] {
  return s.chapters.map((c, i) => ({
    id: c.id, bookId, order: i, title: c.title, content: c.content, status: 'done', wordCount: countWords(c.content),
    createdAt: s.createdAt, updatedAt: s.createdAt,
  }));
}

export const snapshotBook = (book: Book, s: Snapshot): Book => ({ ...book, format: s.spec, cover: s.cover ?? book.cover });

export const nextNumber = (items: Entity[]) => items.reduce((m, e) => Math.max(m, Number(e.fields.n) || 0), 0) + 1;
