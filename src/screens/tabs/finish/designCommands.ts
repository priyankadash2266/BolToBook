/**
 * Design by voice: spoken layout commands, understood locally (no network), in English and Hindi.
 * Only the layout changes; the author's words are never touched.
 *
 * Examples that are understood (the block is the selected one when the command says "this"/"यह"):
 *   "move the title to the left"                 → Title page title → left
 *   "shift the author name down"                 → Author name → down one line
 *   "centre the chapter titles"                  → All chapter headings → centre
 *   "make chapter titles bigger"                 → All chapter headings → larger
 *   "add space before this paragraph"            → (selected paragraph) → more space before
 *   "less space after this"                      → (selected) → less space after
 *   "start chapter 3 on a new page"              → Chapter 3 heading → new page
 *   "chapter 2 can open on any page"             → Chapter 2 heading → either side
 *   "insert a blank page after the title page"   → Title page → blank page after
 *   "use a larger text size" / "smaller text"    → body text size up / down
 *   "margins generous" / "tight margins"         → margins
 *   "switch typeface to Literata" / "Garamond"   → typeface
 *   "drop cap" / "ornament" / "sunk title"       → chapter opening
 *   "put the title at the bottom of the cover"   → Cover title → bottom
 *   "make the cover title bigger"                → Cover title → larger
 *   "page numbers in the centre"                 → page numbers centred
 *   "hide running heads" / "remove contents"     → on/off
 *   "make this italic" / "no indent here"        → (selected) italic / indent off
 *   "reset this" / "undo" / "redo"
 * Hindi:
 *   "शीर्षक बाईं ओर करो"            → शीर्षक → बाएँ
 *   "लेखक का नाम नीचे करो"          → लेखक का नाम → नीचे
 *   "अध्याय के शीर्षक बीच में करो"   → सभी अध्याय-शीर्षक → बीच में
 *   "अध्यायों के शीर्षक बड़े करो"      → सभी अध्याय-शीर्षक → बड़ा
 *   "इस अनुच्छेद से पहले जगह दो"     → यह अनुच्छेद → पहले जगह
 *   "तीसरा अध्याय नए पन्ने से शुरू करो" → अध्याय 3 → नया पन्ना
 *   "अक्षर बड़े करो"                  → अक्षरों का आकार बड़ा
 *   "हाशिये खुले करो"                 → हाशिये खुले
 *   "टाइपफ़ेस लिटरेटा करो"            → Literata
 *   "कवर पर शीर्षक नीचे रखो"         → कवर का शीर्षक → नीचे
 *   "इसे तिरछा करो" / "रीसेट करो" / "वापस करो"
 */
import type { FormatSpec } from '@/data/types';
import type { BlockOp, CoverOp } from './layout';
import { controlsFor, kindOf, STEP } from './layout';

export type DesignAction =
  | { kind: 'block'; key: string; op: BlockOp }
  | { kind: 'cover'; op: CoverOp }
  | { kind: 'format'; patch: Partial<FormatSpec> }
  | { kind: 'sizeStep'; dir: 1 | -1 }
  | { kind: 'undo' }
  | { kind: 'redo' };

export interface Understood {
  actions: DesignAction[];
  /** Block key the change applies to (named in the chip), or a general target key (design.target.*). */
  key?: string;
  target?: string;
  /** design.effect.* */
  effect: string;
  effectVars?: Record<string, string | number>;
}

export interface ParseCtx {
  selected?: string | null;
  /** The front cover is the page in view. */
  onCover: boolean;
  /** Chapters in the book, numbered as printed. */
  chapters: { id: string; n: number }[];
}

export type ParseResult = { ok: true; u: Understood } | { ok: false; reason: 'unknown' | 'noSelection' | 'noChapter' };

