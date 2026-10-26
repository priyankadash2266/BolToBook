import { Link } from 'react-router-dom';
import { Wordmark } from '@/components/bits';
import { TabArt } from '@/components/TabArt';
import { useLang } from '@/i18n';

const COPY = {
  en: { kick: 'Page not found', title: 'This page is blank.', body: 'Not every page gets written. This one didn’t.', home: 'Back to the beginning', books: 'Go to your books' },
  hi: { kick: 'पन्ना नहीं मिला', title: 'यह पन्ना कोरा है।', body: 'हर पन्ना लिखा नहीं जाता। यह भी नहीं लिखा गया।', home: 'शुरुआत पर लौटें', books: 'अपनी किताबों पर जाएँ' },
};

export default function NotFound() {
  const { lang } = useLang();
  const t = COPY[lang] ?? COPY.en;
  return (
    <div className="nf">
      <style>{`
        .nf { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; padding: 32px 16px; text-align: center;
          background-color: var(--desk); background-image: var(--grain); }
        .nf-sheet { position: relative; width: min(440px, 100%); padding: 40px 32px 36px; background-color: var(--paper); background-image: var(--grain);
          border: 1px solid #E6DCCB; border-radius: 3px 8px 8px 3px; box-shadow: var(--shadow-page), 8px 8px 0 -3px #ECE5D7, 14px 14px 0 -6px #E0D8C9;
          display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .nf-sheet::after { content: ''; position: absolute; inset: 10px; border: 1px solid var(--rule-2); pointer-events: none; }
        .nf-art { width: 120px; height: auto; color: var(--line-2); }
        .nf-art .ta-brass { color: var(--brass); stroke: var(--brass); }
        .nf h1 { font-family: var(--font-display); font-size: clamp(30px, 5vw, 38px); line-height: 1.15; color: var(--ink-strong); }
        .nf p { font-family: var(--font-book); font-style: italic; color: var(--ink-3); font-size: 16.5px; line-height: 1.6; }
        :root[lang='hi'] .nf p { font-family: var(--font-deva-book); font-style: normal; }
        .nf-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px; position: relative; z-index: 1; }
      `}</style>
      <Wordmark />
      <div className="nf-sheet">
        <TabArt id="manuscript" className="nf-art" />
        <div className="kick">{t.kick}</div>
        <h1>{t.title}</h1>
        <p>{t.body}</p>
        <div className="nf-actions">
          <Link className="btn btn-primary" to="/">{t.home}</Link>
          <Link className="btn btn-ghost" to="/app">{t.books}</Link>
        </div>
      </div>
    </div>
  );
}
