import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LangToggle } from '@/components/bits';
import { Icon, type IconName } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { useT, useLang } from '@/i18n';
import { api } from '@/data/api';
import { useBook, useProfile, useResource } from '@/data/hooks';
import { download, fmtBytes, slug } from '@/lib/format';
import { formatDuration, isDevanagari } from '@/lib/text';
import { createSampleOfType } from '@/lib/sampleTypes';
import { STAGES, type AppLang, type Book, type BookLang, type BookType, type CountryCode, type Profile } from '@/data/types';
import { ConfirmDialog } from './library/ConfirmDialog';
import { CreditsPanel } from './settings/CreditsPanel';
import './settings/settings.css';

const COUNTRIES: CountryCode[] = ['IN', 'US', 'GB', 'CA', 'AE', 'SG', 'AU', 'OTHER'];
const BOOK_LANGS: BookLang[] = ['en', 'hi', 'mr', 'mix'];
type KeepFor = Exclude<Profile['recordingRetention'], 'none'>;
const TYPES: BookType[] = ['fiction', 'nonfiction', 'memoir', 'stories', 'poetry', 'other'];

function Section({ label, desc, children, id }: { label: string; desc?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="st-sec" aria-labelledby={id}>
      <div className="st-sec-text">
        <h3 className="st-label" id={id}>{label}</h3>
        {desc && <p className="st-desc">{desc}</p>}
      </div>
      <div className="st-ctl">{children}</div>
    </section>
  );
}

type GroupKey = 'you' | 'book' | 'credits' | 'voice' | 'privacy' | 'data';
const GROUP_ICONS: Record<GroupKey, IconName> = { you: 'users', book: 'book', credits: 'flag', voice: 'mic', privacy: 'eye', data: 'download' };

/** A calm card for one area of settings, with its own header. */
function Group({ k, children }: { k: GroupKey; children: ReactNode }) {
  const t = useT('settings');
  return (
    <section className={`st-group st-group-${k}`} id={k === 'credits' ? 'credits' : `st-g-${k}`} aria-labelledby={`st-g-${k}-h`}>
      <header className="st-ghead">
        <span className="st-gicon" aria-hidden="true"><Icon name={GROUP_ICONS[k]} size={18} /></span>
        <div className="st-ghead-text">
          <h2 className="st-gtitle" id={`st-g-${k}-h`}>{t(`groups.${k}.t`)}</h2>
          <p className="st-gdesc">{t(`groups.${k}.d`)}</p>
        </div>
      </header>
      <div className="st-gbody">{children}</div>
    </section>
  );
}

