/**
 * Laps by voice: a small, local parser that turns what the author said into one command.
 * Nothing leaves the browser and nothing is written for the author: the parser only decides
 * which of the author's words are the title, the description and the tags, or which Lap they mean.
 *
 *   parseLapCommand('title The letter, description Meera finds it, tag character Meera, plot twist')
 *     → { kind: 'create', title: 'The letter', text: 'Meera finds it.', tags: [{ type: 'character', name: 'Meera' }], twist: true }
 *   parseLapCommand('Meera hides the letter')                         → { kind: 'create', text: 'Meera hides the letter.', tags: [], twist: false }
 *   parseLapCommand('tag location Delhi, tag chapter three. The train is late')
 *     → create, tags [location Delhi, chapter 3], text 'The train is late.'
 *   parseLapCommand('add to the lap about the letter: she burns it')  → { kind: 'append', query: 'the letter', text: 'She burns it.' }
 *   parseLapCommand('append to wedding she cries')  (with laps)       → append, query chosen by best overlap ('wedding'), text 'She cries.'
 *   parseLapCommand('find laps about Meera')                          → { kind: 'find', query: 'Meera' }
 *   parseLapCommand('show me laps about the train')                   → { kind: 'find', query: 'the train' }
 *   parseLapCommand('mark the lap about the letter as used in chapter 7') → { kind: 'markUsed', query: 'the letter', where: 'Chapter 7' }
 *   parseLapCommand('mark wedding unused')                            → { kind: 'markUnused', query: 'wedding' }
 *   parseLapCommand('शीर्षक चिट्ठी, विवरण मीरा को चिट्ठी मिलती है, टैग किरदार मीरा, मोड़')
 *     → create, title 'चिट्ठी', text 'मीरा को चिट्ठी मिलती है।', tags [character मीरा], twist true
 *   parseLapCommand('चिट्ठी वाले लैप में जोड़ो: वह उसे जला देती है')   → append, query 'चिट्ठी', text 'वह उसे जला देती है।'
 *   parseLapCommand('मीरा के बारे में लैप्स ढूँढो')                    → { kind: 'find', query: 'मीरा' }
 *   parseLapCommand('चिट्ठी को अध्याय 7 में इस्तेमाल हुआ मार्क करो')    → { kind: 'markUsed', query: 'चिट्ठी', where: 'अध्याय 7' }
 *   parseLapCommand('चिट्ठी को बिना इस्तेमाल मार्क करो')               → { kind: 'markUnused', query: 'चिट्ठी' }
 *   chapterNumberIn('Chapter seven, the wedding') → 7
 *   matchLap('letter', laps) → { id: <lap whose title/text/tags share the most words>, alternatives: [...] }
 */
import type { Lap, LapTag, LapTagType } from '@/data/types';
import { cleanTranscript, isDevanagari } from './text';

export type LapCommand =
  | { kind: 'create'; title?: string; text: string; tags: LapTag[]; twist: boolean }
  | { kind: 'append'; query: string; text: string }
  | { kind: 'find'; query: string }
  | { kind: 'markUsed'; query: string; where: string }
  | { kind: 'markUnused'; query: string };

export type LapCreate = Extract<LapCommand, { kind: 'create' }>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const nfc = (s: string) => s.normalize('NFC');
/** Regex from source, normalised so Devanagari nukta letters match however the recogniser wrote them. */
const R = (src: string, flags = 'iu') => new RegExp(nfc(src), flags);
const L = '[\\p{L}\\p{M}\\p{N}]';
const NB = `(?<!${L})`; // not preceded by a letter
const NA = `(?!${L})`; // not followed by a letter

const EDGE_PUNCT = /^[\s,.;:!?।\-—–"“”']+|[\s,.;:!?।\-—–"“”']+$/gu;
const trimEdges = (s: string) => s.replace(EDGE_PUNCT, '').trim();
const stripJoiners = (s: string) => trimEdges(trimEdges(s).replace(R(`^(?:and|also|then|is|was|as|और|फिर|है)${NA}\\s*`), '').replace(R(`\\s*${NB}(?:and|also|then|और|फिर)$`), ''));

const NUM_EN: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const NUM_HI: Record<string, number> = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
  तेरह: 13, चौदह: 14, पंद्रह: 15, सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20, पहले: 1, पहला: 1, दूसरे: 2, दूसरा: 2, तीसरे: 3, तीसरा: 3,
};
const DEVA_DIGITS = '०१२३४५६७८९';

