import Dexie, { type Table } from 'dexie';
import type { CreditEntry, MediaItem, AudioClip, Book, Chapter, Entity, Feedback, Lap, Profile, Version } from './types';

/** IndexedDB schema used by LocalApi. Only LocalApi may import this file. */
export class BolToBookDB extends Dexie {
  profile!: Table<Profile, string>;
  books!: Table<Book, string>;
  chapters!: Table<Chapter, string>;
  laps!: Table<Lap, string>;
  entities!: Table<Entity, string>;
  versions!: Table<Version, string>;
  feedback!: Table<Feedback, string>;
  audio!: Table<AudioClip, string>;
  media!: Table<MediaItem, string>;
  credits!: Table<CreditEntry, string>;

  constructor() {
    super('dictationer');
    this.version(1).stores({
      profile: 'id',
      books: 'id, updatedAt',
      chapters: 'id, bookId, [bookId+order]',
      laps: 'id, bookId, status, chapterId, createdAt',
      entities: 'id, bookId, [bookId+kind]',
      versions: 'id, bookId, chapterId, createdAt',
      feedback: 'id, bookId, chapterId',
      audio: 'id, createdAt',
    });
    this.version(2).stores({ media: 'id, bookId, createdAt' });
    this.version(3).stores({ credits: 'id, bookId, createdAt' });
  }
}

export const db = new BolToBookDB();
