import { db } from '../db';
import { realtime } from '../realtime';
import type { Api } from './types';
import type { CreditEntry, Book, Chapter, Entity, Feedback, Lap, Profile, Version } from '../types';
import { countWords } from '@/lib/text';

const now = () => new Date().toISOString();
export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

const DEFAULT_PROFILE: Profile = {
  id: 'me', name: '', country: 'IN', appLang: 'en', onboarded: false,
  recordingRetention: '30d', mixedSpeech: 'keep', createdAt: now(), updatedAt: now(),
};

function statusFor(content: string, goal?: string, notes?: string): Chapter['status'] {
  if (content.trim()) return 'drafting';
  if ((goal ?? '').trim() || (notes ?? '').trim()) return 'planned';
  return 'empty';
}

async function touchBook(bookId: string) {
  await db.books.update(bookId, { updatedAt: now() });
  realtime.publish({ topic: 'books', op: 'update', id: bookId, bookId });
}

/** Purges Lap audio older than the retention window. */
async function enforceRetention() {
  const p = await db.profile.get('me');
  if (!p || p.recordingRetention === 'forever') return;
  const cutoff = p.recordingRetention === 'none' ? Date.now() + 1 : Date.now() - 30 * 864e5;
  const old = await db.audio.filter((a) => new Date(a.createdAt).getTime() < cutoff).toArray();
  if (!old.length) return;
  await db.audio.bulkDelete(old.map((a) => a.id));
  const ids = new Set(old.map((a) => a.id));
  const laps = await db.laps.filter((l) => !!l.audioId && ids.has(l.audioId)).toArray();
  await Promise.all(laps.map((l) => db.laps.update(l.id, { audioId: undefined })));
}

/** Demo prices and opening balance. A real backend returns its own from GET /billing/prices. */
const DEMO_PRICES = { cover: 5, preview: 2, export: 3, currency: 'credits' as const };
const DEMO_GRANT = 100;
let granting: Promise<void> | null = null;
/** Adds the welcome grant once, even when several screens ask for the balance at the same moment. */
function ensureGrant(): Promise<void> {
  if (!granting) {
    granting = db.transaction('rw', db.credits, async () => {
      if ((await db.credits.count()) > 0) return;
      await db.credits.add({ id: uid(), kind: 'grant', amount: DEMO_GRANT, note: 'Welcome credits', createdAt: now() });
    }).finally(() => { granting = null; });
  }
  return granting;
}

export class LocalApi implements Api {
  profile: Api['profile'] = {
    get: async () => {
      const p = await db.profile.get('me');
      if (p) return p;
      await db.profile.put(DEFAULT_PROFILE);
      return DEFAULT_PROFILE;
    },
    update: async (patch) => {
      const cur = await this.profile.get();
      const next = { ...cur, ...patch, id: 'me' as const, updatedAt: now() };
      await db.profile.put(next);
      realtime.publish({ topic: 'profile', op: 'update', id: 'me' });
      if (patch.recordingRetention) await enforceRetention();
      return next;
    },
  };