function wordToNumber(w: string): number | undefined {
  const s = nfc(w.toLowerCase());
  if (/^\d+$/.test(s)) return Number(s);
  if (/^[०-९]+$/.test(s)) return Number([...s].map((c) => DEVA_DIGITS.indexOf(c)).join(''));
  return NUM_EN[s] ?? NUM_HI[nfc(w)] ?? Object.entries(NUM_HI).find(([k]) => nfc(k) === s)?.[1];
}

/** "chapter seven" / "Chapter 7" / "अध्याय 7" → 7. */
export function chapterNumberIn(s: string): number | undefined {
  const m = nfc(s).match(R(`${NB}(?:chapter|ch\\.?|अध्याय|चैप्टर)\\s*(?:no\\.?|number|नंबर|संख्या)?\\s*(\\d+|[०-९]+|${L}+)(?:\\s+(${L}+))?`));
  if (!m) return undefined;
  const a = wordToNumber(m[1]);
  if (a === undefined) return undefined;
  if (a >= 20 && a % 10 === 0 && m[2]) { const b = wordToNumber(m[2]); if (b && b < 10) return a + b; }
  return a;
}

/** Spoken "chapter seven" → "Chapter 7" (numbers only; the author's other words stay as said). */
function tidyChapterWords(s: string): string {
  return s.replace(R(`${NB}(chapter|अध्याय|चैप्टर)\\s+(${L}+)(?:\\s+(${L}+))?`, 'giu'), (all, kw: string, a: string, b?: string) => {
    const na = wordToNumber(a);
    if (na === undefined) return all;
    const nb = b ? wordToNumber(b) : undefined;
    const joined = na >= 20 && na % 10 === 0 && nb !== undefined && nb < 10;
    const head = /^ch/i.test(kw) ? 'Chapter' : kw;
    return `${head} ${joined ? na + nb! : na}${b && !joined ? ' ' + b : ''}`;
  });
}