/** A text input that saves when the author leaves it or presses Enter. */
function SaveInput({ value, onSave, label, placeholder, deva, full }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; deva?: boolean; full?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v.trim() !== value.trim()) onSave(v.trim()); };
  return (
    <label className={`field${full ? ' full' : ''}`}>
      <span>{label}</span>
      <input className={`input${deva || isDevanagari(v) ? ' deva-book' : ''}`} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

export default function Settings() {
  const t = useT('settings');
  const c = useT('common');
  const { lang, setLang } = useLang();
  const toast = useToast();
  const nav = useNavigate();
  const { data: profile } = useProfile();
  const { data: book } = useBook(profile?.currentBookId);
  const { data: audio } = useResource(() => api.audio.stats(), [], ['audio', 'laps']);
  const [confirm, setConfirm] = useState<'rec' | 'wipe' | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastKeep, setLastKeep] = useState<KeepFor>('30d');
  useEffect(() => { if (profile && profile.recordingRetention !== 'none') setLastKeep(profile.recordingRetention); }, [profile?.recordingRetention]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = async (patch: Partial<Profile>) => { await api.profile.update(patch); toast.show(t('saved')); };
  const saveBook = async (patch: Partial<Book>) => { if (!book) return; await api.books.update(book.id, patch); toast.show(t('saved')); };
  const setAppLang = (l: AppLang) => { setLang(l); api.profile.update({ appLang: l }); };

  const exportAll = async () => {
    const dump = await api.data.exportAll();
    const date = new Date().toISOString().slice(0, 10);
    download(`dictationer-${slug(profile?.name || 'export')}-${date}.json`, JSON.stringify(dump, null, 2), 'application/json');
    toast.show(t('data.exported'));
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const dump = JSON.parse(await f.text());
      await api.data.importAll(dump);
      const p = await api.profile.get();
      if (p.appLang !== lang) setLang(p.appLang);
      toast.show(t('data.imported'));
    } catch { toast.show(t('data.importFailed')); }
  };
  const addSample = async (type: BookType) => {
    setBusy(true);
    try {
      const id = await createSampleOfType(type, lang);
      toast.show(t('data.sampleAdded'), { label: c('actions.open'), onClick: () => nav(`/app/b/${id}`) });
    } finally { setBusy(false); }
  };
  const deleteRecordings = async () => { await api.audio.clearAll(); setConfirm(null); toast.show(t('rec.deleted')); };
  const wipe = async () => { await api.data.wipe(); setConfirm(null); nav('/', { replace: true }); };

  if (!profile) return <div className="wrap" aria-busy="true" />;

  const audioLine = !audio || audio.count === 0 ? t('rec.statsNone')
    : audio.count === 1 ? t('rec.statsOne', { size: fmtBytes(audio.bytes), dur: formatDuration(audio.durationMs) })
    : t('rec.stats', { n: audio.count, size: fmtBytes(audio.bytes), dur: formatDuration(audio.durationMs) });

  const keep = profile.recordingRetention !== 'none';
  const groups: GroupKey[] = book ? ['you', 'book', 'credits', 'voice', 'privacy', 'data'] : ['you', 'credits', 'voice', 'privacy', 'data'];
  const jump = (k: GroupKey) => document.getElementById(k === 'credits' ? 'credits' : `st-g-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="wrap st">
      <header className="st-head">
        <div className="kick">{t('kicker')}</div>
        <h1 className="h1">{t('title')}</h1>
        <p className="lede">{t('sub')}</p>
      </header>

      <div className="st-layout">
        <nav className="st-toc" aria-label={t('contents')}>
          <div className="st-toc-h">{t('contents')}</div>
          <ul>
            {groups.map((k) => (
              <li key={k}><button type="button" onClick={() => jump(k)}><Icon name={GROUP_ICONS[k]} size={15} />{t(`groups.${k}.t`)}</button></li>
            ))}
          </ul>
        </nav>

        <div className="st-groups">
          <Group k="you">
            <Section id="st-lang" label={t('appLang.label')} desc={t('appLang.desc')}>
              <div><LangToggle value={lang} onChange={setAppLang} size="md" /></div>
            </Section>
            <Section id="st-name" label={t('name.label')} desc={t('name.desc')}>
              <div style={{ maxWidth: 420 }}><SaveInput label={t('name.label')} value={profile.name} placeholder={t('name.ph')} onSave={(v) => saveProfile({ name: v })} /></div>
            </Section>
            <Section id="st-country" label={t('country.label')} desc={t('country.desc')}>
              <div className="st-opts" role="group" aria-labelledby="st-country">
                {COUNTRIES.map((k) => (
                  <button key={k} type="button" className="opt" aria-pressed={profile.country === k} onClick={() => saveProfile({ country: k })}>{c(`countries.${k}`)}</button>
                ))}
              </div>
            </Section>
          </Group>

          {book && (
            <Group k="book">
              <Section id="st-book" label={t('book.heading')} desc={<>{t('book.desc')} <Link to={`/app/b/${book.id}`}>{t('book.open')}</Link></>}>
                <div className="st-grid">
                  <SaveInput full label={t('book.title')} value={book.title} placeholder={c('untitled')} onSave={(v) => saveBook({ title: v })} />
                  <SaveInput label={t('book.subtitle')} value={book.subtitle ?? ''} onSave={(v) => saveBook({ subtitle: v || undefined })} />
                  <SaveInput label={t('book.author')} value={book.author} onSave={(v) => saveBook({ author: v })} />
                  <label className="field">
                    <span>{t('book.type')}</span>
                    <select className="select" value={book.type} onChange={(e) => saveBook({ type: e.target.value as BookType })}>
                      {TYPES.map((k) => <option key={k} value={k}>{c(`bookTypes.${k}`)}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>{t('book.stage')}</span>
                    <select className="select" value={book.stage} onChange={(e) => saveBook({ stage: e.target.value as Book['stage'] })}>
                      {STAGES.map((k) => <option key={k} value={k}>{c(`stages.${k}`)}</option>)}
                    </select>
                  </label>
                </div>
              </Section>
              <Section id="st-booklang" label={t('book.lang')} desc={t('book.langDesc')}>
                <div className="st-opts" role="group" aria-labelledby="st-booklang">
                  {BOOK_LANGS.map((k) => (
                    <button key={k} type="button" className="opt" aria-pressed={book.lang === k} onClick={() => saveBook({ lang: k })}>{c(`bookLangs.${k}`)}</button>
                  ))}
                </div>
              </Section>
            </Group>
          )}

          <Group k="voice">
            <Section id="st-speech" label={t('speech.label')} desc={t('speech.desc')}>
              <div className="st-segwrap">
                <Segmented label={t('speech.label')} value={profile.mixedSpeech} onChange={(v) => saveProfile({ mixedSpeech: v })}
                  options={[{ value: 'keep', label: t('speech.keep') }, { value: 'convert', label: t('speech.convert') }]} />
              </div>
              <p className="st-ex book">{profile.mixedSpeech === 'keep' ? t('speech.keepEx') : t('speech.convertEx')}</p>
            </Section>
            <Section id="st-rec" label={t('rec.label')} desc={t('rec.desc')}>
              <div className="st-switchrow">
                <div className="st-switchtext">
                  <span className="st-switchlabel" id="st-rec-keep">{t('rec.keep')}</span>
                  <span className="st-sub">{t('rec.keepDesc')}</span>
                </div>
                <button type="button" role="switch" className="switch" aria-checked={keep} aria-labelledby="st-rec-keep"
                  onClick={() => saveProfile({ recordingRetention: keep ? 'none' : lastKeep })}>
                  <span className="switch-thumb" />
                </button>
              </div>
              {keep && (
                <div className="st-howlong rise">
                  <span className="label" id="st-rec-long">{t('rec.howLong')}</span>
                  <div className="st-segwrap">
                    <Segmented label={t('rec.howLong')} value={profile.recordingRetention as KeepFor} onChange={(v) => { setLastKeep(v); saveProfile({ recordingRetention: v }); }}
                      options={[{ value: '30d', label: t('rec.d30') }, { value: 'forever', label: t('rec.forever') }]} />
                  </div>
                </div>
              )}
              <div className="st-row st-recstats">
                <span className="st-stats"><Icon name="clock" size={14} />{audioLine}</span>
                {!!audio?.count && <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm('rec')}><Icon name="trash" size={15} />{t('rec.deleteAll')}</button>}
              </div>
            </Section>
          </Group>

          <Group k="privacy">
            <div className="st-pledge">
              <span className="st-seal" aria-hidden="true">D<i>.</i></span>
              <div>
                <h3 className="st-pledge-h" id="st-ai">{t('training.label')}</h3>
                <p className="st-trust">{t('training.body')}</p>
              </div>
            </div>
          </Group>

          <Group k="credits">
            <CreditsPanel />
          </Group>

          <Group k="data">
            <Section id="st-data" label={t('data.label')} desc={t('data.desc')}>
              <div className="st-row">
                <button type="button" className="btn btn-primary" onClick={exportAll}><Icon name="download" size={16} />{t('data.export')}</button>
                <label className="btn btn-ghost st-file">
                  <Icon name="file" size={16} />{t('data.import')}
                  <input type="file" accept="application/json,.json" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
            </Section>
            <Section id="st-sample" label={t('data.sample')} desc={t('data.sampleDesc')}>
              <div className="st-row">
                {(['fiction', 'nonfiction', 'memoir'] as BookType[]).map((bt) => (
                  <button key={bt} type="button" className="btn btn-ghost btn-sm" onClick={() => addSample(bt)} disabled={busy}><Icon name="book" size={16} />{c(`bookTypes.${bt}`)}</button>
                ))}
              </div>
            </Section>
            <Section id="st-wipe" label={t('danger')} desc={t('data.wipeDesc')}>
              <div><button type="button" className="btn btn-danger" onClick={() => setConfirm('wipe')}><Icon name="trash" size={16} />{t('data.wipe')}</button></div>
            </Section>
          </Group>
        </div>
      </div>

      <ConfirmDialog open={confirm === 'rec'} title={t('rec.deleteTitle')} body={t('rec.deleteBody')} confirmLabel={t('rec.deleteAll')} onConfirm={deleteRecordings} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm === 'wipe'} title={t('data.wipeTitle')} body={t('data.wipeBody')} typeToConfirm="DELETE" typeLabel={t('data.wipeType')} confirmLabel={t('data.wipeConfirm')} onConfirm={wipe} onClose={() => setConfirm(null)} />
    </div>
  );
}
