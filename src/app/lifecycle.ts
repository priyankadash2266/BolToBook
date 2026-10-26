/**
 * The book workspace: one short, flat list of places, the same order an author works in.
 *   Gather: Laps · Brief · Characters · World · Plot/Timeline
 *   Write:  Manuscript (free writing) · Chapters (outline, chapter ideas, then write each)
 *   Finish: Review · Cover design · Preview & Generate
 * Labels live in the `lifecycle` i18n namespace: tabs.<tabId>.label / .purpose.
 * Adding a tab = add it to TABS + a page module in TAB_PAGES.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { BookType, Chapter, Entity, EntityKind, Feedback, Lap } from '@/data/types';
import type { IconName } from '@/components/Icon';

export type TabGroup = 'gather' | 'write' | 'finish';

export interface TabDef {
  id: string;
  group: TabGroup;
  icon: IconName;
  /** Entity kinds this tab keeps; used for the count shown in the sidebar. */
  kinds?: EntityKind[];
  count?: (c: CountCtx) => number;
  /** Shows the count as an attention badge (e.g. Laps not used yet). */
  badge?: boolean;
}

export interface CountCtx { entities: Entity[]; laps: Lap[]; chapters: Chapter[]; feedback: Feedback[] }

export const TABS: TabDef[] = [
  { id: 'laps', group: 'gather', icon: 'bookmark', count: (c) => c.laps.filter((l) => l.status === 'inbox' || l.status === 'later').length, badge: true },
  { id: 'brief', group: 'gather', icon: 'feather' },
  { id: 'characters', group: 'gather', icon: 'users', kinds: ['character'] },
  { id: 'world', group: 'gather', icon: 'globe', kinds: ['place'] },
  { id: 'timeline', group: 'gather', icon: 'clock', kinds: ['event'] },
  { id: 'manuscript', group: 'write', icon: 'pen' },
  { id: 'chapters', group: 'write', icon: 'list', count: (c) => c.chapters.length },
  { id: 'review', group: 'finish', icon: 'eye' },
  { id: 'cover', group: 'finish', icon: 'image' },
  { id: 'generate', group: 'finish', icon: 'download' },
];

export const GROUPS: TabGroup[] = ['gather', 'write', 'finish'];

/** Same simple workspace for every kind of book (nonfiction shows a work-in-progress note). */
export function tabsFor(_type: BookType): TabDef[] { return TABS; }

export function findTab(_type: BookType, tabId: string): TabDef | undefined {
  return TABS.find((t) => t.id === tabId);
}

export function tabCount(tab: TabDef, c: CountCtx): number | undefined {
  if (tab.count) return tab.count(c);
  if (tab.kinds) return c.entities.filter((e) => tab.kinds!.includes(e.kind)).length;
  return undefined;
}

type Page = LazyExoticComponent<ComponentType>;
const P = (f: () => Promise<{ default: ComponentType }>): Page => lazy(f);

/** Page module for each tab id (a chapter's writing desk has its own route: /write/:chapterId). */
export const TAB_PAGES: Record<string, Page> = {
  laps: P(() => import('@/screens/app/Laps')),
  brief: P(() => import('@/screens/tabs/brief')),
  characters: P(() => import('@/screens/tabs/characters')),
  world: P(() => import('@/screens/tabs/world')),
  timeline: P(() => import('@/screens/tabs/timeline')),
  manuscript: P(() => import('@/screens/tabs/manuscript')),
  chapters: P(() => import('@/screens/tabs/chapters')),
  review: P(() => import('@/screens/tabs/review')),
  cover: P(() => import('@/screens/app/Cover')),
  generate: P(() => import('@/screens/tabs/generate')),
};
