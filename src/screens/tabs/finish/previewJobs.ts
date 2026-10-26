/**
 * Preview and export jobs.
 *
 * "Make previews" lays the book out once per size × style and keeps each result as a variant (an 'edition'
 * entity, see variants.ts). Exports turn one kept variant into a file. The page talks only to
 * `startPreviews`, `usePreviewJob` and `runExport`; where the work happens sits behind two small interfaces:
 *
 *  - PreviewRunner (today LocalPreviewRunner): paginates in the browser with lib/paginate, one variant after
 *    another, reporting progress per variant. A backend plugs in with the same shape, e.g.
 *
 *      class HttpPreviewRunner implements PreviewRunner {
 *        async run(input, onProgress, signal) {
 *          // POST /books/:id/preview-runs { requests }  → 202 { runId }   (server charges + refunds)
 *          // WS   /ws/preview-runs/:runId:  { key, fraction } | { key, done, pages } | { key, failed }
 *          //      → onProgress({ key, status, fraction, pages })
 *          // resolve with every outcome; on abort DELETE /preview-runs/:runId
 *        }
 *      }
 *      setPreviewRunner(new HttpPreviewRunner());
 *
 *  - ExportRunner (today LocalExportRunner): the print window (PDF via the browser's "Save as PDF") and the EPUB
 *    builder in lib/exporters. A backend would return a file URL instead.
 *
 * Job state lives in this module (not in a component), so leaving the tab and coming back shows the same run.
 */
import { createElement, useSyncExternalStore } from 'react';
import { api } from '@/data/api';
import type { Book, Chapter, FormatSpec } from '@/data/types';
import { paginate, type PrintLabels } from '@/lib/paginate';
import { bookChapters, coverInputOf, coverPng, downloadEpub, writePrintBook } from '@/lib/exporters';
import { DesignedCover } from './DesignedCover';
import { snapChaptersOf, specPrint, textPrint, type Combo, type ExportRecord, type Variant } from './variants';
import { snapshotBook, snapshotChapters } from './editions';

/* ------------------------------------------------------------------ */
/* Runner interfaces                                                    */
/* ------------------------------------------------------------------ */

export interface PreviewRequest { key: string; spec: FormatSpec }
export interface PreviewInput { book: Book; chapters: Chapter[]; labels: PrintLabels; requests: PreviewRequest[] }
export type ItemStatus = 'queued' | 'working' | 'done' | 'failed';
export interface PreviewProgress { key: string; status: ItemStatus; fraction: number; pages?: number }
export interface PreviewOutcome { key: string; ok: boolean; pages: number }

export interface PreviewRunner {
  run(input: PreviewInput, onProgress: (p: PreviewProgress) => void, signal: AbortSignal): Promise<PreviewOutcome[]>;
}

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 30));

export class LocalPreviewRunner implements PreviewRunner {
  async run(input: PreviewInput, onProgress: (p: PreviewProgress) => void, signal: AbortSignal) {
    const out: PreviewOutcome[] = [];
    const chapters = bookChapters(input.chapters);
    for (const r of input.requests) {
      if (signal.aborted) break;
      onProgress({ key: r.key, status: 'working', fraction: 0.02 });
      try {
        const res = await paginate({ book: { ...input.book, format: r.spec }, chapters, spec: r.spec, labels: input.labels }, {
          signal,
          onProgress: (p) => onProgress({ key: r.key, status: 'working', fraction: Math.max(0.04, Math.min(0.97, p.progress)), pages: p.total }),
        });
        onProgress({ key: r.key, status: 'done', fraction: 1, pages: res.total });
        out.push({ key: r.key, ok: true, pages: res.total });
      } catch (e) {
        if ((e as Error).name === 'AbortError') break;
        onProgress({ key: r.key, status: 'failed', fraction: 1 });
        out.push({ key: r.key, ok: false, pages: 0 });
      }
      await yieldFrame();
    }
    return out;
  }
}

let runner: PreviewRunner = new LocalPreviewRunner();
export const setPreviewRunner = (r: PreviewRunner) => { runner = r; };

/* ------------------------------------------------------------------ */
/* Job store                                                            */
/* ------------------------------------------------------------------ */

export interface JobItem extends PreviewProgress { combo: Combo; label: string; variantId?: string }
export interface PreviewJob { id: string; bookId: string; startedAt: string; items: JobItem[]; running: boolean }

let jobs: Record<string, PreviewJob | undefined> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
function patchJob(bookId: string, fn: (j: PreviewJob) => PreviewJob) {
  const j = jobs[bookId];
  if (!j) return;
  jobs = { ...jobs, [bookId]: fn(j) };
  emit();
}

export function usePreviewJob(bookId: string | undefined): PreviewJob | undefined {
  return useSyncExternalStore(subscribe, () => (bookId ? jobs[bookId] : undefined));
}
export const dismissJob = (bookId: string) => { if (jobs[bookId] && !jobs[bookId]!.running) { jobs = { ...jobs, [bookId]: undefined }; emit(); } };

export interface StartInput {
  book: Book;
  chapters: Chapter[];
  labels: PrintLabels;
  combos: { combo: Combo; spec: FormatSpec; label: string }[];
  /** Number for the first new variant (shown as "No. n"). */
  firstN: number;
}

