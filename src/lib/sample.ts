/**
 * An optional sample book for exploring BolToBook: a short literary piece set in a
 * hill town, with a few chapters, goals, people, a place, two Laps and some history.
 * Chapter text is the desk's Markdown subset (`@/lib/markdown`): chapter 3 shows an italic phrase and a scene break.
 * It contains a few deliberate slips (double spaces, a repeated word, "...") so
 * proofreading has something to find, and recurring phrases for find and voice edit.
 */
import { api } from '@/data/api';
import type { EntityKind, LapTag } from '@/data/types';

interface SampleChapter { title: string; goal: string; draft?: string; paras: string[]; edit?: { from: string; to: string; command: string } }
interface SampleBook {
  title: string; subtitle: string; author: string;
  premise: string;
  themes: string;
  chapters: SampleChapter[];
  entities: { kind: EntityKind; name: string; fields: Record<string, string> }[];
  laps: { title?: string; text: string; kind: string; chapter?: number; tags?: LapTag[]; twist?: boolean }[];
}

const EN: SampleBook = {
  title: 'The Fog Clock',
  subtitle: 'A sample book',
  author: 'Sample Author',
  themes: 'Family, Loss, Home',
  premise: 'In a hill town where the clock tower has not kept time for years, a granddaughter comes home to close her grandfather’s shop and finds he has been keeping a different kind of time.',
  chapters: [
    {
      title: 'The Shop Below the Tower',
      goal: 'Meera arrives in Dhoopgarh and finds the shop exactly as Nanaji left it.',
      paras: [
        'The bus from the plains gave up at the last bend, and Meera walked the rest of the way into Dhoopgarh with her bag on one shoulder and the fog on the other. The town had not changed. It had only grown quieter, the way a room grows quieter after someone has left it.',
        'Nanaji’s shop sat below the clock tower, wedged between a bakery and a shuttered tailor. The sign still said BHOLA RAM & SONS, WATCHES REPAIRED, although there had never been any sons, and in the last few years there had not been many watches either.',
        'She found the key where it had always been, under the third flowerpot. Inside, the shop smelled of oil and brass and the  red shawl he wore through every winter, folded now over the back of his chair as if he had stepped out for tea.',
        'On the workbench lay a pocket watch with its back open. Its hands were stopped at ten past four. Meera looked up through the window at the tower. The great clock above the square was stopped at ten past four as well.',
      ],
      edit: { from: 'red shawl', to: 'grey shawl', command: 'change “red shawl” to “grey shawl”' },
    },
    {
      title: 'Ten Past Four',
      goal: 'Tashi tells Meera what the town says about the clock; she starts to doubt the story she was told.',
      paras: [
        'Tashi from the post office came by in the morning with a bundle of letters tied in string. He was older than she remembered and he still talked with his hands, as though the words needed help getting out.',
        '“Everyone says the tower stopped the night of the landslide,” he said. “Ten past four. But your Nanaji said that was nonsense. He said a clock only stops when someone asks it to.”',
        'Meera laughed, and then she did not. She thought of the the pocket watch on the bench, and of the small brass key she had found beside it, too small for any lock in the shop.',
        'After Tashi left she sat with the letters in her lap... Every one of them was addressed to Nanaji, and every one of them had come back unopened.',
      ],
      draft: 'Tashi from the post office came by in the morning with a bundle of letters tied in string. He was older than she remembered and he still talked with his hands, as though the words needed help getting out.\n\n“Everyone says the tower stopped the night of the landslide,” he said. “Ten past four. But your Nanaji said that was nonsense. He said a clock only stops when someone asks it to.”',
    },
    {
      title: 'The Key',
      goal: 'Meera climbs the tower with the brass key. End on what she finds, not what it means.',
      paras: [
        'The door at the foot of the tower had been painted shut so many times that the paint itself had become a kind of lock. Meera worked at it with a kitchen knife until it gave.',
        'The stairs went up in a square spiral, and on every landing there was a small window full of fog. Halfway up she stopped to breathe and heard it: *not ticking*, but something slower, like a heart that had decided to take its time.',
        '***',
        'At the top, behind the great face of the clock, the brass key fitted a little drawer she would never have noticed. Inside were more letters, in Nanaji’s handwriting, each one dated ten past four.',
      ],
    },
  ],
  entities: [
    { kind: 'summary', name: 'Coming home', fields: { order: '1', description: 'Meera comes home to Dhoopgarh to sell Nanaji’s watch shop and leave within a week.' } },
    { kind: 'summary', name: 'The letters', fields: { order: '2', description: 'Tashi brings letters that came back unopened. A small brass key fits no lock in the shop.' } },
    { kind: 'summary', name: 'The tower', fields: { order: '3', description: 'At the top of the clock tower Meera finds the letters Nanaji wrote and never sent.' } },
    { kind: 'character', name: 'Meera', fields: { order: '1', description: 'Nanaji’s granddaughter, a copywriter home from the plains. Wants to close the shop and leave before winter. Tashi remembers her as a child.', notes: '' } },
    { kind: 'character', name: 'Nanaji', fields: { order: '2', description: 'Bhola Ram, the clockmaker. Always wore a grey shawl in winter. Raised Meera after her parents moved away.', notes: 'Never seen alive in the book.' } },
    { kind: 'character', name: 'Tashi', fields: { order: '3', description: 'Works at the post office. Talks with his hands. Was Nanaji’s friend for thirty years.', notes: '' } },
    { kind: 'place', name: 'Dhoopgarh', fields: { order: '1', description: 'A hill town of fog, pine and one stopped clock tower. People greet each other by the weather.' } },
    { kind: 'place', name: 'Bhola Ram & Sons', fields: { order: '2', description: 'The watch shop below the tower, between a bakery and a shuttered tailor. Smells of oil and brass.' } },
    { kind: 'event', name: 'Winter, twelve years ago', fields: { order: '1', description: 'The tower clock stops at ten past four, the night of the landslide.' } },
    { kind: 'event', name: 'This spring, day 1', fields: { order: '2', description: 'Meera arrives in Dhoopgarh and finds the pocket watch stopped at ten past four.' } },
    { kind: 'event', name: 'This spring, day 2', fields: { order: '3', description: 'Tashi brings the letters; Meera climbs the tower with the brass key.' } },
  ],
  laps: [
    { title: 'Who stopped the clock', text: 'What if Nanaji stopped the clock himself, on the night his brother left?', kind: 'plot', twist: true, tags: [{ type: 'character', name: 'Nanaji' }, { type: 'event', name: 'clock stops' }] },
    { title: 'Bakery smell', text: 'The bakery next door smells of cardamom and woodsmoke. Meera remembers it before she remembers his face.', kind: 'detail', chapter: 1, tags: [{ type: 'location', name: 'Dhoopgarh' }, { type: 'chapter', name: '1' }] },
  ],
};

