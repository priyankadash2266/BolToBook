/**
 * Picks cover imagery and colour by matching the author's own words (cover description, themes)
 * against a fixed list. Plain keyword matching: it shows which of their words matched, and never
 * writes anything.
 */
import type { CoverSpec } from '@/data/types';

type Motif = Exclude<CoverSpec['motif'], 'none'>;
type Mood = CoverSpec['mood'];

const MOTIF_WORDS: Record<Motif, string[]> = {
  rail: ['train', 'rail', 'railway', 'railways', 'station', 'platform', 'track', 'tracks', 'locomotive', 'journey', 'ट्रेन', 'रेल', 'रेलगाड़ी', 'स्टेशन', 'प्लेटफ़ॉर्म', 'पटरी', 'सफ़र', 'सफर'],
  letter: ['letter', 'letters', 'post', 'postcard', 'postman', 'mail', 'envelope', 'envelopes', 'चिट्ठी', 'चिट्ठियाँ', 'चिट्ठियां', 'ख़त', 'खत', 'पत्र', 'डाक', 'डाकिया', 'लिफ़ाफ़ा', 'लिफाफा'],
  hills: ['hill', 'hills', 'mountain', 'mountains', 'fog', 'mist', 'misty', 'valley', 'himalaya', 'himalayas', 'पहाड़', 'पहाड़ों', 'पहाड़ी', 'पर्वत', 'कोहरा', 'धुंध', 'घाटी', 'हिमालय'],
  sun: ['sun', 'sunlight', 'sunny', 'heat', 'summer', 'desert', 'noon', 'dawn', 'सूरज', 'सूर्य', 'धूप', 'गर्मी', 'गरमी', 'रेगिस्तान', 'दोपहर', 'सुबह'],
};

const MOOD_WORDS: Record<Mood, string[]> = {
  night: ['dark', 'darkness', 'night', 'nights', 'midnight', 'moon', 'shadow', 'shadows', 'रात', 'रातें', 'अँधेरा', 'अंधेरा', 'अँधेरे', 'अंधेरे', 'चाँद', 'चांद', 'साया'],
  monsoon: ['rain', 'rains', 'rainy', 'green', 'monsoon', 'river', 'sea', 'storm', 'बारिश', 'बरसात', 'मानसून', 'हरा', 'हरी', 'हरियाली', 'नदी', 'समंदर', 'समुद्र'],
  paper: ['old', 'paper', 'memory', 'memories', 'past', 'nostalgia', 'childhood', 'diary', 'पुराना', 'पुरानी', 'पुराने', 'काग़ज़', 'कागज', 'काग़ज', 'याद', 'यादें', 'स्मृति', 'बचपन', 'डायरी'],
  ember: ['red', 'fire', 'flame', 'flames', 'anger', 'angry', 'rage', 'blood', 'revolution', 'लाल', 'आग', 'ग़ुस्सा', 'गुस्सा', 'क्रोध', 'ख़ून', 'खून', 'क्रांति'],
};

const lookup = <K extends string>(table: Record<K, string[]>) => {
  const m = new Map<string, K>();
  for (const [k, ws] of Object.entries(table) as [K, string[]][]) for (const w of ws) m.set(w, k);
  return m;
};
const MOTIF_OF = lookup(MOTIF_WORDS);
const MOOD_OF = lookup(MOOD_WORDS);

export interface WordMatch { word: string; motif?: Motif; mood?: Mood }

export interface CoverPick {
  matches: WordMatch[];
  motif?: Motif;
  mood?: Mood;
}

/** Matches the author's words; the most frequent motif and mood win (ties: first written). */
export function pickFromWords(text: string): CoverPick {
  const toks = (text.toLowerCase().normalize('NFC').match(/[\p{L}\p{M}]+/gu) ?? []);
  const matches: WordMatch[] = [];
  const seen = new Set<string>();
  const motifN = new Map<Motif, number>(), moodN = new Map<Mood, number>();
  for (const w of toks) {
    const motif = MOTIF_OF.get(w);
    const mood = MOOD_OF.get(w);
    if (!motif && !mood) continue;
    if (motif) motifN.set(motif, (motifN.get(motif) ?? 0) + 1);
    if (mood) moodN.set(mood, (moodN.get(mood) ?? 0) + 1);
    if (!seen.has(w)) { seen.add(w); matches.push({ word: w, motif, mood }); }
  }
  const top = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { matches, motif: top(motifN), mood: top(moodN) };
}

/** Default mood for a motif when only the imagery matched, and vice versa. */
const MOOD_FOR: Record<Motif, Mood> = { rail: 'night', letter: 'paper', hills: 'monsoon', sun: 'ember' };
const MOTIF_FOR: Record<Mood, Motif> = { night: 'rail', paper: 'letter', monsoon: 'hills', ember: 'sun' };

/** The cover direction built from the matched words, or undefined if nothing matched. */
export function wordsSpec(p: CoverPick, seed = 1): CoverSpec | undefined {
  if (!p.motif && !p.mood) return undefined;
  const motif = p.motif ?? MOTIF_FOR[p.mood!];
  const mood = p.mood ?? MOOD_FOR[motif];
  return { direction: 'words', mood, motif, type: mood === 'paper' ? 'italic' : 'serif', layout: motif === 'sun' ? 'center' : motif === 'rail' ? 'bottom' : 'top', seed };
}
