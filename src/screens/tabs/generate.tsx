import { useManuscript } from '@/data/hooks';
import {BookIntent} from '@/components/BookIntent';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TabPage, useEntityCollection } from '@/components/kit';
import { Segmented } from '@/components/Segmented';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { useCharge, useCost } from '@/components/credits';
import { useCurrentBook } from '@/app/context';
import { api } from '@/data/api';
import type { Book, CountryCode, Entity, FormatSpec } from '@/data/types';
import { useLang, useT } from '@/i18n';
import { fmtNumber } from '@/lib/format';
import { bookIsDeva, resolveFormat } from '@/lib/paginate';
import { bookChapters } from '@/lib/exporters';
import { printLabels } from './finish/printLabels';
import { nextNumber } from './finish/editions';
import { FormatPanel } from './finish/FormatPanel';
import { DesignRail, useVariantNames } from './finish/Chooser';
import { LivePage } from './finish/LivePage';
import { MakeConfirm, useConfirmedExport, type MakeItem } from './finish/Confirm';
import { Shelf } from './finish/Shelf';
import { Previewer } from './finish/Previewer';
import { Compare } from './finish/Compare';
import { dismissJob, startPreviews, usePreviewJob } from './finish/previewJobs';
import { useExport } from './finish/useExport';
import {
  SIZE_IDS, STYLE_IDS, comboKey, snapChaptersOf, specFor, specPrint, stalenessOf, textPrint, variantOf,
  type SizeId, type StyleId, type Variant,
} from './finish/variants';
import './finish/finish.css';

type Region = 'IN' | 'US' | 'GB' | 'OTHER';
const regionOf = (c?: CountryCode): Region => (c === 'IN' || c === 'US' || c === 'GB' ? c : 'OTHER');
const newestFirst = (a: Entity, b: Entity) => b.createdAt.localeCompare(a.createdAt);

function readPick<T extends string>(key: string, allowed: T[], fallback: T[]): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as T[] | null;
    if (Array.isArray(v)) { const ok = allowed.filter((x) => v.includes(x)); if (ok.length) return ok; }
  } catch { /* first visit */ }
  return fallback;
}
const writePick = (key: string, v: string[]) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* not kept */ } };

