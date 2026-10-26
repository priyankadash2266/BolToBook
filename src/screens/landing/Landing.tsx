import { BetaPricing } from '@/components/BetaPricing';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppLang } from '@/data/types';
import { useDict } from '@/i18n';
import { LangToggle, Wordmark } from '@/components/bits';
import { Segmented } from '@/components/Segmented';
import { Icon } from '@/components/Icon';
import { useBooks } from '@/data/hooks';
import type { LandingCopy, MarkSeg } from './copy';
import { Notebook } from './Notebook';
import { CoverDemo, FindDemo, LapDemo, MarginDemo, MemoryDemo, PlanDemo, ProofDemo, ReadyDemo, SpeakDemo } from './Demos';
import './landing.css';

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
  el.content = content;
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

export default function Landing({ lang }: { lang: AppLang }) {
  const c = useDict<LandingCopy>('landing', 'page')!;
  const navigate = useNavigate();
  const { data: books } = useBooks();
  const hasBooks = !!books && books.length > 0;
  const deva = lang === 'hi';
  const bookCls = deva ? 'deva-book' : 'book';
  const j = c.journey;

  useEffect(() => {
    document.title = c.meta.title;
    setMeta('description', c.meta.description);
  }, [c]);

  // The marketing page scrolls the window, not the app shell.
  useEffect(() => { window.scrollTo(0, 0); }, [lang]);

  const switchLang = (l: AppLang) => { if (l !== lang) navigate(l === 'hi' ? '/hi' : '/'); };
  const anchor = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); scrollToId(id); history.replaceState(null, '', `#${id}`); };

  const demos = [
    <LapDemo key="1" c={j.lap} deva={deva} />,
    <MarginDemo key="2" c={j.margin} deva={deva} />,
    <PlanDemo key="3" c={j.plan} deva={deva} />,
    <SpeakDemo key="4" c={j.speak} deva={deva} />,
    <FindDemo key="5" c={j.find} deva={deva} />,
    <MemoryDemo key="6" c={j.memory} deva={deva} />,
    <ProofDemo key="7" c={j.proof} deva={deva} />,
    <CoverDemo key="8" c={j.cover} deva={deva} />,
    <ReadyDemo key="9" c={j.ready} cover={j.cover} deva={deva} />,
  ];

  return (
    <div className={`lp ${deva ? 'lp-hi' : ''}`}>
      <a href="#main" className="lp-skip" onClick={anchor('main')}>{c.skip}</a>

      <header className="lp-header">
        <div className="lp-header-in">
          <Wordmark to={lang === 'hi' ? '/hi' : '/'} />
          <nav className="lp-nav" aria-label={c.nav.label}>
            <a href="#journey" onClick={anchor('journey')}>{c.nav.how}</a>
            <a href="#writers" onClick={anchor('writers')}>{c.nav.writers}</a>
            <a href="#trust" onClick={anchor('trust')}>{c.nav.trust}</a>
            <a href="#pricing" onClick={anchor('pricing')}>{c.nav.pricing}</a>
          </nav>
          <div className="lp-header-right">
            <Link to="/app" className="lp-desk">{hasBooks ? c.nav.continue : c.nav.openDesk}</Link>
            <LangToggle value={lang} onChange={switchLang} />
            <Link to="/start" className="btn btn-primary btn-sm lp-header-cta">
              <span className="lp-cta-long">{c.nav.start}</span><span className="lp-cta-short">{c.nav.startShort}</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* HERO */}
        <section className="lp-hero lp-wrap" aria-labelledby="lp-h1">
          <div className="lp-hero-copy">
            <div className="kick">{c.hero.eyebrow}</div>
            <h1 id="lp-h1" className="display lp-h1">{c.hero.h1a}<br /><em>{c.hero.h1b}</em></h1>
            <p className="lp-lead">{c.hero.sub}</p>
            <div className="lp-ctas">
              <Link to="/start" className="btn btn-primary btn-lg">{c.hero.cta1}</Link>
              <a href="#journey" className="btn btn-ghost btn-lg" onClick={anchor('journey')}>{c.hero.cta2} <Icon name="down" size={16} /></a>
            </div>
            <ul className="lp-trustline">
              {c.hero.trust.map((x) => <li key={x}><Icon name="check" size={14} /> {x}</li>)}
            </ul>
          </div>
          <div className="lp-hero-demo">
            <Notebook copy={c.demo} deva={deva} />
          </div>
        </section>

        {/* EPIGRAPH */}
        <section className="lp-epi" aria-labelledby="lp-epi-k">
          <div className="lp-epi-in">
            <div id="lp-epi-k" className="kick lp-epi-kick">{c.epigraph.kick}</div>
            <blockquote className="lp-epi-quote">
              <p className={`display ${bookCls}`}>{c.epigraph.quote}</p>
            </blockquote>
            <p className={`lp-epi-story ${bookCls}`}>{c.epigraph.story}</p>
            <p className="lp-epi-tie">{c.epigraph.tie}</p>
            <div className="lp-epi-cite">— {c.epigraph.cite}</div>
          </div>
        </section>

        {/* JOURNEY */}
        <section id="journey" className="lp-journey lp-wrap" aria-labelledby="lp-j-title" tabIndex={-1}>
          <div className="kick">{j.kick}</div>
          <h2 id="lp-j-title" className="display lp-h2 lp-j-title">{j.title}</h2>
          <ol className="lp-rows">
            {j.rows.map((r, i) => (
              <li key={r.n} className={`lp-row ${i % 2 ? 'is-flip' : ''}`}>
                <div className="lp-row-copy">
                  <div className="lp-numeral" aria-hidden="true">{r.n}</div>
                  <h3 className="display lp-h3">{r.title}</h3>
                  <p className="lp-body">{r.body}</p>
                </div>
                <div className="lp-row-demo">{demos[i]}</div>
              </li>
            ))}
          </ol>
        </section>

        {/* WRITERS */}
        {deva ? <HindiWriters c={c} /> : <EnglishWriters c={c} />}

        {/* TRUST */}
        <section id="trust" className="lp-trust lp-wrap" aria-labelledby="lp-trust-t" tabIndex={-1}>
          <div className="lp-trust-intro">
            <div className="kick">{c.trust.kick}</div>
            <h2 id="lp-trust-t" className="display lp-h2">{c.trust.title}</h2>
            <p className="lp-body">{c.trust.lead}</p>
          </div>
          <div className="page lp-letter">
            <ol className={`lp-promises ${bookCls}`}>
              {c.trust.promises.map((p) => <li key={p}>{p}</li>)}
            </ol>
            <div className="lp-letter-sign">
              <span className="display lp-sign">{c.trust.sign}</span>
              <span className="lp-small">{c.trust.place}</span>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <BetaPricing />

        {/* FAQ */}
        <section id="faq" className="lp-faq lp-wrap" aria-labelledby="lp-faq-t">
          <div className="lp-faq-intro">
            <div className="kick">{c.faq.kick}</div>
            <h2 id="lp-faq-t" className="display lp-h2">{c.faq.title}</h2>
          </div>
          <div className="lp-faq-list">
            {c.faq.items.map((f, i) => (
              <details key={f.q} className="lp-qa" open={i === 0}>
                <summary><span>{f.q}</span><Icon name="plus" size={18} aria-hidden="true" /></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="lp-final" aria-labelledby="lp-final-t">
          <div className="lp-final-in">
            <h2 id="lp-final-t" className="display lp-final-title">{c.final.title}</h2>
            <Link to="/start" className="btn btn-lg lp-final-btn"><Icon name="mic" size={18} /> {c.final.cta}</Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-in">
          <Wordmark to={lang === 'hi' ? '/hi' : '/'} size={20} />
          <span>{fill(c.footer.rights, { year: new Date().getFullYear() })}</span>
          <span>{c.footer.made}</span>
          <Link to="/app">{hasBooks ? c.nav.continue : c.nav.openDesk}</Link>
          <span>
            {c.footer.other}{' '}
            {lang === 'hi' && <Link to={c.footer.otherHref} lang="en" hrefLang="en">{c.footer.otherLang}</Link>}
          </span>
        </div>
      </footer>
    </div>
  );
}

function EnglishWriters({ c }: { c: LandingCopy }) {
  const w = c.writers!;
  const [sel, setSel] = useState(0);
  const cur = w.types[sel];
  return (
    <section id="writers" className="lp-writers" aria-labelledby="lp-w-t" tabIndex={-1}>
      <div className="lp-wrap lp-writers-in">
        <div className="lp-writers-copy">
          <div className="kick lp-kick-night">{w.kick}</div>
          <h2 id="lp-w-t" className="display lp-h2">{w.title}</h2>
          <p className="lp-body">{w.body}</p>
          <div className="lp-chips" role="group" aria-label={w.label}>
            {w.types.map((t, i) => (
              <button key={t.key} type="button" className="chip lp-chip-night" aria-pressed={i === sel} onClick={() => setSel(i)}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className="page lp-desk-card" aria-live="polite">
          <div className="lp-cap">{cur.label}</div>
          <p className="book lp-desk-line">{cur.line}</p>
          <div className="lp-cap">{w.shelvesLabel}</div>
          <ul className="lp-shelves">
            {cur.shelves.map((s) => <li key={s}><span className="lp-spine" aria-hidden="true" />{s}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Marked({ segs }: { segs: MarkSeg[] }) {
  return <>{segs.map((s, i) => (typeof s === 'string' ? <span key={i}>{s}</span> : <mark key={i} className="hit">{s.m}</mark>))}</>;
}

function HindiWriters({ c }: { c: LandingCopy }) {
  const h = c.hindiFirst!;
  const g = c.hinglish!;
  const w = c.writers!;
  const [mode, setMode] = useState<'keep' | 'deva'>('keep');
  const [sel, setSel] = useState(0);
  const cur = w.types[sel];
  return (
    <>
      <section id="writers" className="lp-writers" aria-labelledby="lp-hf-t" tabIndex={-1}>
        <div className="lp-wrap lp-writers-in">
          <div className="lp-writers-copy">
            <div className="kick lp-kick-night">{h.kick}</div>
            <h2 id="lp-hf-t" className="display lp-h2">{h.title}</h2>
            <p className="lp-body">{h.body}</p>
            <ul className="lp-points">
              {h.points.map((p) => <li key={p}><Icon name="check" size={15} /> <span>{p}</span></li>)}
            </ul>
          </div>
          <div className="page lp-deva-page">
            <div className="lp-cap">{h.sampleHead}</div>
            <p className="deva-book lp-deva-sample">{h.sample}</p>
          </div>
        </div>
      </section>

      <section className="lp-hinglish lp-wrap" aria-labelledby="lp-hg-t">
        <div className="lp-hinglish-copy">
          <div className="kick">{g.kick}</div>
          <h2 id="lp-hg-t" className="display lp-h2">{g.title}</h2>
          <p className="lp-body">{g.body}</p>
          <Segmented label={g.label} value={mode} onChange={setMode} options={[{ value: 'keep', label: g.keep }, { value: 'deva', label: g.deva }]} />
        </div>
        <div className="lp-hinglish-pair">
          <div className="page lp-hg-said">
            <div className="lp-cap">{g.saidLabel}</div>
            <p className="deva-ui lp-hg-saidtext">{g.said}</p>
          </div>
          <div className="lp-hg-arrow" aria-hidden="true"><Icon name="right" size={18} /></div>
          <div className="page lp-hg-book" aria-live="polite">
            <div className="lp-cap">{g.bookLabel}</div>
            <p className="deva-book lp-hg-booktext"><Marked segs={mode === 'keep' ? g.keepSegs : g.devaSegs} /></p>
            <div className="lp-small">{mode === 'keep' ? g.keepNote : g.devaNote}</div>
          </div>
        </div>
      </section>

      <section className="lp-types lp-wrap" aria-labelledby="lp-ty-t">
        <div className="lp-types-copy">
          <div className="kick">{w.kick}</div>
          <h2 id="lp-ty-t" className="display lp-h2">{w.title}</h2>
          <p className="lp-body">{w.body}</p>
          <div className="lp-chips" role="group" aria-label={w.label}>
            {w.types.map((t, i) => (
              <button key={t.key} type="button" className="chip" aria-pressed={i === sel} onClick={() => setSel(i)}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className="page lp-desk-card" aria-live="polite">
          <div className="lp-cap">{cur.label}</div>
          <p className="deva-book lp-desk-line">{cur.line}</p>
          <div className="lp-cap">{w.shelvesLabel}</div>
          <ul className="lp-shelves">
            {cur.shelves.map((s) => <li key={s}><span className="lp-spine" aria-hidden="true" />{s}</li>)}
          </ul>
        </div>
      </section>
    </>
  );
}