const capFirst = (s: string) => (/^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s);
/** Names said in lower case ("meera") get capitals; anything the author capitalised stays. */
const asName = (s: string) => (/^[a-z][a-z\s'-]*$/.test(s) ? s.replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase()) : s);

/* ------------------------------------------------------------------ */
/* Create: title / description / tags / twist                          */
/* ------------------------------------------------------------------ */

const TAG_TYPES: [LapTagType, string][] = [
  ['character', 'character|characters|person|people|कैरेक्टर|किरदार|पात्र|व्यक्ति'],
  ['location', 'location|place|setting|लोकेशन|जगह|स्थान|प्लेस'],
  ['event', 'event|incident|इवेंट|घटना'],
  ['chapter', 'chapter|अध्याय|चैप्टर'],
  ['theme', 'theme|थीम|विषय'],
  ['other', 'other|अन्य|दूसरा'],
];
export const LAP_TAG_TYPES: LapTagType[] = TAG_TYPES.map(([t]) => t);
const TYPE_RE = TAG_TYPES.map(([t, w]) => [t, R(`^(?:${w})$`)] as const);
const typeOf = (w: string): LapTagType | undefined => TYPE_RE.find(([, re]) => re.test(nfc(w)))?.[0];

type Field = 'title' | 'desc' | 'tag' | 'twist';
const KW: [Field, string][] = [
  ['twist', '(?:mark(?:ed)?\\s+(?:it\\s+|this\\s+)?(?:as\\s+)?(?:a\\s+)?)?(?:plot\\s+twist|plot\\s+point|twist)|प्लॉट\\s+ट्विस्ट|कहानी\\s+में\\s+मोड़|ट्विस्ट|मोड़'],
  ['title', 'title|titled|heading|टाइटल|शीर्षक|हेडिंग|नाम'],
  ['desc', 'description|describe|details|detail|notes|note|डिस्क्रिप्शन|विवरण|ब्योरा|ब्यौरा|नोट'],
  ['tag', 'tagged|tags|tag|टैग'],
];
const KW_RE = R(`${NB}(?:${KW.map(([f, s]) => `(?<${f}>${s})`).join('|')})${NA}`, 'giu');
const BOUNDARY_BEFORE = R(`(?:^|[,.;:!?।\\n—–-]|${NB}(?:and|then|also|और|फिर))\\s*$`);
const ARTICLE_BEFORE = R(`${NB}(?:the|a|an|its|his|her|their|my|your|our|this|that|of|का|की|के)\\s+$`);
const BOUNDARY_AFTER = /^\s*(?:$|[,.;:!?।\n—–-])/u;
const TWO_WORD_TWIST = R('\\s');
const CREATE_PREFIX = R(`^(?:(?:ok(?:ay)?|please)\\s+)?(?:(?:add|new|create|save|make)\\s+(?:a\\s+)?(?:new\\s+)?lap(?:\\s+with)?|नया\\s+लैप|नई\\s+लैप)${NA}[\\s,:]*`);

interface Marker { field: Field; start: number; end: number }

/** Parses a Lap the author said or typed: "title …, description …, tag character Meera, plot twist" in any order. */
export function parseLapCreate(input: string): LapCreate {
  let s = nfc(input).replace(/\s+/g, ' ').trim();
  s = s.replace(CREATE_PREFIX, '');
  const markers: Marker[] = [];
  const startsWithKw = (() => { KW_RE.lastIndex = 0; const m = KW_RE.exec(s); return !!m && m.index === 0; })();
  const seen = new Set<Field>();
  KW_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KW_RE.exec(s))) {
    const g = m.groups ?? {};
    const field = (Object.keys(g) as Field[]).find((k) => g[k] !== undefined);
    if (!field) continue;
    const before = s.slice(0, m.index);
    const after = s.slice(m.index + m[0].length);
    const atBoundary = BOUNDARY_BEFORE.test(before);
    // "the title of…", "a note", "her tag" are the author's prose, not keywords.
    if (ARTICLE_BEFORE.test(before)) continue;
    let ok = false;
    if (field === 'title' || field === 'desc') {
      // "नाम" is only a title keyword at a clear boundary.
      const weak = /^नाम$/u.test(m[0]);
      ok = !seen.has(field) && (atBoundary || (startsWithKw && !weak));
    } else if (field === 'tag') {
      const next = after.trim().split(/[\s,]+/)[0] ?? '';
      const next2 = after.trim().split(/[\s,]+/).filter((w) => !/^(as|with|को|है)$/iu.test(w))[0] ?? '';
      ok = !!typeOf(next) || !!typeOf(next2) || atBoundary || startsWithKw;
    } else {
      const twoWord = TWO_WORD_TWIST.test(m[0].trim());
      ok = (atBoundary || twoWord) && (BOUNDARY_AFTER.test(after) || twoWord || startsWithKw);
    }
    if (!ok) continue;
    seen.add(field);
    markers.push({ field, start: m.index, end: m.index + m[0].length });
  }

  let title: string | undefined;
  const desc: string[] = [];
  const tags: LapTag[] = [];
  let twist = false;
  const pre = stripJoiners(s.slice(0, markers[0]?.start ?? s.length));
  if (pre) desc.push(pre);
  markers.forEach((mk, i) => {
    const raw = s.slice(mk.end, markers[i + 1]?.start ?? s.length);
    let val = stripJoiners(raw.replace(/^\s*(?:is|:|=|-|है)\s+/iu, ' '));
    if (mk.field === 'title' || mk.field === 'tag') {
      // A title or tag ends at the first comma or full stop; anything after it is the description.
      const cut = val.search(/[,.;!?।\n]/u);
      if (cut >= 0) { const tail = stripJoiners(val.slice(cut)); if (tail) desc.push(tail); val = stripJoiners(val.slice(0, cut)); }
    }
    if (mk.field === 'title') { if (val) title = capFirst(tidyChapterWords(val)); }
    else if (mk.field === 'desc') { if (val) desc.push(val); }
    else if (mk.field === 'twist') { twist = true; if (val) desc.push(val); }
    else { const r = parseTagValue(val); tags.push(...r.tags); if (r.rest) desc.push(r.rest); }
  });

  let text = desc.join('\n').trim();
  if (text) text = text.split('\n').map((p) => cleanTranscript(p, isDevanagari(p) ? 'hi' : 'en', { capitalizeStart: true }).text).join('\n');
  return { kind: 'create', title, text, tags: dedupeTags(tags), twist };
}