const HI: SampleBook = {
  title: 'धुंध की घड़ी',
  subtitle: 'नमूने की किताब',
  author: 'नमूना लेखक',
  themes: 'परिवार, खोना, घर',
  premise: 'एक पहाड़ी क़स्बे में, जहाँ घंटाघर बरसों से रुका पड़ा है, एक नातिन अपने नानाजी की दुकान बंद करने लौटती है और पाती है कि वे किसी और ही तरह का समय सँभाल रहे थे।',
  chapters: [
    {
      title: 'घंटाघर के नीचे की दुकान',
      goal: 'मीरा धूपगढ़ पहुँचती है और दुकान को ठीक वैसा ही पाती है जैसा नानाजी छोड़ गए थे।',
      paras: [
        'मैदानों से आई बस आख़िरी मोड़ पर हार मान गई, और मीरा बाक़ी रास्ता पैदल चलकर धूपगढ़ पहुँची, एक कंधे पर थैला और दूसरे पर धुंध। क़स्बा बदला नहीं था। बस कुछ और चुप हो गया था, जैसे कोई कमरा किसी के चले जाने के बाद चुप हो जाता है।',
        'नानाजी की दुकान घंटाघर के ठीक नीचे थी, एक बेकरी और बंद पड़ी दर्ज़ी की दुकान के बीच दबी हुई। तख़्ती पर अब भी लिखा था, भोला राम एंड संस, घड़ीसाज़, हालाँकि कोई बेटा कभी था ही नहीं, और पिछले कुछ बरसों में घड़ियाँ भी कम ही आती थीं ।',
        'चाबी वहीं मिली जहाँ हमेशा रहती थी, तीसरे गमले के नीचे। भीतर तेल, पीतल और उस  लाल शॉल की गंध थी जो वे हर सर्दी ओढ़ते थे, अब उनकी कुर्सी की पीठ पर तह करके रखी हुई, जैसे वे बस चाय पीने निकले हों।',
        'मेज़ पर एक जेब घड़ी पड़ी थी, उसका ढक्कन खुला था। उसकी सुइयाँ चार बजकर दस मिनट पर रुकी थीं। मीरा ने खिड़की से घंटाघर की ओर देखा। चौक के ऊपर की बड़ी घड़ी भी चार बजकर दस मिनट पर रुकी थी.',
      ],
      edit: { from: 'लाल शॉल', to: 'स्लेटी शॉल', command: '“लाल शॉल” को “स्लेटी शॉल” कर दो' },
    },
    {
      title: 'चार बजकर दस मिनट',
      goal: 'ताशी मीरा को बताता है कि क़स्बा घड़ी के बारे में क्या कहता है; मीरा को सुनी हुई कहानी पर शक होने लगता है।',
      paras: [
        'डाकख़ाने वाला ताशी सुबह-सुबह सुतली में बँधी चिट्ठियों का एक बंडल लेकर आया। वह मीरा की याद से ज़्यादा बूढ़ा हो गया था, पर अब भी हाथों से बात करता था, जैसे शब्दों को बाहर आने में मदद चाहिए हो।',
        '“सब कहते हैं घंटाघर भूस्खलन वाली रात रुका था,” उसने कहा। “चार बजकर दस मिनट। पर तुम्हारे नानाजी कहते थे यह सब बकवास है। कहते थे घड़ी तभी रुकती है जब कोई उससे रुकने को कहे।”',
        'मीरा हँसी, और फिर नहीं हँसी। उसे मेज़ पर पड़ी जेब घड़ी याद आई, और उसके पास मिली पीतल की वह छोटी-सी चाबी, जो दुकान के किसी ताले में नहीं लगती थी।',
        'ताशी के जाने के बाद वह चिट्ठियाँ गोद में लिए बैठी रही... हर चिट्ठी नानाजी के नाम थी, और हर चिट्ठी बिना खुले लौट आई थी ।',
      ],
      draft: 'डाकख़ाने वाला ताशी सुबह-सुबह सुतली में बँधी चिट्ठियों का एक बंडल लेकर आया। वह मीरा की याद से ज़्यादा बूढ़ा हो गया था, पर अब भी हाथों से बात करता था, जैसे शब्दों को बाहर आने में मदद चाहिए हो।\n\n“सब कहते हैं घंटाघर भूस्खलन वाली रात रुका था,” उसने कहा। “चार बजकर दस मिनट। पर तुम्हारे नानाजी कहते थे यह सब बकवास है। कहते थे घड़ी तभी रुकती है जब कोई उससे रुकने को कहे।”',
    },
    {
      title: 'चाबी',
      goal: 'मीरा पीतल की चाबी लेकर घंटाघर पर चढ़ती है। अध्याय वहीं ख़त्म हो जहाँ उसे कुछ मिलता है, उसके मतलब पर नहीं।',
      paras: [
        'घंटाघर के नीचे का दरवाज़ा इतनी बार रंगा गया था कि रंग ख़ुद एक ताला बन गया था। मीरा रसोई की छुरी से उसे तब तक कुरेदती रही जब तक वह खुल नहीं गया।',
        'सीढ़ियाँ चौकोर घुमाव में ऊपर जाती थीं, और हर मोड़ पर धुंध से भरी एक छोटी खिड़की थी। आधे रास्ते में वह साँस लेने रुकी और तब उसने सुना: *टिक-टिक नहीं*, कुछ और धीमा, जैसे कोई दिल जिसने अपना समय लेने की ठान ली हो।',
        '***',
        'सबसे ऊपर, घड़ी के बड़े चेहरे के पीछे, पीतल की चाबी एक छोटी-सी दराज़ में लग गई जिस पर उसकी नज़र कभी न जाती। भीतर और चिट्ठियाँ थीं, नानाजी की लिखावट में, हर एक पर तारीख़ के साथ लिखा था, चार बजकर दस मिनट।',
      ],
    },
  ],
  entities: [
    { kind: 'summary', name: 'घर वापसी', fields: { order: '1', description: 'मीरा नानाजी की घड़ी की दुकान बेचकर हफ़्ते भर में लौट जाने के लिए धूपगढ़ आती है।' } },
    { kind: 'summary', name: 'चिट्ठियाँ', fields: { order: '2', description: 'ताशी बिना खुली लौटी चिट्ठियाँ लाता है। पीतल की एक छोटी चाबी दुकान के किसी ताले में नहीं लगती।' } },
    { kind: 'summary', name: 'घंटाघर', fields: { order: '3', description: 'घंटाघर की चोटी पर मीरा को वे चिट्ठियाँ मिलती हैं जो नानाजी ने लिखीं पर कभी भेजी नहीं।' } },
    { kind: 'character', name: 'मीरा', fields: { order: '1', description: 'नानाजी की नातिन, मैदानों से लौटी कॉपीराइटर। सर्दी से पहले दुकान बंद करके लौट जाना चाहती है। ताशी उसे बचपन से जानता है।', notes: '' } },
    { kind: 'character', name: 'नानाजी', fields: { order: '2', description: 'भोला राम, घड़ीसाज़। सर्दियों में हमेशा स्लेटी शॉल ओढ़ते थे। मीरा को उन्होंने ही पाला।', notes: 'किताब में कभी जीवित नहीं दिखते।' } },
    { kind: 'character', name: 'ताशी', fields: { order: '3', description: 'डाकख़ाने में काम करता है। हाथों से बात करता है। तीस बरस नानाजी का दोस्त रहा।', notes: '' } },
    { kind: 'place', name: 'धूपगढ़', fields: { order: '1', description: 'धुंध, देवदार और एक रुके हुए घंटाघर वाला पहाड़ी क़स्बा। लोग मौसम से एक-दूसरे का हाल पूछते हैं।' } },
    { kind: 'place', name: 'भोला राम एंड संस', fields: { order: '2', description: 'घंटाघर के नीचे घड़ी की दुकान, बेकरी और बंद दर्ज़ी की दुकान के बीच। तेल और पीतल की गंध।' } },
    { kind: 'event', name: 'बारह बरस पहले, सर्दी', fields: { order: '1', description: 'भूस्खलन वाली रात घंटाघर चार बजकर दस मिनट पर रुक जाता है।' } },
    { kind: 'event', name: 'इस वसंत, पहला दिन', fields: { order: '2', description: 'मीरा धूपगढ़ पहुँचती है और जेब घड़ी को चार बजकर दस मिनट पर रुका पाती है।' } },
    { kind: 'event', name: 'इस वसंत, दूसरा दिन', fields: { order: '3', description: 'ताशी चिट्ठियाँ लाता है; मीरा पीतल की चाबी लेकर घंटाघर पर चढ़ती है।' } },
  ],
  laps: [
    { title: 'घड़ी किसने रोकी', text: 'अगर नानाजी ने घड़ी ख़ुद रोकी हो, उस रात जब उनका भाई घर छोड़कर गया था?', kind: 'plot', twist: true, tags: [{ type: 'character', name: 'नानाजी' }, { type: 'event', name: 'घड़ी रुकी' }] },
    { title: 'बेकरी की महक', text: 'पड़ोस की बेकरी से इलायची और लकड़ी के धुएँ की महक आती है। मीरा को उनका चेहरा याद आने से पहले यह महक याद आती है।', kind: 'detail', chapter: 1, tags: [{ type: 'location', name: 'धूपगढ़' }, { type: 'chapter', name: '1' }] },
  ],
};