/**
 * Runs one "Make previews" job. Charge BEFORE calling this (the credits are spent when the work starts).
 * Each variant is stored as soon as it's laid out, so the shelf fills in while the rest are still working.
 */
export async function startPreviews(input: StartInput): Promise<PreviewJob | undefined> {
  const { book, labels } = input;
  if (jobs[book.id]?.running) return jobs[book.id];
  const id = `run-${Date.now().toString(36)}`;
  const chapters = [...input.chapters].sort((a, b) => a.order - b.order);
  const snap = snapChaptersOf(chapters);
  const text = textPrint(snap, book);
  const words = bookChapters(chapters).reduce((s, c) => s + c.wordCount, 0);
  jobs = {
    ...jobs,
    [book.id]: {
      id, bookId: book.id, startedAt: new Date().toISOString(), running: true,
      items: input.combos.map((c) => ({ key: c.combo.key, combo: c.combo, label: c.label, status: 'queued', fraction: 0 })),
    },
  };
  emit();
  const specs = new Map(input.combos.map((c) => [c.combo.key, c]));
  let n = input.firstN;
  const ac = new AbortController();
  const stores: Promise<unknown>[] = [];
  try {
    await runner.run({ book, chapters, labels, requests: input.combos.map((c) => ({ key: c.combo.key, spec: c.spec })) }, (p) => {
      patchJob(book.id, (j) => ({ ...j, items: j.items.map((it) => (it.key === p.key ? { ...it, ...p } : it)) }));
      if (p.status !== 'done') return;
      const c = specs.get(p.key);
      if (!c) return;
      const num = n++;
      stores.push(api.entities.create({
        bookId: book.id, kind: 'edition', name: c.label,
        fields: {
          n: String(num), size: c.combo.size, style: c.combo.style, batch: id,
          format: JSON.stringify(c.spec), cover: book.cover ? JSON.stringify(book.cover) : '',
          chapters: JSON.stringify(snap), words: String(words), pages: String(p.pages ?? 0), trim: c.spec.trim,
          print: text, spec: specPrint(c.spec), exports: '[]',
        },
      }).then((e) => patchJob(book.id, (j) => ({ ...j, items: j.items.map((it) => (it.key === p.key ? { ...it, variantId: e.id } : it)) }))).catch(()=>patchJob(book.id,j=>({...j,items:j.items.map(it=>it.key===p.key?{...it,status:'failed'}:it)}))));
    }, ac.signal);
    await Promise.all(stores);
  } finally {
    patchJob(book.id, (j) => ({ ...j, running: false }));
  }
  return jobs[book.id];
}

/* ------------------------------------------------------------------ */
/* Exports                                                              */
/* ------------------------------------------------------------------ */

export interface ExportContext { book: Book; labels: PrintLabels; pdfText: { instructions: string; printLabel: string } }

export interface ExportRunner {
  /** `win` was opened synchronously from the click (browsers block windows opened later). */
  pdf(v: Variant, ctx: ExportContext, win: Window): Promise<void>;
  epub(v: Variant, ctx: ExportContext): Promise<void>;
}

export class LocalExportRunner implements ExportRunner {
  async pdf(v: Variant, ctx: ExportContext, win: Window) {
    const book = snapshotBook(ctx.book, v);
    await writePrintBook(win, { book, chapters: snapshotChapters(v, book.id), spec: v.spec, labels: ctx.labels, ...ctx.pdfText });
  }
  async epub(v: Variant, ctx: ExportContext) {
    const book = snapshotBook(ctx.book, v);
    let coverImage: Blob | undefined;
    const cl = v.spec.layout?.cover;
    if (cl) {
      const c = coverInputOf(book, book.cover);
      coverImage = await coverPng(c, 1600, createElement(DesignedCover, { title: c.title, subtitle: c.subtitle, author: c.author, spec: c.spec, layout: cl, width: 1600, deva: c.deva })).catch(() => undefined);
    }
    await downloadEpub({ book, chapters: snapshotChapters(v, book.id), spec: v.spec, labels: ctx.labels, coverSpec: book.cover, coverImage });
  }
}

let exporter: ExportRunner = new LocalExportRunner();
export const setExportRunner = (r: ExportRunner) => { exporter = r; };

/** Makes the file and records it on the variant. Charge before calling. */
export async function runExport(kind: ExportRecord['kind'], v: Variant, ctx: ExportContext, win?: Window | null) {
  if (kind === 'pdf') {
    if (!win) throw new Error('no-window');
    await exporter.pdf(v, ctx, win);
  } else {
    await exporter.epub(v, ctx);
  }
  const e = (await api.entities.list(ctx.book.id, 'edition')).find((x) => x.id === v.id);
  if (!e) return;
  let list: ExportRecord[] = [];
  try { list = JSON.parse(e.fields.exports || '[]') as ExportRecord[]; } catch { /* start over */ }
  await api.entities.update(v.id, { fields: { ...e.fields, exports: JSON.stringify([{ kind, at: new Date().toISOString() }, ...list].slice(0, 30)) } });
}
