/**
 * Sample books for exploring each lifecycle: fiction (extends the base sample), nonfiction and memoir.
 * Original prose. Entity fields follow the conventions used by the lifecycle tabs.
 */
import { api } from '@/data/api';
import type { BookType, EntityKind } from '@/data/types';
import { createSampleBook } from './sample';

type E = { kind: EntityKind; name: string; fields?: Record<string, string> };

async function addEntities(bookId: string, list: E[]) {
  const ids: string[] = [];
  for (const e of list) ids.push((await api.entities.create({ bookId, kind: e.kind, name: e.name, fields: e.fields ?? {} })).id);
  return ids;
}

/** Fiction: the base sample (brief, themes, summary, characters, world, timeline, laps). */
async function fiction(lang: 'en' | 'hi') {
  return createSampleBook(lang);
}

async function nonfiction() {
  const book = await api.books.create({ title: 'Rupee by Rupee', subtitle: 'Money for your first ten years of work', type: 'nonfiction', lang: 'en', stage: 'writing', country: 'IN', author: 'Sample Author', fields: {
    brief: 'Money basics for your first ten years of work: where every part of your salary goes, and why.',
    themes: 'Freedom, Hope',
    promise_oneline: 'This book helps first-jobbers decide where every part of their salary goes, and why.',
    promise_before: 'You get paid, the money disappears, and every advice video contradicts the last one.',
    promise_after: 'You have a simple plan that runs itself, and you know which questions to ask before you sign anything.',
    reader_who: 'Someone in their twenties with a first salary and no one at home who talks about money.',
    thesis_problem: 'Money advice for young earners is either jargon or a sales pitch.',
    thesis_statement: 'Boring, automatic habits beat clever choices.',
    citation_style: 'chicago',
  } });
  const ch = [
    await api.chapters.create(book.id, { title: 'Your First Salary Slip', goal: 'Decode every line of a salary slip.', content: 'Your first salary slip looks like a puzzle written by an accountant who does not want you to finish it. Start with the line that says gross pay. That is what your employer spends on you. The number that reaches your account is smaller, and the difference has names.\n\nMost salaried people in India see a deduction for the provident fund. It is 12% of your basic pay, and your employer adds a matching amount.' }),
    await api.chapters.create(book.id, { title: 'Compounding, Honestly', goal: 'Show what compounding does, without promises.', content: 'Put away ₹10,000 every month. At 12% a year, after 20 years you would have about ₹99 lakh, of which only ₹24 lakh is money you actually put in.\n\n“Compound interest is the eighth wonder of the world,” goes the line usually credited to Albert Einstein. Forget who said it. Look at what it does.\n\nBroad index funds have returned roughly 12% a year over long periods, but some ten-year stretches have been much worse.' }),
    await api.chapters.create(book.id, { title: 'The Emergency Fund', goal: 'Why six months of expenses comes before investing.', content: '' }),
  ];
  const [src1, src2] = await addEntities(book.id, [
    { kind: 'source', name: 'Let’s Talk Money', fields: { type: 'book', authors: 'Monika Halan', year: '2018', publisher: 'HarperCollins India' } },
    { kind: 'source', name: 'Quote Investigator: “The Eighth Wonder of the World”', fields: { type: 'web', authors: 'Garson O’Toole', year: '2011', url: 'https://quoteinvestigator.com/2011/10/31/compound-interest/' } },
  ]);
  await addEntities(book.id, [
    { kind: 'fact', name: 'Employee provident fund contribution is 12% of basic pay', fields: { sourceId: src1, status: 'to verify', chapterId: ch[0].id } },
    { kind: 'quote', name: 'Compound interest is the eighth wonder of the world', fields: { who: 'often attributed to Albert Einstein', sourceId: src2, chapterId: ch[1].id, permission: 'notneeded' } },
    { kind: 'comp', name: 'Let’s Talk Money', fields: { author: 'Monika Halan', year: '2018', what: 'Clear, India-specific money basics', gap: 'Mine is only about the first ten years of work', readerOverlap: 'high' } },
    { kind: 'comp', name: 'The Psychology of Money', fields: { author: 'Morgan Housel', year: '2020', what: 'Behaviour over spreadsheets', gap: 'Mine has Indian numbers and step-by-step setups', readerOverlap: 'medium' } },
    { kind: 'question', name: 'How much should I save from my first salary?', fields: { chapterId: ch[0].id } },
    { kind: 'question', name: 'Do I need insurance at 24?', fields: {} },
    { kind: 'argument', name: 'Automate before you optimise', fields: { order: '1', chapterId: ch[1].id } },
    { kind: 'argument', name: 'Safety first: an emergency fund comes before any investment', fields: { order: '2', chapterId: ch[2].id } },
    { kind: 'note', name: 'Call with a chartered accountant', fields: { body: 'She said most first-jobbers never read the Form 16. Worth a sidebar.', chapterId: ch[0].id, tags: 'interview, tax' } },
  ]);
  await api.laps.create({ text: 'A chapter on saying no to friends’ “investment opportunities”?', source: 'typed', bookId: book.id });
  return book.id;
}