function parseTagValue(val: string): { tags: LapTag[]; rest: string } {
  if (!val) return { tags: [], rest: '' };
  let words = val.split(/\s+/).filter((w) => !/^(as|with|को)$/iu.test(w));
  let type: LapTagType | undefined = typeOf(trimEdges(words[0] ?? ''));
  if (type) words = words.slice(1);
  else if (words.length > 1 && typeOf(trimEdges(words[words.length - 1]))) { type = typeOf(trimEdges(words[words.length - 1])); words = words.slice(0, -1); }
  if (type === 'chapter') {
    // "tag chapter three the train is late" → chapter 3, and the rest is the description.
    const a = wordToNumber(words[0] ?? '');
    if (a !== undefined) {
      const b = words[1] !== undefined ? wordToNumber(words[1]) : undefined;
      const joined = a >= 20 && a % 10 === 0 && b !== undefined && b < 10;
      return { tags: [{ type, name: String(joined ? a + b! : a) }], rest: stripJoiners(words.slice(joined ? 2 : 1).join(' ')) };
    }
  }
  const tags = words.join(' ').split(R(`\\s*(?:,|&|${NB}and${NA}|${NB}और${NA})\\s*`))
    .map(trimEdges).filter(Boolean)
    .map((name) => ({ type: type ?? 'other', name: asName(name) }));
  return { tags, rest: '' };
}

function dedupeTags(tags: LapTag[]): LapTag[] {
  const seen = new Set<string>();
  return tags.filter((t) => { const k = tagKey(t); if (seen.has(k)) return false; seen.add(k); return true; });
}
export const tagKey = (t: LapTag) => `${t.type}:${nfc(t.name).toLowerCase()}`;

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

const PLEASE = '(?:(?:ok(?:ay)?|please|now)\\s+)?';
const LAPWORD = '(?:laps?|ones?|notes?|ideas?|thoughts?)';
const ABOUT = '(?:about|on|with|called|titled|named|for|mentioning|that\\s+mentions?|related\\s+to|tagged(?:\\s+with)?)';

const EN_FIND = R(`^${PLEASE}(?:find|show(?:\\s+me)?|search(?:\\s+for)?|look\\s+for|list|open|filter)\\s+(?:all\\s+|my\\s+|the\\s+)*${LAPWORD}\\s+(?:${ABOUT}\\s+)?(.+)$`);
const EN_FIND2 = R(`^${PLEASE}(?:all\\s+)?laps\\s+${ABOUT}\\s+(.+)$`);
const EN_APPEND = R(`^${PLEASE}(append|add|put)\\s+(?:this\\s+|that\\s+|it\\s+|more\\s+)?(?:to|onto|into|in)\\s+(.+)$`);
const EN_UNUSED = R(`^${PLEASE}(?:mark|set|make)\\s+(.+?)\\s+(?:as\\s+)?(?:unused|not\\s+(?:yet\\s+)?used)$`);
const EN_UNUSED2 = R(`^${PLEASE}(?:unmark|unuse)\\s+(.+)$`);
const EN_USED = R(`^${PLEASE}(?:mark|set)\\s+(.+?)\\s+(?:as\\s+)?used(?:\\s+(?:in|at|for|on|as)\\s+(.+))?$`);

