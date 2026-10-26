import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { Icon } from '@/components/Icon';
import { MicOrb, LiveWave } from '@/components/voice';
import { useToast, useErrorNotice } from '@/components/Toast';
import { useT } from '@/i18n';
import { api } from '@/data/api';
import { useBooks, useProfile } from '@/data/hooks';
import { speechSupported } from '@/lib/speech';
import { isDevanagari } from '@/lib/text';
import { parseLapCreate, tagKey } from '@/lib/lapVoice';
import { useLapDictation, voiceErrorKey, type AudioTake } from '@/screens/app/laps/useLapDictation';
import { ParsedChips, SavedCheck } from '@/screens/app/laps/bits';
import '@/screens/app/laps/sheet.css';

interface OpenOpts {
  bookId?: string;
  /** Start listening straight away (default: true, since every way in is a mic). */
  listen?: boolean;
}
interface CaptureCtx { open: (opts?: OpenOpts) => void }
const Ctx = createContext<CaptureCtx>({ open: () => {} });
export const useCapture = () => useContext(Ctx);

/**
 * Quick Lap capture from anywhere (the brass mic on the Laps row, the mobile centre mic, Alt+L).
 * The same experience as the Laps page, in miniature: speak, see the words, keep it.
 */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; bookId?: string; listen: boolean; n: number }>({ open: false, listen: true, n: 0 });
  const open = useCallback((opts?: OpenOpts) => setState((s) => ({ open: true, bookId: opts?.bookId, listen: opts?.listen ?? true, n: s.n + 1 })), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'l' || e.key === 'L' || e.code === 'KeyL')) {
        e.preventDefault();
        setState((s) => (s.open ? s : { open: true, bookId: s.bookId, listen: true, n: s.n + 1 }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {state.open && <CaptureSheet key={state.n} initialBookId={state.bookId} autoListen={state.listen} onClose={() => setState((s) => ({ ...s, open: false }))} />}
    </Ctx.Provider>
  );
}

function CaptureSheet({ initialBookId, autoListen, onClose }: { initialBookId?: string; autoListen: boolean; onClose: () => void }) {
  const t = useT('laps');
  const c = useT('common');
  const toast = useToast();
  const nav = useNavigate();
  const { data: profile } = useProfile();
  const { data: books } = useBooks();
  const [bookId, setBookId] = useState<string | undefined>(initialBookId);
  const book = books?.find((b) => b.id === bookId);
  const d = useLapDictation({ bookLang: book?.lang });
  const audio = useRef<AudioTake>(null);
  const startedVoice = useRef(false);
  const [savedMoment, setSavedMoment] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Parsed fields the author took off ("that wasn't a title"). */
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const full = d.shown.trim();
  const parsed = useMemo(() => parseLapCreate(full), [full]);

  const bookTouched = useRef(initialBookId !== undefined);
  useEffect(() => { if (!bookTouched.current && profile) { bookTouched.current = true; if (profile.currentBookId) setBookId(profile.currentBookId); } }, [profile]);

  const start = () => { startedVoice.current = true; audio.current = null; void d.start(); };
  const stop = async () => { const r = await d.stop(); audio.current = r.audio; d.setText(r.value); };

  // Every way in is a mic, so start listening as the sheet opens.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !autoListen || !speechSupported() || !profile) return;
    auto.current = true;
    start();
  }, [autoListen, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
    let value = full;
    if (d.listening) { const r = await d.stop(); audio.current = r.audio; value = r.value; }
    const p = parseLapCreate(value);
    const keepTitle = !!p.title && !removed.has('title');
    // A title chip taken off goes back into the description, so none of the author's words are lost.
    const body = !p.title || keepTitle ? p.text : [p.title, p.text].filter(Boolean).join('\n');
    const tags = p.tags.filter((tg) => !removed.has(tagKey(tg)));
    if (!body && !keepTitle && !tags.length) { setSaving(false); return; }
    let audioId: string | undefined;
    let durationMs: number | undefined;
    const a = audio.current ? await audio.current : null;
    if (a && startedVoice.current) { audioId = await api.audio.put(a.blob, a.durationMs); durationMs = a.durationMs; }
    const lap = await api.laps.create({
      text: body, title: keepTitle ? p.title : undefined, tags: tags.length ? tags : undefined, twist: (p.twist && !removed.has('twist')) || undefined,
      source: startedVoice.current ? 'voice' : 'typed', bookId, audioId, durationMs,
    });
    setSavedMoment(true);
    const to = bookId ? `/app/b/${bookId}/laps?lap=${lap.id}` : `/app/laps?lap=${lap.id}`;
    setTimeout(() => {
      onClose();
      toast.show(t('toast.saved'), { label: t('sheet.view'), onClick: () => nav(to) });
    }, 900);
    }catch{toast.show('Could not save. Your words are still here — please retry.');setSaving(false);}
  };

  const err = voiceErrorKey(d.error);
  useErrorNotice(err ? t(err) : null);
  const caption = d.listening ? t('hero.listening') : full ? t('sheet.again') : t('hero.tap');
  const font = isDevanagari(full) ? 'deva-book' : 'book';
  const titleKept = parsed.title && !removed.has('title') ? parsed.title : undefined;
  const tagsKept = parsed.tags.filter((tg) => !removed.has(tagKey(tg)));
  const twistKept = parsed.twist && !removed.has('twist');

  return (
    <Modal open onClose={onClose} ariaLabel={t('sheet.title')} width={560}>
      <div className={`lps${d.listening ? ' is-listening' : ''}${savedMoment ? ' is-saved' : ''}`}>
        <div className="lps-head">
          <div>
            <p className="lps-kicker">{t('hero.kicker')}</p>
            <h2 className="display lps-title">{t('sheet.title')}</h2>
          </div>
          <button type="button" className="lps-close" onClick={onClose} aria-label={c('actions.close')}><Icon name="x" /></button>
        </div>

        {savedMoment ? (
          <div className="lps-saved rise" role="status">
            <SavedCheck size={56} />
            <p className="display lps-saved-h">{t('hero.savedLine')}</p>
            <ParsedChips title={titleKept} tags={tagsKept} twist={twistKept} dark />
          </div>
        ) : (
          <>
            {/* Same composer as the Laps page: [orb + caption] beside the page; the mic is never inside the text. */}
            <div className="lps-cap">
              <div className="lps-cap-orb">
                <MicOrb tone="lap" size={88} listening={d.listening} level={d.level} onClick={d.listening ? () => void stop() : start}
                  label={d.listening ? t('capture.stopOnly') : t('capture.say')} />
              </div>
              <p className="lps-cap-caption" aria-live="polite">{caption}</p>

              <div className="lps-page">
                <label className="sr-only" htmlFor="lap-text">{t('hero.fieldLabel')}</label>
                <textarea
                  id="lap-text"
                  className={`lps-text ${font}`}
                  value={d.shown}
                  readOnly={d.listening}
                  onChange={(e) => { d.setText(e.target.value); if (!e.target.value.trim()) setRemoved(new Set()); }}
                  placeholder={d.listening ? t('hero.wordsHere') : t('sheet.typePh')}
                  rows={4}
                />
              </div>
              <div className="lps-help">
                {d.listening ? (
                  <span className="lps-help-live">
                    <LiveWave active level={d.level} bars={24} height={18} barWidth={2} gap={2} color="var(--brass)" />
                    {t('hero.tapDone')}
                  </span>
                ) : (
                  <span className="lps-help-quiet">{t('sheet.shortcut')}</span>
                )}
              </div>
            </div>


            {(titleKept || tagsKept.length > 0 || twistKept) && (
              <div className="lps-chips" aria-live="polite">
                <p className="lps-k">{t('sheet.willSave')}</p>
                <ParsedChips dark title={titleKept} tags={tagsKept} twist={twistKept} onRemove={(k) => setRemoved((r) => new Set(r).add(k))} />
              </div>
            )}

            <div className="lps-foot">
              <label className="lps-book">
                <span>{t('sheet.forBook')}</span>
                <select value={bookId ?? ''} onChange={(e) => { bookTouched.current = true; setBookId(e.target.value || undefined); }}>
                  <option value="">{t('noBook')}</option>
                  {books?.map((b) => <option key={b.id} value={b.id}>{b.title || c('untitled')}</option>)}
                </select>
              </label>
              <button type="button" className="lps-save" onClick={() => void save()} disabled={!full || saving}>
                <Icon name="check" size={16} />{t('sheet.save')}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