/** Creates the sample book through the API and returns its id. */
export async function createSampleBook(lang: 'en' | 'hi'): Promise<string> {
  const s = lang === 'hi' ? HI : EN;
  const profile = await api.profile.get();
  const book = await api.books.create({
    title: s.title, subtitle: s.subtitle, author: s.author, type: 'fiction', lang: lang === 'hi' ? 'hi' : 'en',
    stage: 'writing', country: profile.country, fields: { brief: s.premise, themes: s.themes },
  });
  const chapterIds: string[] = [];
  for (const ch of s.chapters) {
    const full = ch.paras.join('\n\n');
    if (ch.draft) {
      // An earlier draft, then the author's dictated addition, so History has a real version to show.
      const c = await api.chapters.create(book.id, { title: ch.title, goal: ch.goal, content: ch.draft });
      await api.chapters.update(c.id, { content: full }, { source: 'dictation', summary: lang === 'hi' ? 'बोलकर दो अनुच्छेद जोड़े' : 'Dictated two paragraphs' });
      chapterIds.push(c.id);
    } else if (ch.edit) {
      // The chapter as first written, then a voice edit made exactly as the author said.
      const c = await api.chapters.create(book.id, { title: ch.title, goal: ch.goal, content: full });
      await api.chapters.update(c.id, { content: full.replace(ch.edit.from, ch.edit.to) }, {
        source: 'voice-edit', command: ch.edit.command,
        summary: lang === 'hi' ? `“${ch.edit.from}” की जगह “${ch.edit.to}”` : `“${ch.edit.from}” → “${ch.edit.to}”`,
      });
      chapterIds.push(c.id);
    } else {
      const c = await api.chapters.create(book.id, { title: ch.title, goal: ch.goal, content: full });
      chapterIds.push(c.id);
    }
  }
  for (const e of s.entities) await api.entities.create({ bookId: book.id, kind: e.kind, name: e.name, fields: e.fields });
  for (const l of s.laps) {
    await api.laps.create({ title: l.title, tags: l.tags, twist: l.twist, text: l.text, source: 'typed', bookId: book.id, kind: l.kind, chapterId: l.chapter ? chapterIds[l.chapter - 1] : undefined });
  }
  return book.id;
}