const HI_VERB_FIND = '(?:ढूँढो|ढूंढो|ढूँढें|ढूंढें|ढूँढिए|ढूंढिए|ढूँढ़ो|ढूंढ़ो|दिखाओ|दिखाएँ|दिखाएं|दिखाइए|दिखा\\s+दो|खोजो|खोजें|खोजिए)';
const HI_LAPWORD = '(?:लैप्स|लैप|ख़याल|ख्याल|नोट्स|नोट)';
const HI_ABOUT = '(?:के\\s+बारे\\s+में|वाले|वाला|वाली|से\\s+जुड़े|पर)';
const HI_FIND = R(`^(.+?)\\s+${HI_ABOUT}\\s+(?:सारे\\s+|सभी\\s+)?${HI_LAPWORD}\\s*${HI_VERB_FIND}$`);
const HI_FIND2 = R(`^${HI_LAPWORD}\\s*${HI_VERB_FIND}\\s+(.+)$`);
const HI_ADD = '(?:जोड़ो|जोड़ें|जोड़िए|जोड़\\s+दो|जोड़\\s+दें|जोड़\\s+दीजिए|लिखो|लिख\\s+दो)';
const HI_APPEND = R(`^(.+?)\\s+(?:वाले|वाला|वाली|के\\s+बारे\\s+में(?:\\s+वाले)?)\\s+${HI_LAPWORD}\\s+में\\s+(?:(.+?)\\s+)?${HI_ADD}(?:\\s*[:,।-]?\\s*(.+))?$`);
const HI_DO = '(?:मार्क\\s+)?(?:करो|करें|कीजिए|कर\\s+दो|कर\\s+दें|कर\\s+दीजिए)';
const HI_UNUSED = R(`^(.+?)\\s+को\\s+(?:बिना\\s+इस्तेमाल|अप्रयुक्त|इस्तेमाल\\s+नहीं\\s+हुआ|अनयूज़्ड|अनयूज्ड)\\s*${HI_DO}$`);
const HI_USED = R(`^(.+?)\\s+को\\s+(?:(.+?)\\s+में\\s+)?(?:इस्तेमाल|उपयोग|प्रयोग|यूज़्ड|यूज्ड)\\s*(?:हुआ|किया|हो\\s+गया|किया\\s+गया)?\\s*${HI_DO}$`);

/** Removes "the lap about", "वाले लैप" etc. around a spoken reference to a Lap. */
function cleanQuery(q: string): string {
  return trimEdges(nfc(q)
    .replace(R(`^(?:the\\s+|my\\s+|that\\s+)?(?:older\\s+|old\\s+|earlier\\s+|previous\\s+|last\\s+)?${LAPWORD}?\\s*${ABOUT}?\\s+`), '')
    .replace(R(`\\s+(?:${HI_ABOUT}\\s+)?${HI_LAPWORD}$`), '')
    .replace(R(`^(?:the|my)\\s+${LAPWORD}$`), ''));
}

const tidyText = (s: string) => { const v = trimEdges(s); return v ? cleanTranscript(v, isDevanagari(v) ? 'hi' : 'en', { capitalizeStart: true }).text : ''; };
const tidyWhere = (s: string) => capFirst(tidyChapterWords(trimEdges(s)));

/**
 * Turns one utterance into a Lap command. `laps` (optional) helps split "append to <which> <text>"
 * when the author didn't pause or say a colon.
 */
export function parseLapCommand(input: string, laps: Pick<Lap, 'id' | 'title' | 'text' | 'tags' | 'createdAt'>[] = []): LapCommand {
  const raw = nfc(input).replace(/\s+/g, ' ').trim();
  const s = raw.replace(/[\s.!?।]+$/u, '');
  if (!s) return { kind: 'create', text: '', tags: [], twist: false };
  let m: RegExpMatchArray | null;

  if ((m = s.match(EN_UNUSED) ?? s.match(EN_UNUSED2) ?? s.match(HI_UNUSED))) {
    const q = cleanQuery(m[1]);
    if (q) return { kind: 'markUnused', query: q };
  }
  if ((m = s.match(EN_USED))) {
    const q = cleanQuery(m[1]);
    if (q) return { kind: 'markUsed', query: q, where: tidyWhere(m[2] ?? '') };
  }
  if ((m = s.match(HI_USED))) {
    const q = cleanQuery(m[1]);
    if (q) return { kind: 'markUsed', query: q, where: tidyWhere(m[2] ?? '') };
  }
  if ((m = s.match(EN_FIND) ?? s.match(EN_FIND2) ?? s.match(HI_FIND) ?? s.match(HI_FIND2))) {
    const q = cleanQuery(m[1]);
    if (q) return { kind: 'find', query: q };
  }
  if ((m = s.match(HI_APPEND))) {
    const q = cleanQuery(m[1]);
    const text = tidyText(m[3] || m[2] || '');
    if (q && text) return { kind: 'append', query: q, text };
  }
  if ((m = s.match(EN_APPEND))) {
    const verb = m[1].toLowerCase();
    const rest = m[2];
    const namesLap = R(`^(?:the\\s+|my\\s+|that\\s+)?(?:older\\s+|old\\s+|earlier\\s+|previous\\s+|last\\s+)?${LAPWORD}${NA}`).test(rest);
    if (verb === 'append' || namesLap) {
      const split = splitQueryAndText(rest, laps);
      if (split) return { kind: 'append', query: split.query, text: tidyText(split.text) };
    }
  }
  return parseLapCreate(raw);
}

