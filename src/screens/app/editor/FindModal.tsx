import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Icon } from '@/components/Icon';
import { Waveform } from '@/components/Waveform';
import { useT } from '@/i18n';
import { asksForFirst, searchBook, snippet, type Hit } from '@/lib/search';
import { createDictationEngine, useMicLevel, type DictationEngine } from '@/lib/speech';
import { isDevanagari } from '@/lib/text';
import type { Chapter, Entity } from '@/data/types';

interface Props {
  open: boolean;
  onClose: () => void;
  chapters: Chapter[];
  entities: Entity[];
  locale: string;
  supported: boolean;
  initialQuery?: string;
  onPick: (hit: Hit) => void;
  deva: boolean;
}

export function FindModal({ open, onClose, chapters, entities, locale, supported, initialQuery, onPick, deva }: Props) {
  const t = useT('editor');
  const [q, setQ] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const engine = useRef<DictationEngine | null>(null);
  const session = useRef(0);
  const level = useMicLevel(listening);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(initialQuery ?? ''); setInterim(''); } }, [open, initialQuery]);
  useEffect(() => () => engine.current?.abort(), []);
  useEffect(() => { if (!open) { session.current++; engine.current?.abort(); setListening(false); setInterim(''); } }, [open]);

  const stopListening = () => { engine.current?.stop(); };
  const startListening = () => {
    engine.current?.abort();
    engine.current = createDictationEngine();
    const my = ++session.current;
    setQ('');
    engine.current.start(locale, {
      onInterim: (s) => { if (my === session.current) setInterim(s); },
      onFinal: (s) => { if (my !== session.current) return; setQ((x) => (x ? x + ' ' : '') + s.trim()); setInterim(''); },
      onState: (s) => { if (my !== session.current) return; setListening(s === 'listening' || s === 'starting'); if (s === 'idle') inputRef.current?.focus(); },
      onError: () => { if (my === session.current) setListening(false); },
    });
  };

  const query = (q + (interim ? ' ' + interim : '')).trim();
  const hasText = chapters.some((c) => c.content.trim());
  const first = asksForFirst(query);
  const hits = useMemo(() => {
    if (!query) return [];
    const h = searchBook(query, chapters, { entities, limit: 8 });
    if (first) h.sort((a, b) => a.chapterOrder - b.chapterOrder || a.paraIndex - b.paraIndex);
    return h;
  }, [query, chapters, entities, first]);

  const chips = useMemo(() => {
    const names = entities.filter((e) => ['character', 'person', 'place', 'object'].includes(e.kind)).map((e) => e.name.trim()).filter(Boolean);
    const out: string[] = [];
    if (names[0]) out.push(t('find.exFirst', { name: names[0] }));
    if (names[0] && names[1]) out.push(t('find.exTwo', { a: names[0], b: names[1] }));
    if (names[2]) out.push(t('find.exWhere', { name: names[2] }));
    else if (names[1]) out.push(t('find.exFirst', { name: names[1] }));
    const generic = ['a', 'b', 'c', 'd'].map((k) => t(`find.generic.${k}`));
    for (const g of generic) if (out.length < 4) out.push(g);
    return out;
  }, [entities, t]);

  const label = (h: Hit) => h.chapterTitle.trim() || (h.chapterOrder === 0 ? t('find.ms') : t('top.chapterN', { n: h.chapterOrder }));

  return (
    <Modal open={open} onClose={onClose} width={680} ariaLabel={t('find.title')}>
      <div className="ed-find">
        <div className="ed-find-bar">
          {listening ? <Waveform active level={level} bars={6} height={22} /> : <Icon name="search" size={20} className="ed-find-ico" />}
          <label htmlFor="ed-find-q" className="sr-only">{t('find.label')}</label>
          <input
            id="ed-find-q"
            ref={inputRef}
            data-autofocus
            className={`ed-find-input ${deva || isDevanagari(query) ? 'deva-book' : 'book'}`}
            value={listening ? query : q}
            placeholder={t('find.ph')}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) onPick(hits[0]); }}
            autoComplete="off"
          />
          {supported && (
            <button type="button" className={`btn btn-icon btn-sm ${listening ? 'btn-primary' : 'btn-quiet'}`} onClick={listening ? stopListening : startListening} aria-label={listening ? t('find.stop') : t('find.speak')} aria-pressed={listening}>
              <Icon name={listening ? 'stop' : 'mic'} size={17} />
            </button>
          )}
          <button type="button" className="btn btn-quiet btn-xs ed-esc" onClick={onClose} aria-label="Esc">Esc</button>
        </div>

        {hasText && (
          <div className="ed-find-chips" aria-label={t('find.examples')}>
            {chips.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={q === c} onClick={() => { setQ(c); inputRef.current?.focus(); }}>{c}</button>
            ))}
          </div>
        )}

        <div className="ed-find-results" aria-live="polite">
          {!hasText ? (
            <p className="ed-find-empty">{t('find.emptyBook')}</p>
          ) : !query ? null : hits.length === 0 ? (
            <div className="ed-find-empty">
              <strong>{t('find.nothing')}</strong>
              <p>{t('find.nothingHelp')}</p>
            </div>
          ) : (
            <>
              <div className="sr-only">{hits.length === 1 ? t('find.resultsOne') : t('find.results', { n: hits.length })}</div>
              <ul>
                {hits.map((h, i) => {
                  const sn = snippet(h);
                  const tag = i === 0 ? (first ? t('find.firstMention') : t('find.best')) : '';
                  return (
                    <li key={`${h.chapterId}-${h.paraIndex}`}>
                      <button type="button" className="ed-find-hit" onClick={() => onPick(h)}>
                        <span className="ed-find-ch"><strong>{h.chapterOrder === 0 ? t('find.ms') : t('find.chapterN', { n: h.chapterOrder })}</strong></span>
                        <span className="ed-find-body">
                          <span className="ed-find-tag">{tag ? `${tag} · ` : ''}<span className={isDevanagari(label(h)) ? 'deva-ui' : ''}>{label(h)}</span></span>
                          <span className={`ed-find-snip ${isDevanagari(h.text) ? 'deva-book' : 'book'}`}>
                            {sn.pre}{sn.parts.map((part, j) => (part.hit ? <mark key={j} className="hit">{part.t}</mark> : <span key={j}>{part.t}</span>))}{sn.post}
                          </span>
                        </span>
                        <Icon name="arrow" size={16} className="ed-find-go" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <div className="ed-find-foot">{t('find.foot')}</div>
      </div>
    </Modal>
  );
}