async function memoir() {
  const book = await api.books.create({ title: 'The Neem Tree', subtitle: 'A memoir', type: 'memoir', lang: 'en', stage: 'writing', country: 'IN', author: 'Sample Author', fields: {
    birth_year: '1989',
    arc_before: 'A girl who thought stories were something grown-ups did after dinner.',
    arc_happened: 'The courtyard was sold, and then my grandmother was gone, and the stories had nowhere to live.',
    arc_after: 'The one who keeps them.',
    arc_question: 'What do we owe the people who told us who we are?',
  } });
  const ch = [
    await api.chapters.create(book.id, { title: 'Summers in the Courtyard', goal: 'The courtyard, the neem tree and Nani’s voice.', content: 'Every summer we took the night train to Lucknow, and every summer Nani was waiting in the courtyard under the neem tree as if she had not moved since the year before.\n\nShe told the story of the jackal and the drum so many times that I could say it with her, a beat behind, like an echo she had taught to speak.' }),
    await api.chapters.create(book.id, { title: 'The Year the Courtyard Was Sold', goal: 'What we lost, and how nobody said so.', content: 'The courtyard was sold in 2004. Mamaji signed the papers on a Tuesday and did not tell anyone until Sunday lunch.' }),
  ];
  const [nani, mama] = await addEntities(book.id, [
    { kind: 'person', name: 'Nani', fields: { relation: 'grandmother', alive: 'no', consent: 'okay', note: 'Family agrees she can be named.' } },
    { kind: 'person', name: 'Mamaji', fields: { relation: 'uncle', alive: 'yes', consent: 'notasked' } },
  ]);
  await addEntities(book.id, [
    { kind: 'place', name: 'The courtyard in Lucknow', fields: { years: '1993–2003', description: 'Red floor, a charpai under the neem, the brass lota by the tap.' } },
    { kind: 'memory', name: 'The jackal and the drum, told under the neem', fields: { when: 'Summer 1995', year: '1995', where: 'The courtyard in Lucknow', who: nani, body: 'Nani lowered her voice for the jackal and raised it for the drum. The power went out halfway through and she kept going in the dark.', senses: 'Mosquito coil, warm brick, the neem’s bitter smell.', chapterId: ch[0].id } },
    { kind: 'lifeevent', name: 'The courtyard is sold', fields: { year: '2003', chapterId: ch[1].id, note: 'Ma remembers 2004.' } },
    { kind: 'lifeevent', name: 'Nani’s last summer', fields: { year: '2019' } },
    { kind: 'sensitive', name: 'Mamaji selling the house', fields: { chapterId: ch[1].id, para: '0', personId: mama, decision: 'ask', note: 'Talk to him before the book goes out.' } },
  ]);
  await api.laps.create({ text: 'The sound of the hand pump at 5 a.m. — put it in the first chapter', source: 'typed', bookId: book.id });
  return book.id;
}

async function poetry() {
  const book = await api.books.create({ title: 'Small Weather', subtitle: 'Poems', type: 'poetry', lang: 'en', stage: 'writing', country: 'IN', author: 'Sample Author', fields: {} });
  const poems: [string, string][] = [
    ['Monsoon, First Night', 'The roof learns a new word tonight\nand says it over and over,\nthe way a child says rain\nuntil rain means nothing but saying.\n\nI lie awake and let it teach me.'],
    ['Inventory of a Kitchen Drawer', 'One key that opens nothing now,\nthree rubber bands, a ration card,\nmy mother’s handwriting on a list\nof things we ran out of in 1998.\n\nWe ran out of so much that year.'],
    ['Platform Four', 'The train is late, and the tea is late,\nand the man who sells the tea is late,\nand all of us stand here being late together,\nwhich is a kind of arriving.'],
  ];
  for (const [title, content] of poems) await api.chapters.create(book.id, { title, content });
  await api.laps.create({ text: 'a poem about the sound the fridge makes at 3 a.m.', source: 'typed', bookId: book.id });
  return book.id;
}

/** Creates a sample book of the given type. Nonfiction and memoir samples are in English. */
export async function createSampleOfType(type: BookType, lang: 'en' | 'hi'): Promise<string> {
  if (type === 'nonfiction') return nonfiction();
  if (type === 'memoir') return memoir();
  if (type === 'poetry') return poetry();
  const id = await fiction(lang);
  if (type === 'stories' || type === 'other') await api.books.update(id, { type });
  return id;
}
