import type { CreditEntry, Prices,
  Book, Chapter, Entity, EntityKind, Feedback, ID, Lap, LapStatus, NewBook, NewEntity, NewFeedback, NewLap,
  Profile, Version, VersionOptions, MediaItem,
} from '../types';

/**
 * The single contract every data source implements.
 * UI code imports `api` from '@/data/api' and never talks to storage directly,
 * so switching from the in-browser LocalApi to the HTTP backend is a config change
 * (VITE_DATA_SOURCE=http) plus implementing HttpApi.
 */
export interface Api {
  profile: {
    get(): Promise<Profile>;
    update(patch: Partial<Profile>): Promise<Profile>;
  };
  books: {
    list(): Promise<Book[]>;
    get(id: ID): Promise<Book | undefined>;
    create(input: NewBook): Promise<Book>;
    update(id: ID, patch: Partial<Book>): Promise<Book>;
    remove(id: ID): Promise<void>;
  };
  chapters: {
    list(bookId: ID): Promise<Chapter[]>;
    get(id: ID): Promise<Chapter | undefined>;
    create(bookId: ID, input?: Partial<Pick<Chapter, 'title' | 'content' | 'goal' | 'notes' | 'order'>>): Promise<Chapter>;
    /** Pass `version` to record a recoverable version of this change (voice edits, dictation, accepted fixes). */
    update(id: ID, patch: Partial<Pick<Chapter, 'title' | 'content' | 'goal' | 'notes' | 'status'>>, version?: VersionOptions): Promise<Chapter>;
    remove(id: ID): Promise<void>;
    reorder(bookId: ID, orderedIds: ID[]): Promise<void>;
    /** The book's free-writing manuscript (write first, sort into chapters later). Created on first use; versioned like a chapter via chapters.update. */
    draft(bookId: ID): Promise<Chapter>;
  };
  laps: {
    list(filter?: { bookId?: ID; status?: LapStatus; chapterId?: ID }): Promise<Lap[]>;
    create(input: NewLap): Promise<Lap>;
    update(id: ID, patch: Partial<Lap>): Promise<Lap>;
    remove(id: ID): Promise<void>;
  };
  entities: {
    list(bookId: ID, kind?: EntityKind): Promise<Entity[]>;
    create(input: NewEntity): Promise<Entity>;
    update(id: ID, patch: Partial<Pick<Entity, 'name' | 'fields' | 'kind'>>): Promise<Entity>;
    remove(id: ID): Promise<void>;
  };
  versions: {
    list(bookId: ID, chapterId?: ID): Promise<Version[]>;
    /** Restores the chapter to `before` or `after` of a version. Never deletes history: creates a new version. */
    restore(versionId: ID, which: 'before' | 'after'): Promise<Chapter>;
  };
  feedback: {
    list(bookId: ID): Promise<Feedback[]>;
    create(input: NewFeedback): Promise<Feedback>;
    update(id: ID, patch: Partial<Feedback>): Promise<Feedback>;
    remove(id: ID): Promise<void>;
  };
  audio: {
    put(blob: Blob, durationMs?: number): Promise<ID>;
    get(id: ID): Promise<Blob | undefined>;
    remove(id: ID): Promise<void>;
    stats(): Promise<{ count: number; bytes: number; durationMs: number }>;
    clearAll(): Promise<void>;
  };
  /** Photos and documents the author attaches (memoir sources, research files). */
  media: {
    put(file: Blob, meta: { name: string; bookId?: ID }): Promise<ID>;
    get(id: ID): Promise<MediaItem | undefined>;
    list(bookId: ID): Promise<Omit<MediaItem, 'blob'>[]>;
    remove(id: ID): Promise<void>;
  };
  /**
   * Credits for paid work: cover generation, book previews and exports each cost credits.
   * The backend owns real prices and balances; LocalApi simulates them for the demo.
   */
  billing: {
    prices(): Promise<Prices>;
    balance(): Promise<number>;
    ledger(limit?: number): Promise<CreditEntry[]>;
    /** Spends `units × price(kind)`. Rejects with Error('insufficient-credits') when the balance is too low. */
    charge(input: { kind: 'cover' | 'preview' | 'export'; units?: number; bookId?: ID; note: string; ref?: string }): Promise<CreditEntry>;
    /** Demo only: adds credits (a real backend does this after payment). */
    topUp(amount: number, note: string): Promise<CreditEntry>;
  };
  data: {
    exportAll(): Promise<unknown>;
    importAll(dump: unknown): Promise<void>;
    wipe(): Promise<void>;
  };
}
