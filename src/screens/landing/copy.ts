/**
 * Shape of the landing page copy. Both locale files (src/i18n/locales/{en,hi}/landing.ts)
 * implement this, so the two languages can never drift apart structurally.
 */

/** A piece of transcript: plain text, a removed filler/space ({ d }) or added punctuation ({ i }). */
export type CleanSeg = string | { d: string } | { i: string };
/** A piece of a proofread passage: plain text, or one marked fix. */
export type ProofSeg = string | { from: string; to: string };
/** A piece of mixed text: plain, or marked (m) to show which words the choice affects. */
export type MarkSeg = string | { m: string };

export interface FindResult { ch: string; pg: string; tag: string; pre: string; hit: string; post: string }
export interface FindQuery { label: string; text: string; results: FindResult[] }
export interface MemoryEntry { name: string; note: string; appears: string[] }
export interface PlanCard { beat: string; ch: string; title: string; who: string; said: string }
export interface JourneyRow { n: string; title: string; body: string }

export interface LandingCopy {
  meta: { title: string; description: string };
  skip: string;
  nav: { label: string; how: string; writers: string; trust: string; pricing: string; start: string; startShort: string; openDesk: string; continue: string; home: string };
  hero: {
    eyebrow: string; h1a: string; h1b: string; sub: string; cta1: string; cta2: string; trust: string[];
  };
  demo: {
    label: string; srDesc: string; pause: string; play: string; stepsLabel: string; steps: string[];
    instruction: string;
    dock: { dictating: string; voiceEdit: string; finding: string; found: string; accepted: string; back: string; listening: string; findingText: string; shown: string; acceptedText: string; backText: string };
    actions: { label: string; accept: string; keep: string };
    toast: string;
    between: string;
    earlier: { head: string; page: string; p1: string; /** punct = tidy punctuation (marked); ins = exactly the author's spoken words. */
    target: { before: string; del: string; punct: string; ins: string; after: string }; p3: string };
    later: { head: string; page: string; p1: string; raw: string; book: string };
  };
  epigraph: { kick: string; quote: string; story: string; tie: string; cite: string };
  journey: {
    kick: string; title: string;
    rows: JourneyRow[];
    lap: { time: string; day: string; newLap: string; listening: string; savedLabel: string; placeholder: string; words: string; saved: string; hint: string; again: string; aria: string };
    margin: { chapter: string; text: string; from: string; lap: string; use: string; later: string; usedNote: string; laterNote: string; reset: string; waiting: string };
    plan: { label: string; cards: PlanCard[]; saidLabel: string; kept: string };
    speak: { label: string; raw: string; clean: string; rawText: string; cleanSegs: CleanSeg[]; rawNote: string; cleanNote: string };
    find: { label: string; queries: FindQuery[]; try: string; listening: string };
    memory: { label: string; tabs: { people: string; places: string; notes: string }; people: MemoryEntry[]; places: MemoryEntry[]; notes: MemoryEntry[]; noteLabel: string; appearsLabel: string; ch: string };
    proof: { label: string; before: string; after: string; segs: ProofSeg[]; beforeNote: string; count: string; hint: string; acceptAll: string; reset: string; fixAria: string };
    cover: { title: string; subtitle: string; author: string; directions: string[]; selected: string; aria: string; templates: string };
    ready: { kick: string; files: { name: string; meta: string }[]; turn: string; front: string; back: string; backBy: string; publish: string };
  };
  writers?: {
    kick: string; title: string; body: string; label: string;
    types: { key: string; label: string; line: string; shelves: string[] }[];
    shelvesLabel: string;
  };
  hindiFirst?: { kick: string; title: string; body: string; points: string[]; sampleHead: string; sample: string };
  hinglish?: { kick: string; title: string; body: string; saidLabel: string; said: string; bookLabel: string; label: string; keep: string; deva: string; keepSegs: MarkSeg[]; devaSegs: MarkSeg[]; keepNote: string; devaNote: string };
  trust: { kick: string; title: string; lead: string; promises: string[]; sign: string; place: string };
  pricing: { kick: string; title: string; lead: string; items: { k: string; v: string }[]; cta: string; seats: string };
  faq: { kick: string; title: string; items: { q: string; a: string }[] };
  final: { title: string; cta: string };
  footer: { rights: string; made: string; other: string; otherLang: string; otherHref: string };
}