const DEVA_DIGITS = '०१२३४५६७८९';

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[०-९]/g, (d) => String(DEVA_DIGITS.indexOf(d)))
    .replace(/[.,!?;:"“”‘’'()।]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const any = (s: string, words: string[]) => words.some((w) => s.includes(w));
const re = (s: string, r: RegExp) => r.test(s);

const EN_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, '1st': 1, '2nd': 2, '3rd': 3,
};
const HI_CARD: Record<string, number> = {
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5, 'छह': 6, 'छः': 6, 'छे': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20,
};
const HI_ORD: Record<string, number> = {
  'पहला': 1, 'पहले': 1, 'पहली': 1, 'दूसरा': 2, 'दूसरे': 2, 'दूसरी': 2, 'तीसरा': 3, 'तीसरे': 3, 'तीसरी': 3, 'चौथा': 4, 'चौथे': 4,
  'पाँचवाँ': 5, 'पांचवां': 5, 'पाँचवें': 5, 'पांचवें': 5, 'छठा': 6, 'छठे': 6, 'सातवाँ': 7, 'सातवां': 7, 'सातवें': 7, 'आठवाँ': 8, 'आठवां': 8, 'आठवें': 8,
  'नौवाँ': 9, 'नौवां': 9, 'नौवें': 9, 'दसवाँ': 10, 'दसवां': 10, 'दसवें': 10,
};
const CHAPTER_WORDS = ['chapter', 'chapters', 'अध्याय', 'अध्यायों', 'चैप्टर', 'चैप्टरों', 'चैप्टर्स'];

const toNum = (w?: string): number | undefined => {
  if (!w) return undefined;
  if (/^\d+$/.test(w)) return Number(w);
  return EN_NUM[w] ?? HI_CARD[w];
};

/** "chapter 3", "3rd chapter", "third chapter", "अध्याय 3", "अध्याय तीन", "तीसरा अध्याय". */
export function chapterNumber(s: string): number | undefined {
  const tok = s.split(' ');
  for (let i = 0; i < tok.length; i++) {
    if (!CHAPTER_WORDS.includes(tok[i])) continue;
    const after = toNum(tok[i + 1]) ?? (tok[i + 1] === 'number' || tok[i + 1] === 'no' || tok[i + 1] === 'नंबर' ? toNum(tok[i + 2]) : undefined);
    if (after != null) return after;
    const before = tok[i - 1];
    if (before) {
      const n = /^\d+$/.test(before) ? Number(before) : EN_NUM[before] ?? HI_ORD[before];
      if (n != null) return n;
    }
  }
  return undefined;
}

/* --------------------------- vocabulary --------------------------- */

const W = {
  undo: /\b(undo|take that back|go back)\b/, undoHi: ['अनडू', 'वापस करो', 'वापस लो', 'वापस कर दो', 'पिछला वापस'],
  redo: /\bredo\b/, redoHi: ['रीडू', 'फिर से करो', 'दोबारा करो'],
  reset: /\b(reset|as it was|back to (the )?(original|default)|original|default)\b/, resetHi: ['रीसेट', 'पहले जैसा', 'मूल रूप', 'जैसा था'],

  left: /\bleft\b/, leftHi: ['बाएँ', 'बाएं', 'बाईं', 'बाई ', 'बायें', 'बाँयें', 'बाँए', 'लेफ्ट', 'लेफ़्ट'],
  right: /\bright\b/, rightHi: ['दाएँ', 'दाएं', 'दाईं', 'दायें', 'दाहिने', 'राइट'],
  centre: /\b(cent(re|er)(d|ed)?|centred|centered|middle)\b/, centreHi: ['बीच', 'केंद्र', 'सेंटर', 'मध्य'],
  justify: /\bjustif(y|ied)\b|\bboth sides\b/, justifyHi: ['जस्टिफ़ाई', 'जस्टिफाई', 'दोनों ओर', 'दोनों तरफ़', 'दोनों तरफ'],

  top: /\b(top|upper)\b/, bottom: /\b(bottom|foot)\b/,
  up: /\b(up|higher|raise)\b/, upHi: ['ऊपर'],
  down: /\b(down|lower)\b/, downHi: ['नीचे'],

  bigger: /\b(bigger|larger|large|big|increase|grow|enlarge)\b/, biggerHi: ['बड़ा', 'बड़े', 'बड़ी', 'बढ़ा', 'बड़ा', 'बड़े', 'बड़ी'],
  smaller: /\b(smaller|small|decrease|reduce|shrink)\b/, smallerHi: ['छोटा', 'छोटे', 'छोटी', 'घटा'],
  much: /\b(much|a lot|lot|way)\b/, muchHi: ['बहुत', 'काफ़ी', 'काफी'],

  space: /\b(space|spacing|gap|room|breathing room|line)\b/, spaceHi: ['जगह', 'स्पेस', 'दूरी', 'फ़ासला', 'फासला', 'ख़ाली लाइन', 'खाली लाइन'],
  before: /\b(before|above)\b/, beforeHi: ['पहले', 'ऊपर'],
  after: /\b(after|below|beneath)\b/, afterHi: ['बाद', 'नीचे'],
  less: /\b(less|remove|reduce|decrease|no|delete|take away|tighter)\b/, lessHi: ['कम', 'हटा', 'हटाओ', 'मत', 'नहीं'],

  newPage: /\b(new page|page break|next page|fresh page|own page)\b/, newPageHi: ['नए पन्ने', 'नये पन्ने', 'नया पन्ना', 'नए पेज', 'नये पेज', 'नया पेज', 'अगले पन्ने', 'अलग पन्ने'],
  blank: /\b(blank|empty) page\b/, blankHi: ['ख़ाली पन्ना', 'खाली पन्ना', 'ख़ाली पेज', 'खाली पेज', 'कोरा पन्ना', 'ख़ाली पृष्ठ', 'खाली पृष्ठ'],
  recto: /\b(right[- ]hand page|odd page|recto)\b/, rectoHi: ['दाएँ पन्ने', 'दाएं पन्ने', 'दाहिने पन्ने'],
  anySide: /\b(any page|either side|either page|any side|left[- ]hand page too)\b/, anySideHi: ['किसी भी पन्ने', 'किसी भी तरफ़', 'किसी भी तरफ'],

  indentOff: /\b(no indent|without (an |the )?indent|remove (the )?indent|unindent|don'?t indent|flush)\b/, indentOffHi: ['इंडेंट हटा', 'इंडेंट नहीं', 'बिना इंडेंट', 'इंडेंट मत'],
  indent: /\bindent(ed|ation)?\b/, indentHi: ['इंडेंट'],
  italicOff: /\b(not italic|no italic|remove (the )?italic|upright|roman|straight)\b/, italicOffHi: ['इटैलिक हटा', 'तिरछा नहीं', 'तिरछे नहीं', 'सीधा', 'सीधे'],
  italic: /\bitalics?\b/, italicHi: ['इटैलिक', 'तिरछा', 'तिरछे', 'तिरछी'],

  // targets
  cover: /\b(front )?cover\b/, coverHi: ['कवर', 'आवरण', 'मुखपृष्ठ'],
  back: /\b(back cover|blurb|back of the book)\b/, backHi: ['पीछे का कवर', 'पिछला कवर', 'बैक कवर', 'ब्लर्ब'],
  allHeadings: /\b(chapter (titles|headings|names|heads|numbers)|all (the )?chapters|every chapter|each chapter)\b/, allHeadingsHi: ['अध्यायों', 'सभी अध्याय', 'हर अध्याय', 'सारे अध्याय', 'चैप्टरों', 'चैप्टर्स', 'अध्याय के शीर्षक', 'अध्याय शीर्षक', 'चैप्टर टाइटल'],
  subtitle: /\b(subtitle|sub title|sub-title|tagline)\b/, subtitleHi: ['उपशीर्षक', 'सबटाइटल', 'सब टाइटल'],
  author: /\b(author|my name|writer|byline)\b/, authorHi: ['लेखक', 'मेरा नाम', 'नाम'],
  half: /\bhalf[- ]?title\b/, halfHi: ['हाफ़ टाइटल', 'हाफ टाइटल', 'अर्ध शीर्षक'],
  titlePage: /\btitle page\b/, titlePageHi: ['शीर्षक पृष्ठ', 'शीर्षक पन्ना', 'टाइटल पेज'],
  title: /\b(title|book name|name of the book)\b/, titleHi: ['शीर्षक', 'टाइटल', 'किताब का नाम'],
  folio: /\b(page numbers?|folios?|numbers)\b/, folioHi: ['पृष्ठ संख्या', 'पेज नंबर', 'पन्ना संख्या', 'पन्नों के नंबर', 'पन्ने का नंबर', 'पन्नों की संख्या'],
  head: /\b(running heads?|running headers?|headers?|page heads?)\b/, headHi: ['हेडर', 'शीर्ष पंक्ति', 'ऊपर की पंक्ति'],
  copyright: /\bcopyright\b/, copyrightHi: ['कॉपीराइट', 'कापीराइट'],
  dedication: /\bdedication\b/, dedicationHi: ['समर्पण'],
  contents: /\b(contents|table of contents|toc)\b/, contentsHi: ['अनुक्रमणिका', 'विषय सूची', 'विषय-सूची', 'सूची'],
  para: /\b(paragraph|para|passage)\b/, paraHi: ['अनुच्छेद', 'पैराग्राफ़', 'पैराग्राफ', 'पैरा'],
  thisW: /\b(this|it|here|selected|that)\b/, thisHi: ['यह', 'इस ', 'इसे', 'इसको', 'इसका', 'इसकी', 'इसके', 'यहाँ', 'यहां', 'इस'],

  // format
  margins: /\bmargins?\b/, marginsHi: ['हाशि', 'मार्जिन'],
  generous: /\b(generous|wide|wider|large|larger|big|bigger|more|roomy)\b/, generousHi: ['खुले', 'खुला', 'चौड़े', 'चौड़ा', 'ज़्यादा', 'ज्यादा', 'बड़े', 'बड़ा'],
  tight: /\b(tight|tighter|narrow|narrower|small|smaller|less|thin)\b/, tightHi: ['कम', 'तंग', 'छोटे', 'पतले', 'संकरे'],
  standard: /\b(standard|normal|regular|medium|default)\b/, standardHi: ['सामान्य', 'नॉर्मल', 'नार्मल', 'साधारण'],
  text: /\b(text( size)?|font( size)?|type ?size|letters|print|body text|words|reading size)\b/, textHi: ['अक्षर', 'फ़ॉन्ट', 'फॉन्ट', 'टेक्स्ट', 'लिखावट', 'छपाई'],
  dropCap: /\bdrop ?cap\b/, dropCapHi: ['ड्रॉप कैप', 'ड्राप कैप', 'बड़ा पहला अक्षर'],
  sunk: /\bsunk(en)?\b/, sunkHi: ['नीचे से शीर्षक', 'संक'],
  ornament: /\b(ornament|ornamental|flourish|fleuron)\b/, ornamentHi: ['अलंकरण', 'सजावट', 'फूल'],
  hide: /\b(hide|remove|turn off|switch off|no|without|drop)\b/, hideHi: ['हटा', 'छिपा', 'बंद', 'नहीं चाहिए', 'मत'],
  show: /\b(show|add|turn on|switch on|include|put back|bring back)\b/, showHi: ['दिखा', 'लगा', 'जोड़', 'चालू', 'वापस लाओ', 'रखो'],
  outer: /\b(outside|outer|edges?|corners?)\b/, outerHi: ['बाहर', 'किनारे', 'कोने'],
};

const has = (s: string, en: RegExp, hi?: string[]) => re(s, en) || (hi ? any(s, hi) : false);

const FACE_WORDS: [FormatSpec['face'], RegExp, string[]][] = [
  ['literata', /\bliterata\b|\blitter ?ata\b/, ['लिटरेटा', 'लिटराटा', 'लिट्रेटा']],
  ['garamond', /\bgara?mond\b|\bgarramond\b/, ['गैरामोंड', 'गारामोंड', 'गैरामॉन्ड', 'गरामोंड']],
  ['fraunces', /\bfraunces\b|\bfrances\b|\bfrancis\b/, ['फ्रॉन्सेस', 'फ्राउंसेस', 'फ्रांसिस', 'फ्रॉन्सिस']],
  ['tiro', /\btiro\b|\bdevanagari\b|\bhindi (font|type|face)\b/, ['टीरो', 'टिरो', 'देवनागरी']],
];

const TRIM_WORDS: [FormatSpec['trim'], RegExp][] = [
  ['5.5x8.5', /\b5(\.5| and a half| point 5) ?(x|by|बाय) ?8(\.5| and a half| point 5)\b/],
  ['6x9', /\b6 ?(x|by|बाय) ?9\b/],
  ['5x8', /\b5 ?(x|by|बाय) ?8\b/],
  ['a5', /\ba ?5\b|ए ?5/],
];

/* ------------------------------ parse ------------------------------ */

export function parseDesign(raw: string, ctx: ParseCtx): ParseResult {
  const s = ' ' + normalise(raw) + ' ';
  const ok = (u: Understood): ParseResult => ({ ok: true, u });
  if (!s.trim()) return { ok: false, reason: 'unknown' };

  if (has(s, W.redo, W.redoHi)) return ok({ actions: [{ kind: 'redo' }], target: 'design', effect: 'redo' });
  if (has(s, W.undo, W.undoHi)) return ok({ actions: [{ kind: 'undo' }], target: 'design', effect: 'undo' });

  /* ---- format-wide ---- */
  for (const [face, en, hi] of FACE_WORDS) {
    if (has(s, en, hi)) return ok({ actions: [{ kind: 'format', patch: { face } }], target: 'face', effect: 'face', effectVars: { face } });
  }
  for (const [trim, r] of TRIM_WORDS) {
    if (re(s, r) && (re(s, /\b(trim|size|book|page|format|inch|inches)\b/) || any(s, ['आकार', 'साइज़', 'साइज', 'इंच']))) {
      return ok({ actions: [{ kind: 'format', patch: { trim } }], target: 'trim', effect: 'trim', effectVars: { trim } });
    }
  }
  if (has(s, W.margins, W.marginsHi)) {
    const m: FormatSpec['margins'] | undefined = has(s, W.standard, W.standardHi) ? 'standard' : has(s, W.generous, W.generousHi) ? 'generous' : has(s, W.tight, W.tightHi) ? 'tight' : undefined;
    if (m) return ok({ actions: [{ kind: 'format', patch: { margins: m } }], target: 'margins', effect: `margins.${m}` });
  }
  if (has(s, W.dropCap, W.dropCapHi)) return ok({ actions: [{ kind: 'format', patch: { opening: 'drop' } }], target: 'opening', effect: 'opening.drop' });
  if (has(s, W.ornament, W.ornamentHi)) return ok({ actions: [{ kind: 'format', patch: { opening: 'ornament' } }], target: 'opening', effect: 'opening.ornament' });
  if (has(s, W.sunk, W.sunkHi) && !has(s, W.cover, W.coverHi)) return ok({ actions: [{ kind: 'format', patch: { opening: 'sunk' } }], target: 'opening', effect: 'opening.sunk' });

  const hideIt = has(s, W.hide, W.hideHi);
  const showIt = has(s, W.show, W.showHi);
  if (has(s, W.head, W.headHi) && (hideIt || showIt) && !has(s, W.space, W.spaceHi)) {
    const on = !hideIt;
    return ok({ actions: [{ kind: 'format', patch: { headers: on } }], target: 'headers', effect: on ? 'on' : 'off' });
  }
  if (has(s, W.contents, W.contentsHi) && (hideIt || showIt) && !has(s, W.blank, W.blankHi)) {
    const on = !hideIt;
    return ok({ actions: [{ kind: 'format', patch: { includeContents: on } }], target: 'contents', effect: on ? 'on' : 'off' });
  }
  if (has(s, W.folio, W.folioHi) && !has(s, W.left, W.leftHi) && !has(s, W.right, W.rightHi)) {
    if (has(s, W.centre, W.centreHi)) return ok({ actions: [{ kind: 'format', patch: { pageNumbers: 'center' } }, { kind: 'block', key: 'run:folio', op: { set: { align: undefined } } }], key: 'run:folio', effect: 'center' });
    if (has(s, W.outer, W.outerHi)) return ok({ actions: [{ kind: 'format', patch: { pageNumbers: 'outer' } }, { kind: 'block', key: 'run:folio', op: { set: { align: undefined } } }], key: 'run:folio', effect: 'outer' });
  }

  /* ---- which block ---- */
  const said = { this: has(s, W.thisW, W.thisHi) };
  let key: string | undefined;
  let named = false;
  const chN = chapterNumber(s.trim());
  const chId = chN != null ? ctx.chapters.find((c) => c.n === chN)?.id : undefined;
  if (chN != null && !chId) return { ok: false, reason: 'noChapter' };

  if (has(s, W.back, W.backHi)) { key = 'back:blurb'; named = true; }
  else if (chId) { key = `ch:${chId}:title`; named = true; }
  else if (has(s, W.allHeadings, W.allHeadingsHi)) { key = 'all:chtitle'; named = true; }
  else if (has(s, W.subtitle, W.subtitleHi)) { key = 'title:sub'; named = true; }
  else if (has(s, W.half, W.halfHi)) { key = 'half:title'; named = true; }
  else if (has(s, W.titlePage, W.titlePageHi)) { key = 'title:main'; named = true; }
  else if (has(s, W.title, W.titleHi) && (has(s, W.cover, W.coverHi) || (ctx.onCover && !has(s, W.author, W.authorHi)))) { key = 'cover:title'; named = true; }
  else if (has(s, W.author, W.authorHi) && !(s.includes('नाम') && has(s, W.title, W.titleHi))) { key = 'title:author'; named = true; }
  else if (has(s, W.title, W.titleHi)) { key = 'title:main'; named = true; }
  else if (has(s, W.cover, W.coverHi)) { key = 'cover:title'; named = true; }
  else if (has(s, W.folio, W.folioHi)) { key = 'run:folio'; named = true; }
  else if (has(s, W.head, W.headHi)) { key = 'run:head'; named = true; }
  else if (has(s, W.copyright, W.copyrightHi)) { key = 'copyright'; named = true; }
  else if (has(s, W.dedication, W.dedicationHi)) { key = 'dedication'; named = true; }
  else if (has(s, W.contents, W.contentsHi)) { key = 'toc'; named = true; }

  const sel = ctx.selected ?? undefined;
  const wantsPara = has(s, W.para, W.paraHi);
  if (!named && (said.this || wantsPara)) {
    if (!sel) return { ok: false, reason: 'noSelection' };
    key = sel;
  }

  // "a blank page after chapter 3" = after the end of that chapter.
  const blankWords = has(s, W.blank, W.blankHi);
  if (blankWords && chId) key = `ch:${chId}:end`;

  /* ---- what to do ---- */
  const lessWords = has(s, W.less, W.lessHi);
  const much = has(s, W.much, W.muchHi) ? 2 : 1;
  const textWords = has(s, W.text, W.textHi);
  const bigger = has(s, W.bigger, W.biggerHi);
  const smaller = has(s, W.smaller, W.smallerHi);

  // Body text size: "use a larger text size", "smaller text", "अक्षर बड़े करो".
  if ((bigger || smaller) && textWords && !named && !said.this) {
    return ok({ actions: [{ kind: 'sizeStep', dir: bigger ? 1 : -1 }], target: 'size', effect: bigger ? 'sizeUp' : 'sizeDown' });
  }

  // Nothing named: fall back to the selected block.
  if (!key) key = sel;
  if (!key) {
    if (bigger || smaller) return ok({ actions: [{ kind: 'sizeStep', dir: bigger ? 1 : -1 }], target: 'size', effect: bigger ? 'sizeUp' : 'sizeDown' });
    return { ok: false, reason: anyEffect(s) ? 'noSelection' : 'unknown' };
  }

  const block = (op: BlockOp, effect: string, vars?: Record<string, string | number>): ParseResult =>
    ok({ actions: [{ kind: 'block', key: key!, op }], key, effect, effectVars: vars });
  const kind = kindOf(key);
  const can = controlsFor(key);

  if (has(s, W.reset, W.resetHi)) {
    return kind === 'cover' ? ok({ actions: [{ kind: 'cover', op: { reset: true } }], key, effect: 'reset' }) : block({ reset: true }, 'reset');
  }

  /* cover title */
  if (kind === 'cover') {
    if (has(s, W.bottom) || (any(s, W.downHi) && !has(s, W.up, W.upHi))) return ok({ actions: [{ kind: 'cover', op: { set: { position: 'bottom' } } }], key, effect: 'bottom' });
    if (has(s, W.top) || any(s, W.upHi)) return ok({ actions: [{ kind: 'cover', op: { set: { position: 'top' } } }], key, effect: 'top' });
    if ((re(s, /\bmiddle\b/) || s.includes('बीच')) && !re(s, /\b(align|centre|center|centred|centered)\b/) && !any(s, ['सेंटर', 'केंद्र'])) {
      return ok({ actions: [{ kind: 'cover', op: { set: { position: 'center' } } }], key, effect: 'middle' });
    }
    if (has(s, W.left, W.leftHi)) return ok({ actions: [{ kind: 'cover', op: { set: { align: 'left' } } }], key, effect: 'left' });
    if (has(s, W.right, W.rightHi)) return ok({ actions: [{ kind: 'cover', op: { set: { align: 'right' } } }], key, effect: 'right' });
    if (has(s, W.centre, W.centreHi)) return ok({ actions: [{ kind: 'cover', op: { set: { align: 'center' } } }], key, effect: 'center' });
    if (re(s, /\bup\b/)) return ok({ actions: [{ kind: 'cover', op: { set: { position: 'top' } } }], key, effect: 'top' });
    if (re(s, /\bdown\b/)) return ok({ actions: [{ kind: 'cover', op: { set: { position: 'bottom' } } }], key, effect: 'bottom' });
    if (bigger) return ok({ actions: [{ kind: 'cover', op: { addScale: 0.08 * much } }], key, effect: 'bigger' });
    if (smaller) return ok({ actions: [{ kind: 'cover', op: { addScale: -0.08 * much } }], key, effect: 'smaller' });
    return { ok: false, reason: 'unknown' };
  }

  if (can.recto && has(s, W.anySide, W.anySideHi)) return block({ set: { recto: false } }, 'anySide');
  if (can.recto && has(s, W.recto, W.rectoHi)) return block({ set: { recto: true } }, 'recto');

  if (blankWords) {
    const k2 = key === 'all:chtitle' || /^ch:.+:title$/.test(key) ? (chId ? `ch:${chId}:end` : undefined) : key;
    if (k2 && controlsFor(k2).blankAfter) {
      const on = !lessWords;
      return ok({ actions: [{ kind: 'block', key: k2, op: { set: { blankAfter: on } } }], key: k2, effect: on ? 'blankAfter' : 'noBlank' });
    }
    return { ok: false, reason: 'unknown' };
  }

  if (has(s, W.newPage, W.newPageHi)) {
    if (kind === 'heading') {
      // Chapters always open on a new page; "new page" makes sure this one does, on whichever side comes next if asked.
      return block({ set: { breakBefore: !lessWords || undefined } }, lessWords ? 'noNewPage' : 'newPage');
    }
    if (can.breakBefore) return block({ set: { breakBefore: !lessWords } }, lessWords ? 'noNewPage' : 'newPage');
  }

  if (has(s, W.space, W.spaceHi) && can.space) {
    const after = has(s, W.after, W.afterHi) && !(has(s, W.before) || s.includes('पहले'));
    const field = after ? 'spaceAfter' : 'spaceBefore';
    const removeAll = re(s, /\b(remove|no|delete)\b/) || any(s, ['हटा', 'मत']);
    if (removeAll && lessWords) return block({ set: { [field]: 0 } }, `${field}Off`);
    const d = (lessWords ? -1 : 1) * much;
    return block({ add: { [field]: d } }, `${field}${d > 0 ? 'More' : 'Less'}`);
  }

  if (can.indent) {
    if (has(s, W.indentOff, W.indentOffHi)) return block({ set: { indent: false } }, 'indentOff');
    if (has(s, W.indent, W.indentHi)) return block({ set: { indent: !lessWords } }, lessWords ? 'indentOff' : 'indentOn');
  }
  if (has(s, W.italicOff, W.italicOffHi)) return block({ set: { italic: false } }, 'italicOff');
  if (has(s, W.italic, W.italicHi)) return block({ set: { italic: !lessWords } }, lessWords ? 'italicOff' : 'italicOn');

  // Alignment. ("right-hand page" was handled above.)
  if (can.justify && has(s, W.justify, W.justifyHi)) return block({ set: { align: 'justify' } }, 'justify');
  if (has(s, W.left, W.leftHi)) return block({ set: { align: 'left' } }, 'left');
  if (has(s, W.right, W.rightHi)) return block({ set: { align: 'right' } }, 'right');
  if (has(s, W.centre, W.centreHi)) return block({ set: { align: 'center' } }, 'center');

  if (bigger) return block({ add: { scale: STEP.scale * much } }, 'bigger');
  if (smaller) return block({ add: { scale: -STEP.scale * much } }, 'smaller');

  const up = has(s, W.up, W.upHi) || has(s, W.top);
  const down = has(s, W.down, W.downHi) || has(s, W.bottom);
  if (up !== down) {
    const lines = (up ? -1 : 1) * much;
    if (kind === 'para') return block({ add: { spaceBefore: lines } }, up ? 'spaceBeforeLess' : 'spaceBeforeMore');
    return block({ add: { shift: lines } }, up ? 'up' : 'down');
  }

  return { ok: false, reason: 'unknown' };
}

function anyEffect(s: string) {
  return [W.left, W.right, W.centre, W.up, W.down, W.space, W.newPage, W.italic, W.indent].some((r) => re(s, r))
    || any(s, [...W.leftHi, ...W.rightHi, ...W.centreHi, ...W.upHi, ...W.downHi, ...W.spaceHi, ...W.italicHi]);
}