  books: Api['books'] = {
    list: async () => (await db.books.toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    get: (id) => db.books.get(id),
    create: async (input) => {
      const p = await this.profile.get();
      const book: Book = {
        id: uid(), title: input.title.trim() || '', subtitle: input.subtitle, author: input.author ?? p.name ?? '',
        type: input.type, lang: input.lang, stage: input.stage, country: input.country,
        fields: input.fields ?? {}, createdAt: now(), updatedAt: now(),
      };
      await db.books.add(book);
      realtime.publish({ topic: 'books', op: 'create', id: book.id, bookId: book.id });
      return book;
    },
    update: async (id, patch) => {
      await db.books.update(id, { ...patch, updatedAt: now() });
      realtime.publish({ topic: 'books', op: 'update', id, bookId: id });
      return (await db.books.get(id))!;
    },
    remove: async (id) => {
      await db.transaction('rw', [db.books, db.chapters, db.laps, db.entities, db.versions, db.feedback], async () => {
        await db.books.delete(id);
        await db.chapters.where('bookId').equals(id).delete();
        await db.laps.where('bookId').equals(id).delete();
        await db.entities.where('bookId').equals(id).delete();
        await db.versions.where('bookId').equals(id).delete();
        await db.feedback.where('bookId').equals(id).delete();
      });
      await db.media.where('bookId').equals(id).delete();
      realtime.publish({ topic: 'books', op: 'delete', id, bookId: id });
    },
  };

  chapters: Api['chapters'] = {
    list: async (bookId) => (await db.chapters.where('bookId').equals(bookId).toArray()).filter((c) => c.role !== 'draft').sort((a, b) => a.order - b.order),
    get: (id) => db.chapters.get(id),
    create: async (bookId, input = {}) => {
      const existing = (await db.chapters.where('bookId').equals(bookId).toArray()).filter((c) => c.role !== 'draft');
      const order = input.order ?? (existing.reduce((m, c) => Math.max(m, c.order), 0) + 1);
      const content = input.content ?? '';
      const ch: Chapter = {
        id: uid(), bookId, order, title: input.title ?? '', content, goal: input.goal, notes: input.notes,
        status: statusFor(content, input.goal, input.notes), wordCount: countWords(content), createdAt: now(), updatedAt: now(),
      };
      await db.chapters.add(ch);
      realtime.publish({ topic: 'chapters', op: 'create', id: ch.id, bookId });
      await touchBook(bookId);
      return ch;
    },
    update: async (id, patch, version) => {
      const cur = await db.chapters.get(id);
      if (!cur) throw new Error('Chapter not found');
      const next: Chapter = { ...cur, ...patch, updatedAt: now() };
      if (patch.content !== undefined) next.wordCount = countWords(patch.content);
      if (patch.status === undefined && cur.status !== 'done') next.status = statusFor(next.content, next.goal, next.notes);
      await db.chapters.put(next);
      if (version && patch.content !== undefined && patch.content !== cur.content) {
        const v: Version = {
          id: uid(), bookId: cur.bookId, chapterId: id, chapterTitle: next.title, source: version.source,
          summary: version.summary, command: version.command, before: cur.content, after: next.content, createdAt: now(),
        };
        await db.versions.add(v);
        realtime.publish({ topic: 'versions', op: 'create', id: v.id, bookId: cur.bookId });
      }
      realtime.publish({ topic: 'chapters', op: 'update', id, bookId: cur.bookId });
      await touchBook(cur.bookId);
      return next;
    },
    remove: async (id) => {
      const cur = await db.chapters.get(id);
      if (!cur) return;
      await db.chapters.delete(id);
      const laps = await db.laps.where('chapterId').equals(id).toArray();
      await Promise.all(laps.map((l) => db.laps.update(l.id, { chapterId: undefined, status: 'inbox' })));
      realtime.publish({ topic: 'chapters', op: 'delete', id, bookId: cur.bookId });
      realtime.publish({ topic: 'laps', op: 'update', bookId: cur.bookId });
      await touchBook(cur.bookId);
    },
    reorder: async (bookId, orderedIds) => {
      await db.transaction('rw', db.chapters, async () => {
        await Promise.all(orderedIds.map((id, i) => db.chapters.update(id, { order: i + 1 })));
      });
      realtime.publish({ topic: 'chapters', op: 'update', bookId });
    },
    draft: async (bookId) => {
      const found = (await db.chapters.where('bookId').equals(bookId).toArray()).find((c) => c.role === 'draft');
      if (found) return found;
      const ch: Chapter = { id: uid(), bookId, order: 0, title: '', content: '', status: 'empty', wordCount: 0, role: 'draft', createdAt: now(), updatedAt: now() };
      await db.chapters.add(ch);
      realtime.publish({ topic: 'chapters', op: 'create', id: ch.id, bookId });
      return ch;
    },
  };

  laps: Api['laps'] = {
    list: async (filter = {}) => {
      let rows = await db.laps.toArray();
      if (filter.bookId) rows = rows.filter((l) => l.bookId === filter.bookId);
      if (filter.status) rows = rows.filter((l) => l.status === filter.status);
      if (filter.chapterId) rows = rows.filter((l) => l.chapterId === filter.chapterId);
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    create: async (input) => {
      const lap: Lap = {
        id: uid(), text: input.text.trim(), source: input.source, bookId: input.bookId, audioId: input.audioId,
        durationMs: input.durationMs, kind: input.kind, chapterId: input.chapterId,
        title: input.title?.trim() || undefined, tags: input.tags, twist: input.twist,
        status: input.chapterId ? 'placed' : 'inbox', createdAt: now(), updatedAt: now(),
      };
      await db.laps.add(lap);
      realtime.publish({ topic: 'laps', op: 'create', id: lap.id, bookId: lap.bookId });
      return lap;
    },
    update: async (id, patch) => {
      await db.laps.update(id, { ...patch, updatedAt: now() });
      const lap = (await db.laps.get(id))!;
      realtime.publish({ topic: 'laps', op: 'update', id, bookId: lap.bookId });
      return lap;
    },
    remove: async (id) => {
      const lap = await db.laps.get(id);
      if (lap?.audioId) await db.audio.delete(lap.audioId);
      await db.laps.delete(id);
      realtime.publish({ topic: 'laps', op: 'delete', id, bookId: lap?.bookId });
    },
  };

  entities: Api['entities'] = {
    list: async (bookId, kind) => {
      const rows = kind
        ? await db.entities.where('[bookId+kind]').equals([bookId, kind]).toArray()
        : await db.entities.where('bookId').equals(bookId).toArray();
      return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    create: async (input) => {
      const e: Entity = { id: uid(), bookId: input.bookId, kind: input.kind, name: input.name, fields: input.fields ?? {}, createdAt: now(), updatedAt: now() };
      await db.entities.add(e);
      realtime.publish({ topic: 'entities', op: 'create', id: e.id, bookId: e.bookId });
      return e;
    },
    update: async (id, patch) => {
      await db.entities.update(id, { ...patch, updatedAt: now() });
      const e = (await db.entities.get(id))!;
      realtime.publish({ topic: 'entities', op: 'update', id, bookId: e.bookId });
      return e;
    },
    remove: async (id) => {
      const e = await db.entities.get(id);
      await db.entities.delete(id);
      realtime.publish({ topic: 'entities', op: 'delete', id, bookId: e?.bookId });
    },
  };

  versions: Api['versions'] = {
    list: async (bookId, chapterId) => {
      const rows = chapterId
        ? await db.versions.where('chapterId').equals(chapterId).toArray()
        : await db.versions.where('bookId').equals(bookId).toArray();
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    restore: async (versionId, which) => {
      const v = await db.versions.get(versionId);
      if (!v) throw new Error('Version not found');
      const text = which === 'before' ? v.before : v.after;
      return this.chapters.update(v.chapterId, { content: text }, { source: 'restore', summary: v.summary });
    },
  };

  feedback: Api['feedback'] = {
    list: async (bookId) => (await db.feedback.where('bookId').equals(bookId).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    create: async (input) => {
      const f: Feedback = { id: uid(), ...input, resolved: false, createdAt: now(), updatedAt: now() };
      await db.feedback.add(f);
      realtime.publish({ topic: 'feedback', op: 'create', id: f.id, bookId: f.bookId });
      return f;
    },
    update: async (id, patch) => {
      await db.feedback.update(id, { ...patch, updatedAt: now() });
      const f = (await db.feedback.get(id))!;
      realtime.publish({ topic: 'feedback', op: 'update', id, bookId: f.bookId });
      return f;
    },
    remove: async (id) => {
      const f = await db.feedback.get(id);
      await db.feedback.delete(id);
      realtime.publish({ topic: 'feedback', op: 'delete', id, bookId: f?.bookId });
    },
  };

  audio: Api['audio'] = {
    put: async (blob, durationMs) => {
      const id = uid();
      await db.audio.add({ id, blob, mime: blob.type, durationMs, createdAt: now() });
      realtime.publish({ topic: 'audio', op: 'create', id });
      return id;
    },
    get: async (id) => (await db.audio.get(id))?.blob,
    remove: async (id) => {
      await db.audio.delete(id);
      const laps = await db.laps.filter((l) => l.audioId === id).toArray();
      await Promise.all(laps.map((l) => db.laps.update(l.id, { audioId: undefined })));
      realtime.publish({ topic: 'audio', op: 'delete', id });
    },
    stats: async () => {
      const all = await db.audio.toArray();
      return { count: all.length, bytes: all.reduce((s, a) => s + a.blob.size, 0), durationMs: all.reduce((s, a) => s + (a.durationMs ?? 0), 0) };
    },
    clearAll: async () => {
      await db.audio.clear();
      await db.laps.toCollection().modify({ audioId: undefined });
      realtime.publish({ topic: 'audio', op: 'reset' });
      realtime.publish({ topic: 'laps', op: 'reset' });
    },
  };

  media: Api['media'] = {
    put: async (file, meta) => {
      const id = uid();
      await db.media.add({ id, bookId: meta.bookId, blob: file, mime: file.type, name: meta.name, createdAt: now() });
      realtime.publish({ topic: 'media', op: 'create', id, bookId: meta.bookId });
      return id;
    },
    get: (id) => db.media.get(id),
    list: async (bookId) => (await db.media.where('bookId').equals(bookId).toArray())
      .map(({ blob, ...rest }) => rest).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    remove: async (id) => {
      const m = await db.media.get(id);
      await db.media.delete(id);
      realtime.publish({ topic: 'media', op: 'delete', id, bookId: m?.bookId });
    },
  };

  billing: Api['billing'] = {
    prices: async () => ({ ...DEMO_PRICES }),
    balance: async () => {
      await ensureGrant();
      return (await db.credits.toArray()).reduce((n, e) => n + e.amount, 0);
    },
    ledger: async (limit = 100) => {
      await ensureGrant();
      return (await db.credits.orderBy('createdAt').reverse().limit(limit).toArray());
    },
    charge: async ({ kind, units = 1, bookId, note, ref }) => {
      await ensureGrant();
      const cost = DEMO_PRICES[kind] * Math.max(1, units);
      const bal = (await db.credits.toArray()).reduce((n, e) => n + e.amount, 0);
      if (bal < cost) throw new Error('insufficient-credits');
      const e: CreditEntry = { id: uid(), kind, amount: -cost, bookId, note, ref, createdAt: now() };
      await db.credits.add(e);
      realtime.publish({ topic: 'credits', op: 'create', id: e.id, bookId });
      return e;
    },
    topUp: async (amount, note) => {
      const e: CreditEntry = { id: uid(), kind: 'topup', amount: Math.abs(amount), note, createdAt: now() };
      await db.credits.add(e);
      realtime.publish({ topic: 'credits', op: 'create', id: e.id });
      return e;
    },
  };

  data: Api['data'] = {
    exportAll: async () => ({
      format: 'dictationer-export', version: 1, exportedAt: now(),
      profile: await db.profile.get('me'),
      books: await db.books.toArray(), chapters: await db.chapters.toArray(), laps: await db.laps.toArray(),
      entities: await db.entities.toArray(), versions: await db.versions.toArray(), feedback: await db.feedback.toArray(),
    }),
    importAll: async (dump) => {
      const d = dump as Record<string, unknown[]> & { format?: string; profile?: Profile };
      if (d?.format !== 'dictationer-export') throw new Error('This file is not a BolToBook export.');
      await db.transaction('rw', [db.profile, db.books, db.chapters, db.laps, db.entities, db.versions, db.feedback], async () => {
        if (d.profile) await db.profile.put(d.profile);
        await db.books.bulkPut((d.books ?? []) as Book[]);
        await db.chapters.bulkPut((d.chapters ?? []) as Chapter[]);
        await db.laps.bulkPut((d.laps ?? []) as Lap[]);
        await db.entities.bulkPut((d.entities ?? []) as Entity[]);
        await db.versions.bulkPut((d.versions ?? []) as Version[]);
        await db.feedback.bulkPut((d.feedback ?? []) as Feedback[]);
      });
      (['profile', 'books', 'chapters', 'laps', 'entities', 'versions', 'feedback'] as const).forEach((topic) => realtime.publish({ topic, op: 'reset' }));
    },
    wipe: async () => {
      await Promise.all([db.credits.clear(), db.media.clear(), db.profile.clear(), db.books.clear(), db.chapters.clear(), db.laps.clear(), db.entities.clear(), db.versions.clear(), db.feedback.clear(), db.audio.clear()]);
      (['profile', 'books', 'chapters', 'laps', 'entities', 'versions', 'feedback', 'audio', 'credits'] as const).forEach((topic) => realtime.publish({ topic, op: 'reset' }));
    },
  };

  constructor() { enforceRetention().catch(() => {}); }
}
