/**
 * Spoken edit commands inside dictation.
 *
 * While the author dictates, each finished utterance (the recogniser closes one after a pause) is
 * checked here. Only a clear command phrasing counts, and only when the words it points at are
 * really on the page; anything else is prose and is written down as said. When unsure: prose.
 *
 *   counts:   "Change the platform to Platform Four"   (if "the platform" is in the text)
 *             "Delete ‘which Cam took as permission’"  ·  "After ‘the clock stopped’ add it was raining"
 *             "Go to where Ram tells Cam the truth and add: he had known"
 *             "'जल्दी' को 'देर से' से बदलो"  ·  "'बहुत भीड़ थी' हटाओ"  ·  "जहाँ … वहाँ जोड़ो कि …"
 *   prose:    "When she arrived, add the salt" · "Remove your shoes, he said" (unless those exact words are already written)
 */
import type { Chapter, Entity } from '@/data/types';
import { isDevanagari } from '@/lib/text';
import { parseCommand, proposeEdit } from '@/lib/voiceEdit';

/** English commands must open with an explicit edit verb (or "go to / find … where"). */
const EN_LEAD = /^(?:(?:ok(?:ay)?|now|so)[,\s]+)?(?:please\s+)?(?:replace|change|swap|delete|remove|cut|take out|after|before|go to|find|take me to|jump to)\b/i;
const EN_LEAD_TRIM = /^(?:(?:ok(?:ay)?|now|so)[,\s]+)/i;
/** Hindi commands end with an imperative edit verb. */
const HI_VERB = /(?:बदल|बदली कर|हटा|मिटा|काट|जोड़|लिख)(?:ो|ें|िए|दो|दें|ओ|दीजिए)/;

const MAX_WORDS = 30;

/** Returns the command text to run when this utterance is a clear edit command for these pages; otherwise null (write it as prose). */
export function spokenCommand(utterance: string, docs: Chapter[], entities: Entity[] = []): string | null {
  const said = utterance.trim().replace(/\s+/g, ' ');
  if (!said) return null;
  const n = said.split(' ').length;
  if (n < 3 || n > MAX_WORDS) return null;
  const hindi = isDevanagari(said);
  if (!hindi && !EN_LEAD.test(said)) return null;
  if (hindi && !HI_VERB.test(said)) return null;
  const cmdText = hindi ? said : said.replace(EN_LEAD_TRIM, '');
  const cmd = parseCommand(cmdText);
  if (!cmd) return null;
  // "Add … where …" without "go to / find" reads like prose; only take the explicit form.
  if (!hindi && cmd.kind === 'add' && !/^(?:please\s+)?(?:go to|find|take me to|jump to)\b/i.test(cmdText)) return null;
  // The words it points at must be on the page; otherwise it's the author's sentence.
  const res = proposeEdit(cmdText, docs, { entities });
  return res.ok ? cmdText : null;
}