function splitQueryAndText(rest: string, laps: Pick<Lap, 'id' | 'title' | 'text' | 'tags' | 'createdAt'>[]): { query: string; text: string } | null {
  const sep = rest.match(/^(.+?)(?:\s*[:;—–]\s*|\s*,\s*|\s+-\s+|\s+(?:saying|that says|which says|the text|text|add)\s+)(.+)$/iu);
  if (sep) {
    const q = cleanQuery(sep[1]);
    if (q && sep[2].trim()) return { query: q, text: sep[2] };
  }
  const body = cleanQuery(rest);
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  let best = { k: Math.min(3, words.length - 1), score: 0 };
  for (let k = 1; k <= Math.min(6, words.length - 1); k++) {
    const top = rankLaps(words.slice(0, k).join(' '), laps)[0];
    const sc = top ? top.score * k / (k + 0.5) : 0; // prefer the shortest reference that still matches
    if (sc > best.score + 1e-6) best = { k, score: sc };
  }
  return { query: words.slice(0, best.k).join(' '), text: words.slice(best.k).join(' ') };
}

/* ------------------------------------------------------------------ */
/* Matching a spoken reference to a Lap                                */
/* ------------------------------------------------------------------ */

const STOP = new Set([
  'the', 'a', 'an', 'about', 'of', 'to', 'in', 'on', 'at', 'for', 'lap', 'laps', 'and', 'with', 'is', 'was', 'that', 'this', 'one', 'it', 'my', 'her', 'his', 'their',
  'का', 'की', 'के', 'में', 'से', 'है', 'और', 'वाले', 'वाला', 'वाली', 'लैप', 'लैप्स', 'को', 'पर', 'बारे', 'वह', 'यह', 'एक',
].map(nfc));

export function words(s: string): string[] {
  return (nfc(s).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu) ?? []).map((w) => w.replace(/['’]s$/, ''));
}

type Matchable = Pick<Lap, 'id' | 'title' | 'text' | 'tags' | 'createdAt'>;

/** Laps ranked by how many of the query's words appear in their title, text or tag names. */
export function rankLaps<T extends Matchable>(query: string, laps: T[]): { lap: T; score: number }[] {
  const q = words(query).filter((w) => !STOP.has(w));
  if (!q.length) return [];
  const out: { lap: T; score: number }[] = [];
  for (const lap of laps) {
    const strong = new Set([...words(lap.title ?? ''), ...(lap.tags ?? []).flatMap((t) => words(t.name))]);
    const weak = new Set(words(lap.text));
    let score = 0;
    for (const w of q) {
      if (strong.has(w)) score += 2;
      else if (weak.has(w)) score += 1;
      else if (w.length >= 4 && [...strong, ...weak].some((x) => x.length >= 4 && (x.startsWith(w) || w.startsWith(x)))) score += 0.6;
    }
    if (score > 0) out.push({ lap, score: score / q.length });
  }
  return out.sort((a, b) => b.score - a.score || b.lap.createdAt.localeCompare(a.lap.createdAt));
}

/** The Lap the author most likely meant, plus the next closest ones (for "Not this one"). */
export function matchLap(query: string, laps: Matchable[]): { id?: string; alternatives: string[] } {
  const r = rankLaps(query, laps);
  return { id: r[0]?.lap.id, alternatives: r.slice(1, 6).map((x) => x.lap.id) };
}
