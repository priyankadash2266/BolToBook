import { diffWordsWithSpace } from 'diff';

export interface DiffPart { text: string; type: 'same' | 'add' | 'del' }

/** Word-level diff for showing exactly what changed. */
export function wordDiff(before: string, after: string): DiffPart[] {
  return diffWordsWithSpace(before, after).map((p) => ({ text: p.value, type: p.added ? 'add' : p.removed ? 'del' : 'same' }));
}

export function diffStats(before: string, after: string) {
  let added = 0, removed = 0;
  for (const p of wordDiff(before, after)) {
    const w = (p.text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
    if (p.type === 'add') added += w;
    if (p.type === 'del') removed += w;
  }
  return { added, removed };
}
