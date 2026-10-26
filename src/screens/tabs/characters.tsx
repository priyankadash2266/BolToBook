import { useMemo, useState } from 'react';
import { AppearsStrip, BoxList, TabPage, VoiceTextarea, useBoxFolds, useEntityCollection, type BoxParts } from '@/components/kit';
import { Icon } from '@/components/Icon';
import { useCurrentBook } from '@/app/context';
import type { Entity } from '@/data/types';
import { fmtNumber } from '@/lib/format';
import { useLang, useT } from '@/i18n';
import { byOrder, findConnections, type Connection } from './simple/detect';
import { ConnectionsMap } from './simple/ConnectionsMap';
import { SpokenAdd } from './simple/SpokenAdd';
import { FoldAll, FoldToggle, Medallion, firstLine, focusBox, hueStyle } from './simple/look';
import './simple/simple.css';

export default function Characters() {
  const t = useT('simple');
  const { lang } = useLang();
  const { book, chapters } = useCurrentBook();
  const folds = useBoxFolds(`${book?.id ?? ''}.character`);
  const { items } = useEntityCollection('character', { sort: byOrder });
  const connections = useMemo(() => findConnections(items, chapters), [items, chapters]);
  const byId = useMemo(() => new Map(items.map((c) => [c.id, c])), [items]);
  const connectedCount = items.filter((c) => c.name.trim() && connections.get(c.id)?.length).length;
  const named = items.filter((c) => c.name.trim());

  return (
    <TabPage tabId="characters">
      <div className="sim-scope">
        {named.length > 0 && (
          <nav className="sim-cast-strip" aria-label={t('characters.cast.aria')}>
            <div className="sim-listbar">
              <span className="sim-kick">{t('characters.cast.kick', { n: fmtNumber(named.length, lang) })}</span>
              <FoldAll folds={folds} ids={items.map((c) => c.id)} />
            </div>
            <ul className="sim-cast-row">
              {named.map((c) => (
                <li key={c.id}>
                  <button type="button" className="sim-cast-pick" onClick={() => focusBox(c.id)}>
                    <Medallion name={c.name} size={44} />
                    <span className="sim-cast-pick-name">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {connectedCount >= 3 && (
          <section className="sim-constellation" aria-labelledby="sim-map-title">
            <div className="sim-constellation-head">
              <h2 id="sim-map-title" className="kit-section-title">{t('characters.map.title')}</h2>
              <p className="kit-section-hint">{t('characters.map.hint')}</p>
            </div>
            <ConnectionsMap chars={items} connections={connections} />
          </section>
        )}

        <BoxList
          kind="character"
          columns={2}
          variant="cast"
          folds={folds}
          showDescLabel
          descRows={4}
          titleLabel={t('characters.titleLabel')}
          titlePlaceholder={t('characters.titlePh')}
          descLabel={t('characters.descLabel')}
          descPlaceholder={t('characters.descPh')}
          addLabel={t('characters.add')}
          emptyHint={t('characters.empty')}
          renderBox={(e, p) => <CastCard e={e} p={p} links={(connections.get(e.id) ?? []).filter((l) => byId.get(l.id)?.name.trim())} byId={byId} />}
          renderAdd={({ add, empty, loading }) => loading ? null : (
            <SpokenAdd
              add={add}
              idBase="sim-add-cast"
              className="sim-add-cast"
              slot={(name) => name.trim()
                ? <Medallion name={name} size={56} className="is-live" />
                : <span className="sim-med sim-med-add" aria-hidden="true"><Icon name="plus" size={22} /></span>}
              heading={t('characters.compose.heading')}
              example={t('characters.compose.eg')}
              sayHint={t('characters.compose.hint')}
              titleLabel={t('characters.titleLabel')}
              titlePlaceholder={t('characters.titlePh')}
              descLabel={t('characters.compose.descLabel')}
              descPlaceholder={t('characters.descPh')}
              keepLabel={(n) => n ? t('characters.compose.keep', { name: n }) : t('characters.compose.keepEmpty')}
              empty={empty ? { art: 'characters', warm: t('characters.compose.warm') } : undefined}
            />
          )}
        />
      </div>
    </TabPage>
  );
}

function CastCard({ e, p, links, byId }: { e: Entity; p: BoxParts; links: Connection[]; byId: Map<string, Entity> }) {
  const t = useT('simple');
  const { chapters } = useCurrentBook();
  const notes = e.fields.notes ?? '';
  const [open, setOpen] = useState(!!notes.trim());
  const desc = e.fields.description ?? '';
  const epi = firstLine(desc);
  const notesId = `cast-notes-${e.id}`;
  const bodyId = `cast-body-${e.id}`;

  return (
    <div className={`sim-cast ${p.folded ? 'is-folded' : ''}`} style={hueStyle(e.name, e.id)}>
      <div className="sim-cast-top" aria-hidden="true" />
      <div className="sim-cast-head">
        <Medallion name={e.name} fallback={e.id} size={68} className="sim-cast-med" />
        <div className="sim-cast-id">
          <span className="sim-cast-no">{t('characters.no', { n: p.index + 1 })}</span>
          {p.title}
          {p.folded && epi && <p className="sim-cast-epi">{epi}</p>}
        </div>
        <div className="sim-cardtools">
          {p.tools}
          <FoldToggle folded={p.folded} onClick={p.toggleFold} name={e.name} controls={bodyId} />
        </div>
      </div>

      {!p.folded && <div id={bodyId} className="sim-cast-body">
        {p.desc}

        <div className="sim-cast-notes">
          <button type="button" className="sim-disclose" aria-expanded={open} aria-controls={notesId} onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? 'up' : 'down'} size={14} />
            {t('characters.notes')}
            {!open && notes.trim() && <span className="sim-disclose-dot" aria-hidden="true" />}
          </button>
          {open && (
            <div id={notesId} className="sim-ruled">
              <VoiceTextarea label={t('characters.notes')} hideLabel id={`bx-n-${e.id}`} value={notes} onChange={(v) => p.update({ fields: { notes: v } })} placeholder={t('characters.notesPh')} rows={2} />
            </div>
          )}
        </div>

        {chapters.length > 0 && e.name.trim() && (
          <div className="sim-ribbon">
            <AppearsStrip name={e.name} />
          </div>
        )}

        {links.length > 0 && (
          <div className="sim-conn">
            <span className="sim-kick">{t('characters.conn.label')}</span>
            <ul className="sim-conn-list">
              {links.map((l) => {
                const other = byId.get(l.id)!;
                const why = l.scenes >= 2 ? t('characters.conn.scenes', { n: l.scenes }) : t('characters.conn.named');
                return (
                  <li key={l.id}>
                    <button type="button" className="sim-conn-chip" onClick={() => focusBox(l.id)} title={why}>
                      <Medallion name={other.name} size={24} />
                      <span className="sim-conn-name">{other.name}</span>
                      <span className="sim-conn-why">{why}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>}
    </div>
  );
}
