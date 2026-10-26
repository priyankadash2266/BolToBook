/**
 * Cover runs are stored as entities of kind 'coverRun' (one per paid design run):
 *   name            ISO time the run started
 *   fields.context  JSON CoverContext minus ids (what the author gave)
 *   fields.specs    JSON CoverSpec[] (one per design, in order)
 *   fields.mediaIds comma list of api.media ids, aligned with specs ('' where a design couldn't be drawn)
 *   fields.count    designs asked for
 *   fields.cost     credits charged ('0' when nothing was charged)
 *   fields.refunded credits returned (when a run failed after charging)
 *   fields.createdAt ISO time (same as name; kept for the label)
 *   fields.status   'running' | 'done' | 'partial' | 'failed'
 */
import { api } from '@/data/api';
import type { CoverSpec, Entity } from '@/data/types';
import { AUTO_PREFS, type CoverContext } from './coverJobs';

export type RunStatus = 'running' | 'done' | 'partial' | 'failed';
export type RunContext = Omit<CoverContext, 'bookId' | 'runId'>;

export interface CoverRun {
  id: string;
  createdAt: string;
  status: RunStatus;
  context: RunContext;
  specs: CoverSpec[];
  mediaIds: string[];
  count: number;
  cost: number;
  refunded: number;
}

const json = <T,>(s: string | undefined, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

export function readRun(e: Entity): CoverRun {
  const f = e.fields;
  const context = json<RunContext>(f.context, { title: '', author: '', brief: '', themes: [], coverBrief: '', prefs: AUTO_PREFS, count: 0, deva: false });
  context.prefs = { ...AUTO_PREFS, ...(context.prefs ?? {}) };
  return {
    id: e.id,
    createdAt: f.createdAt || e.name || e.createdAt,
    status: (f.status as RunStatus) || 'done',
    context,
    specs: json<CoverSpec[]>(f.specs, []),
    mediaIds: (f.mediaIds ?? '').split(','),
    count: Number(f.count) || 0,
    cost: Number(f.cost) || 0,
    refunded: Number(f.refunded) || 0,
  };
}

export function runFields(r: Partial<CoverRun>): Record<string, string> {
  const out: Record<string, string> = {};
  if (r.context) out.context = JSON.stringify(r.context);
  if (r.specs) out.specs = JSON.stringify(r.specs);
  if (r.mediaIds) out.mediaIds = r.mediaIds.join(',');
  if (r.count !== undefined) out.count = String(r.count);
  if (r.cost !== undefined) out.cost = String(r.cost);
  if (r.refunded !== undefined) out.refunded = String(r.refunded);
  if (r.createdAt) out.createdAt = r.createdAt;
  if (r.status) out.status = r.status;
  return out;
}

/** Merge a patch into a stored run (reads the fresh entity so concurrent writes aren't lost). */
export async function patchRun(bookId: string, id: string, patch: Partial<CoverRun>) {
  const cur = (await api.entities.list(bookId, 'coverRun')).find((e) => e.id === id);
  await api.entities.update(id, { fields: { ...(cur?.fields ?? {}), ...runFields(patch) } });
}

/** Deletes a run and the images it kept. */
export async function deleteRun(bookId: string, id: string) {
  const cur = (await api.entities.list(bookId, 'coverRun')).find((e) => e.id === id);
  const ids = (cur?.fields.mediaIds ?? '').split(',').filter(Boolean);
  await Promise.all(ids.map((m) => api.media.remove(m).catch(() => {})));
  await api.entities.remove(id);
}
