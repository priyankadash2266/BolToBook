/**
 * Domain model. These shapes are the contract between the UI and any data source
 * (the in-browser LocalApi today, the HTTP backend later). Keep them serialisable.
 */
export type ID = string;
export type ISODate = string;

/** Interface (UI) languages. */
export type AppLang = 'en' | 'hi';
/** Book languages. 'mix' = Hindi and English in the same book (Hinglish). */
export type BookLang = 'en' | 'hi' | 'mr' | 'mix';
export type BookType = 'fiction' | 'nonfiction' | 'memoir' | 'stories' | 'poetry' | 'other';
export type Stage = 'idea' | 'planning' | 'writing' | 'revision' | 'editing' | 'proofreading' | 'design' | 'ready';
export type CountryCode = 'IN' | 'US' | 'GB' | 'CA' | 'AE' | 'SG' | 'AU' | 'OTHER';

export const STAGES: Stage[] = ['idea', 'planning', 'writing', 'revision', 'editing', 'proofreading', 'design', 'ready'];

export interface Profile {
  id: 'me';
  name: string;
  country: CountryCode;
  appLang: AppLang;
  onboarded: boolean;
  currentBookId?: ID;
  /** What happens to voice recordings of Laps. Text is always kept. */
  recordingRetention: 'none' | '30d' | 'forever';
  /** When the author mixes languages while speaking. */
  mixedSpeech: 'keep' | 'convert';
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CoverSpec {
  direction: string;
  mood: 'night' | 'monsoon' | 'paper' | 'ember';
  type: 'serif' | 'italic' | 'sans' | 'hand';
  motif: 'rail' | 'letter' | 'hills' | 'sun' | 'none';
  layout: 'top' | 'center' | 'bottom';
  seed: number;
}

/**
 * A design change to one block on the printed page. Layout only: never the words.
 * Distances are in body lines (one line = the book's line height).
 */
export interface BlockStyle {
  align?: 'left' | 'center' | 'right' | 'justify';
  /** Nudge up (negative) or down (positive), in lines. */
  shift?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  /** Start this block on a new page. */
  breakBefore?: boolean;
  /** Chapter headings: false lets a chapter open on the next page of either side (default: right-hand page). */
  recto?: boolean;
  /** Insert a blank page after this block's page. */
  blankAfter?: boolean;
  /** Text size multiplier (1 = as designed). */
  scale?: number;
  /** First-line indent on (true) or off (false). */
  indent?: boolean;
  italic?: boolean;
}

export interface CoverLayout {
  position?: 'top' | 'center' | 'bottom';
  align?: 'left' | 'center' | 'right';
  /** Title size multiplier. */
  scale?: number;
}

/**
 * The author's own design changes on top of the format. Block keys are stable:
 * `title:main` `title:sub` `title:author` `half:title` `copyright` `dedication` `toc` `about:head`
 * `run:head` `run:folio` `back:blurb` `all:chtitle` `ch:<chapterId>:title` `ch:<chapterId>:p:<index>` `ch:<chapterId>:end`.
 */
export interface LayoutOverrides {
  blocks?: Record<string, BlockStyle>;
  cover?: CoverLayout;
}

export interface FormatSpec {
  /** Design changes made on the page (by hand or by voice). */
  layout?: LayoutOverrides;
  /** A half-title page before the title page (default on). */
  halfTitle?: boolean;
  trim: '5x8' | '5.5x8.5' | '6x9' | 'a5';
  face: 'literata' | 'garamond' | 'fraunces' | 'tiro';
  size: 's' | 'm' | 'l';
  margins: 'tight' | 'standard' | 'generous';
  opening: 'drop' | 'sunk' | 'ornament';
  headers: boolean;
  pageNumbers: 'outer' | 'center';
  paragraphs: 'indent' | 'block';
  dedication?: string;
  includeContents: boolean;
  aboutAuthor?: string;
  /** A separate face for headings and titles (body stays in `face`). */
  headFace?: 'literata' | 'garamond' | 'fraunces' | 'tiro';
  /** Body size in points, overriding `size` (e.g. large print). */
  pt?: number;
  /** A reflowable eBook laid out on a reading screen instead of a printed trim. */
  ebook?: boolean;
}

export interface StyleChoice { preferred: string; variants: string[] }

export interface Book {
  id: ID;
  title: string;
  subtitle?: string;
  author: string;
  type: BookType;
  lang: BookLang;
  stage: Stage;
  country: CountryCode;
  /** Free-form blueprint fields that differ by book type (premise, promise, reader, arc…). */
  fields: Record<string, string>;
  cover?: CoverSpec;
  format?: FormatSpec;
  styleSheet?: StyleChoice[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ChapterStatus = 'empty' | 'planned' | 'drafting' | 'done';

export interface Chapter {
  id: ID;
  bookId: ID;
  order: number;
  title: string;
  /** Manuscript text. Paragraphs are separated by a blank line ("\n\n"). */
  content: string;
  /** What this chapter must do, in the author's words. */
  goal?: string;
  /** Planning notes (scenes, beats) in the author's words. */
  notes?: string;
  status: ChapterStatus;
  wordCount: number;
  /** 'draft' marks the book's free-writing manuscript: text not yet placed into chapters. It never appears in chapters.list. */
  role?: 'draft';
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type LapStatus = 'inbox' | 'placed' | 'later' | 'discarded';

export type LapTagType = 'character' | 'location' | 'event' | 'chapter' | 'theme' | 'other';
export interface LapTag { type: LapTagType; name: string }

export interface Lap {
  id: ID;
  bookId?: ID;
  /** Short title (optional; the text is the Lap itself). */
  title?: string;
  /** The Lap: the author's words (the description). */
  text: string;
  tags?: LapTag[];
  /** Marked as a plot point or twist. */
  twist?: boolean;
  /** Where it was used, in the author's words ("Chapter 7, the wedding"). Set when status = 'placed'. */
  usedWhere?: string;
  source: 'voice' | 'typed';
  audioId?: ID;
  durationMs?: number;
  status: LapStatus;
  /** Where the author placed it. */
  chapterId?: ID;
  entityIds?: ID[];
  /** The author's own label: plot, character, detail, line… */
  kind?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/**
 * Everything the author keeps about their book is an Entity with a kind and free-form fields.
 * Common field conventions: fields.chapterId (linked chapter), fields.order (sort), fields.status.
 */
export type EntityKind =
  // fiction / shared
  | 'character' | 'place' | 'object' | 'event' | 'theme' | 'term'
  | 'relationship' | 'arc' | 'beat' | 'scene' | 'setup' | 'rule'
  // nonfiction
  | 'source' | 'claim' | 'quote' | 'fact' | 'note' | 'comp' | 'section' | 'argument' | 'question'
  // memoir
  | 'person' | 'memory' | 'lifeevent' | 'photo' | 'sensitive'
  // simple workspace
  | 'summary' | 'review' | 'edition'
  // cover design: one entry per paid design run (context, specs, generated images)
  | 'coverRun';

export interface Entity {
  id: ID;
  bookId: ID;
  kind: EntityKind;
  name: string;
  fields: Record<string, string>;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type VersionSource = 'typing' | 'dictation' | 'voice-edit' | 'proofread' | 'restore' | 'import' | 'create';

export interface Version {
  id: ID;
  bookId: ID;
  chapterId: ID;
  chapterTitle: string;
  source: VersionSource;
  summary: string;
  /** The author's spoken or typed instruction, for voice edits. */
  command?: string;
  before: string;
  after: string;
  createdAt: ISODate;
}

export interface Feedback {
  id: ID;
  bookId: ID;
  chapterId?: ID;
  reader: string;
  text: string;
  quote?: string;
  group?: string;
  resolved: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface MediaItem { id: ID; bookId?: ID; blob: Blob; mime: string; name: string; createdAt: ISODate }

export interface AudioClip { id: ID; blob: Blob; mime: string; durationMs?: number; createdAt: ISODate }

/** Inputs */
export type NewBook = Pick<Book, 'title' | 'type' | 'lang' | 'stage' | 'country'> & Partial<Pick<Book, 'subtitle' | 'author' | 'fields'>>;
export type NewLap = Pick<Lap, 'text' | 'source'> & Partial<Pick<Lap, 'bookId' | 'audioId' | 'durationMs' | 'kind' | 'chapterId' | 'title' | 'tags' | 'twist'>>;
export type NewEntity = Pick<Entity, 'bookId' | 'kind' | 'name'> & Partial<Pick<Entity, 'fields'>>;
export type NewFeedback = Pick<Feedback, 'bookId' | 'reader' | 'text'> & Partial<Pick<Feedback, 'chapterId' | 'quote' | 'group'>>;

export interface VersionOptions {
  source: VersionSource;
  summary: string;
  command?: string;
}

/* ---------------- Credits (paid generations) ---------------- */
/** What a credit was spent on. 'grant' and 'topup' add credits. */
export type CreditKind = 'cover' | 'preview' | 'export' | 'grant' | 'topup';
export interface CreditEntry {
  id: ID;
  kind: CreditKind;
  /** Negative when spent, positive when added. */
  amount: number;
  bookId?: ID;
  /** Shown in the ledger, e.g. "4 cover designs" or "PDF · 6 × 9 in". */
  note: string;
  /** Id of what was produced (cover run, edition, export) so the ledger can link to it. */
  ref?: string;
  createdAt: ISODate;
}
export interface Prices { cover: number; preview: number; export: number; currency: 'credits' }