export default function Generate() {
  const t = useT('finish');
  const tc = useT('common');
  const { lang } = useLang();
  const toast = useToast();
  const charge = useCharge();
  const runLock=useRef(false);
  const [starting,setStarting]=useState(false);
  const { book, chapters: savedChapters, profile } = useCurrentBook();
  const {data: manuscript}=useManuscript(book?.id);
  const chapters=useMemo(()=>manuscript?.content.trim()?[...savedChapters,{...manuscript,role:undefined,title:manuscript.title||'Manuscript',order:Math.max(0,...savedChapters.map(c=>c.order))+1}]:savedChapters,[savedChapters,manuscript]);
  const editions = useEntityCollection('edition', { sort: newestFirst });
  const [params, setParams] = useSearchParams();
  const openId = params.get('v');
  const cmp = (params.get('cmp') ?? '').split(',').filter(Boolean);
  const [sizes, setSizes] = useState<SizeId[]>([]);
  const [styles, setStyles] = useState<StyleId[]>([]);
  const [showSize, setShowSize] = useState<SizeId>('5.5x8.5');
  const [showStyle, setShowStyle] = useState<StyleId>('classic');
  const [peek, setPeek] = useState<{ size?: SizeId; style?: StyleId } | null>(null);
  const [picking, setPicking] = useState<string[]>([]);
  const [reverting, setReverting] = useState<Variant | null>(null);
  const [mineOpen, setMineOpen] = useState(false);
  const [asking, setAsking] = useState<{ items: MakeItem[]; skipped: MakeItem[]; then?: () => void } | null>(null);
  const job = usePreviewJob(book?.id);
  const { label, sizeName, styleName } = useVariantNames();

  useEffect(() => {
    if (!book) return;
    const sz = readPick(`gn-sizes-${book.id}`, SIZE_IDS, [resolveFormat(book).trim]);
    const st = readPick(`gn-styles-${book.id}`, STYLE_IDS, ['classic']);
    setSizes(sz);
    setStyles(st);
    setShowSize(readPick(`gn-show-size-${book.id}`, SIZE_IDS, [sz[0]])[0]);
    setShowStyle(readPick(`gn-show-style-${book.id}`, STYLE_IDS, [st[0]])[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id]);
  const pickSizes = (s: SizeId[]) => { setSizes(s); if (book) writePick(`gn-sizes-${book.id}`, s); };
  const pickStyles = (s: StyleId[]) => { setStyles(s); if (book) writePick(`gn-styles-${book.id}`, s); };
  const showSizeNow = (s: SizeId) => { setShowSize(s); setPeek(null); if (book) writePick(`gn-show-size-${book.id}`, [s]); };
  const showStyleNow = (s: StyleId) => { setShowStyle(s); setPeek(null); if (book) writePick(`gn-show-style-${book.id}`, [s]); };

  const variants = useMemo(() => (book ? editions.items.map((e) => variantOf(e, book)).filter((v): v is Variant => !!v) : []), [editions.items, book]);
  const labels = useMemo(() => (book ? printLabels(book, profile?.country) : undefined), [book, profile?.country]);
  const textNow = useMemo(() => (book ? textPrint(snapChaptersOf(chapters), book) : ''), [book, chapters]);
  const staleCache = useMemo(() => new Map<string, ReturnType<typeof stalenessOf>>(), [book, chapters]); // eslint-disable-line react-hooks/exhaustive-deps
  const staleOf = (v: Variant) => {
    let s = staleCache.get(v.id);
    if (!s && book) { s = stalenessOf(v, book, chapters); staleCache.set(v.id, s); }
    return s ?? { layout: false, text: false };
  };

  /** Size × style cells already kept with this exact text and layout: nothing new to make. */
  const kept = useMemo(() => {
    const out = new Set<string>();
    if (!book) return out;
    const prints = new Set(variants.filter((v) => v.text === textNow).map((v) => specPrint(v.spec)));
    for (const s of SIZE_IDS) for (const y of STYLE_IDS) if (prints.has(specPrint(specFor(s, y, book)))) out.add(comboKey(s, y));
    return out;
  }, [variants, book, textNow]);

  const exportVariant = useExport(book as Book, labels as NonNullable<typeof labels>);
  const exp = useConfirmedExport(exportVariant);

  if (!book || !labels) return <TabPage tabId="generate"><p className="muted">{tc('loading')}</p></TabPage>;

  const tab: 'design' | 'previews' = params.get('tab') === 'previews' ? 'previews' : 'design';
  const empty = bookChapters(chapters).length === 0;
  const words = bookChapters(chapters).reduce((s, c) => s + c.wordCount, 0);
  const open = openId ? variants.find((v) => v.id === openId) : undefined;
  const pair = cmp.length === 2 ? cmp.map((id) => variants.find((v) => v.id === id)).filter((v): v is Variant => !!v) : [];
  const mine = resolveFormat(book);

  const go = (next: { v?: string; cmp?: string[]; tab?: 'design' | 'previews' }) => {
    const p = new URLSearchParams(params);
    p.delete('v'); p.delete('cmp');
    if (next.tab) { if (next.tab === 'previews') p.set('tab', 'previews'); else p.delete('tab'); }
    if (next.v) p.set('v', next.v);
    if (next.cmp?.length === 2) p.set('cmp', next.cmp.join(','));
    setParams(p);
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.querySelector('.app-main')?.scrollTo({ top: 0, behavior: 'auto' });
  };

  /* ---- what "Make previews" would make ---- */
  const all = sizes.flatMap((s) => styles.map((y) => ({ size: s, style: y })));
  const fresh = all.filter((c) => !kept.has(comboKey(c.size, c.style)));
  const skipped = all.filter((c) => kept.has(comboKey(c.size, c.style)));

  /** Charges and starts the job. Only called from the confirmation. */
  const run = async (items: MakeItem[], specOf: (c: MakeItem) => FormatSpec) => {
    if (!items.length || runLock.current || job?.running) return undefined;
    runLock.current=true;setStarting(true);
    try {
    const ok = await charge({ kind: 'preview', units: items.length, bookId: book.id, note: t('pv.notePreviews', { n: items.length, title: book.title || tc('untitled') }) });
    if (!ok) return undefined;
    const saved=await api.chapters.list(book.id);
    const draft=await api.chapters.draft(book.id);
    const latest=[...saved,...(draft.content.trim()?[{...draft,role:undefined,title:draft.title||'Manuscript',order:Math.max(0,...saved.map(c=>c.order))+1}]:[])].sort((a,b)=>a.order-b.order);
    const result=await startPreviews({
      book, chapters: latest, labels, firstN: nextNumber(editions.items),
      combos: items.map((c) => ({ combo: { size: c.size, style: c.style, key: comboKey(c.size, c.style) }, spec: specOf(c), label: label(c.size, c.style) })),
    });
    const failed=result?.items.filter(i=>!i.variantId).length??items.length;
    if(failed){const prices=await api.billing.prices();await api.billing.topUp(prices.preview*failed,'Unsuccessful preview — beta credits returned');}
    return result;
    }catch{toast.show(t('failed'));return undefined;}finally{runLock.current=false;setStarting(false);}
  };

  const confirmMake = () => {
    const a = asking;
    setAsking(null);
    if (!a) return;
    if (a.then) { a.then(); return; }
    go({ tab: 'previews' });
    void run(a.items, (c) => specFor(c.size, c.style, book));
  };

  /** From an open preview: a fresh one of the same size and style, with the book as it is now. */
  const askFresh = (v: Variant, spec: FormatSpec) => setAsking({
    items: [{ size: v.size, style: v.style }], skipped: [],
    then: async () => {
      const j = await run([{ size: v.size, style: v.style }], () => spec);
      const id = j?.items[0]?.variantId;
      if (id) { go({ v: id }); toast.show(t('pv.freshDone', { n: 1 })); }
    },
  });

  const remove = (v: Variant) => {
    const e = editions.items.find((x) => x.id === v.id);
    if (!e) return;
    if (openId === v.id) go({});
    editions.remove(e);
  };

  const revert = async (s: Variant) => {
    try {
      const summary = t('gen.revert.summary', { label: `No. ${s.n} · ${s.label}` });
      const current = [...(await api.chapters.list(book.id))].sort((a, b) => a.order - b.order);
      const orderIds: string[] = [];
      for (const c of s.chapters) {
        const cur = current.find((x) => x.id === c.id);
        if (cur) {
          if (cur.content !== c.content || cur.title !== c.title) await api.chapters.update(cur.id, { content: c.content, title: c.title }, { source: 'restore', summary });
          orderIds.push(cur.id);
        } else {
          const nc = await api.chapters.create(book.id, { title: c.title, content: c.content });
          orderIds.push(nc.id);
        }
      }
      const rest = current.filter((x) => !s.chapters.some((c) => c.id === x.id)).map((x) => x.id);
      await api.chapters.reorder(book.id, [...orderIds, ...rest]);
      await api.books.update(book.id, { format: s.spec, ...(s.cover ? { cover: s.cover } : {}) });
      toast.show(t('gen.revert.done'));
      go({});
    } catch {
      toast.show(t('failed'));
    } finally {
      setReverting(null);
    }
  };

  const setDetail = <K extends keyof FormatSpec>(k: K, val: FormatSpec[K]) => {
    api.books.update(book.id, { format: { ...mine, [k]: val } }).catch(() => toast.show(t('failed')));
  };

  /* ---- the sample page ---- */
  const vSize = peek?.size ?? showSize;
  const vStyle = peek?.style ?? showStyle;
  const liveSpec = specFor(vSize, vStyle, book);
  const running = starting || !!job?.running;
  const pendingN = job ? job.items.filter((i) => i.status !== 'done').length : 0;
  const n = fresh.length;
  const summary = all.length === 0 ? t('pv2.sumNone')
    : `${sizes.map(sizeName).join(', ')} × ${styles.map(styleName).join(', ')}`;
  const note = empty ? t('pv.sumEmpty') : all.length > 0 && n === 0 ? t('pv.sumAllKept') : skipped.length ? t('pv.sumSkip', { n: fmtNumber(skipped.length, lang) }) : running ? t('pv2.busy') : t('pv2.costNote');

  const designTab = (
    <div className="gn-design" role="tabpanel" id="gn-panel-design" aria-labelledby="gn-tab-design">
      <BookIntent/>
      <div className="gn-work">
        <DesignRail deva={bookIsDeva(book)} mine={mine} sizes={sizes} styles={styles} onSizes={pickSizes} onStyles={pickStyles}
          showSize={showSize} showStyle={showStyle} onShowSize={showSizeNow} onShowStyle={showStyleNow} onPeek={setPeek}
          onEditMine={() => setMineOpen(true)} onDetail={setDetail} />
        <section className="gn-stagecard" aria-label={t('pv2.liveLabel')}>
          <header className="gn-stage-head">
            <span className="gn-rail-kick">{t('pv2.liveKick')}</span>
            <span className="gn-stage-free">{t('pv2.free')}</span>
          </header>
          <LivePage book={book} chapters={chapters} spec={liveSpec} labels={labels} fadeKey={`${vSize}|${vStyle}`} />
          <p className="gn-caption" aria-live="polite">
            <strong>{label(vSize, vStyle)}</strong>
            <span> — {t(vSize === 'ebook' ? 'pv2.captionEbook' : 'pv2.caption')}</span>
          </p>
        </section>
      </div>

      <div className="gn-makebar" aria-live="polite">
        <div className="gn-makebar-text">
          <p className="gn-makebar-sum">
            {all.length > 0 && <strong>{t(all.length === 1 ? 'pv.preview1' : 'pv.previewN', { n: fmtNumber(all.length, lang) })}</strong>}
            <span className="gn-makebar-what">{summary}</span>
          </p>
          <p className="gn-makebar-note">{note}</p>
        </div>
        <MakeButton n={n} disabled={n === 0 || running || empty} onClick={() => setAsking({ items: fresh, skipped })} />
      </div>
    </div>
  );

  return (
    <TabPage tabId="generate" wide
      title={open ? label(open.size, open.style) : pair.length === 2 ? t('pv.compareTitle') : undefined}
      purpose={open ? t('pv.openPurpose', { n: open.n }) : pair.length === 2 ? t('pv.compareHint') : t('pv2.purpose')}>
      {open ? (
        <Previewer key={open.id} v={open} book={book} chapters={chapters} labels={labels} country={profile?.country}
          onBack={() => go({ tab: 'previews' })} onFresh={(spec) => askFresh(open, spec)} freshBusy={running} onRevert={() => setReverting(open)} onDelete={() => remove(open)}
          onExport={() => exp.ask(open)} exporting={exp.busy === open.id} />
      ) : pair.length === 2 ? (
        <Compare a={pair[0]} b={pair[1]} book={book} labels={labels} onBack={() => go({ tab: 'previews' })} onOpen={(v) => go({ v: v.id })} />
      ) : (
        <div className="gn">
          <div className="gn-tabs" role="tablist" aria-label={t('pv2.tabsLabel')}>
            <button type="button" role="tab" id="gn-tab-design" aria-selected={tab === 'design'} aria-controls="gn-panel-design"
              className={`gn-tab${tab === 'design' ? ' is-on' : ''}`} onClick={() => go({ tab: 'design' })}>
              <Icon name="layout" size={17} />{t('pv2.tabDesign')}
            </button>
            <button type="button" role="tab" id="gn-tab-previews" aria-selected={tab === 'previews'} aria-controls="gn-panel-previews"
              className={`gn-tab${tab === 'previews' ? ' is-on' : ''}`} onClick={() => go({ tab: 'previews' })}>
              <Icon name="book" size={17} />{t('pv2.tabPreviews')}
              {running ? <span className="gn-tab-busy" aria-label={t('pv.making')}><span className="paid-spin" aria-hidden="true" />{fmtNumber(pendingN, lang)}</span>
                : variants.length > 0 && <span className="gn-tab-n">{fmtNumber(variants.length, lang)}</span>}
            </button>
          </div>
          {tab === 'design' ? designTab : (
            <div role="tabpanel" id="gn-panel-previews" aria-labelledby="gn-tab-previews">
              <Shelf book={book} variants={variants} staleOf={staleOf} job={job} onOpen={(v) => go({ v: v.id })} onDelete={remove}
                onRevert={setReverting} onExport={exp.ask} exporting={exp.busy} onDismissJob={() => dismissJob(book.id)} onDesign={() => go({ tab: 'design' })}
                compare={picking} onCompare={(ids) => { setPicking(ids); if (ids.length === 2) { setPicking([]); go({ cmp: ids }); } }} />
            </div>
          )}
          <PublishNote book={book} country={profile?.country} />
        </div>
      )}

      <MakeConfirm open={!!asking} items={asking?.items ?? []} skipped={asking?.skipped ?? []} words={words} onCancel={() => setAsking(null)} onConfirm={confirmMake} />
      {exp.modal}

      <Modal open={!!reverting} onClose={() => setReverting(null)} title={reverting ? t('gen.revert.title', { label: `No. ${reverting.n}` }) : ''} width={520}>
        {reverting && (
          <div className="gn-modal">
            <p>{t('gen.revert.body')}</p>
            <p className="muted">{t('gen.revert.added')}</p>
            <div className="gn-modal-act">
              <button type="button" className="btn btn-ghost" onClick={() => setReverting(null)}>{t('gen.a.cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={() => revert(reverting)} data-autofocus><Icon name="undo" size={16} />{t('gen.revert.confirm')}</button>
            </div>
          </div>
        )}
      </Modal>

      <MineModal open={mineOpen} onClose={() => setMineOpen(false)} book={book} />
    </TabPage>
  );
}

/** The primary action: shows the cost, but only asks (a confirmation opens) — nothing is charged here. */
function MakeButton({ n, disabled, onClick }: { n: number; disabled: boolean; onClick: () => void }) {
  const t = useT('finish');
  const tc = useT('common');
  const { lang } = useLang();
  const { cost } = useCost('preview', Math.max(1, n));
  return (
    <button type="button" className="btn btn-primary paid-btn gn-make" onClick={onClick} disabled={disabled}>
      <Icon name="file" size={17} />
      <span>{n > 0 ? t(n === 1 ? 'pv.make1' : 'pv.makeN', { n: fmtNumber(n, lang) }) : t('pv.makeNone')}</span>
      {n > 0 && cost !== undefined && <span className="paid-cost">{tc('credits.cost', { n: fmtNumber(cost, lang) })}</span>}
    </button>
  );
}

/** "My current settings": the book's own typeface, size, margins and chapter opening. */
function MineModal({ open, onClose, book }: { open: boolean; onClose: () => void; book: Book }) {
  const t = useT('finish');
  const [spec, setSpec] = useState<FormatSpec>(() => resolveFormat(book));
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  useEffect(() => { if (open) { setSpec(resolveFormat(book)); setSaved('idle'); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof FormatSpec>(k: K, v: FormatSpec[K]) => {
    const next = { ...spec, [k]: v };
    setSpec(next);
    setSaved('saving');
    api.books.update(book.id, { format: next }).then(() => setSaved('saved')).catch(() => setSaved('idle'));
  };
  return (
    <Modal open={open} onClose={onClose} title={t('pv.mineTitle')} width={460}>
      <div className="gn-mine">
        <FormatPanel spec={spec} deva={bookIsDeva(book)} saved={saved} onFormat={set} onBlock={() => {}} onResetAll={() => {}} blankSpots={[]}
          sections={['face', 'size', 'margins', 'opening']} title={t('pv.style.mine.name')} hint={t('pv.mineHint')} />
        <div className="gn-modal-act"><button type="button" className="btn btn-primary" onClick={onClose}>{t('pv.done')}</button></div>
      </div>
    </Modal>
  );
}

function PublishNote({ book, country }: { book: Book; country?: CountryCode }) {
  const t = useT('finish');
  const [region, setRegion] = useState<Region>(regionOf(book.country !== 'OTHER' ? book.country : country));
  const keys = ['isbn', 'copyright', ...(region === 'OTHER' ? [] : ['deposit']), 'platforms'];
  return (
    <details className="gn-publish">
      <summary><Icon name="flag" size={16} /><span>{t('gen.publish.title')}</span><span className="gn-publish-sub">{t('gen.publish.sub')}</span><Icon name="down" size={16} className="gn-publish-chev" /></summary>
      <div className="gn-publish-body">
        <div className="gn-field">
          <span className="gn-field-l" aria-hidden="true">{t('gen.publish.country')}</span>
          <Segmented size="sm" label={t('gen.publish.country')} value={region} onChange={setRegion}
            options={(['IN', 'US', 'GB', 'OTHER'] as Region[]).map((r) => ({ value: r, label: t(`region.short.${r}`) }))} />
        </div>
        <ol className="gn-publish-list">
          {keys.map((k, i) => (
            <li key={k}>
              <span className="gn-publish-n" aria-hidden="true">{i + 1}</span>
              <div>
                <strong>{t(`region.${region}.${k}.t`)}</strong>
                <p>{t(`region.${region}.${k}.d`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="gn-hint">{t('gen.publish.disclaimer')}</p>
      </div>
    </details>
  );
}

