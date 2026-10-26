import { AppearsStrip, BoxList, TabPage, useBoxFolds, useEntityCollection } from '@/components/kit';
import { Icon } from '@/components/Icon';
import { useCurrentBook } from '@/app/context';
import { fmtNumber } from '@/lib/format';
import { useLang, useT } from '@/i18n';
import { byOrder } from './simple/detect';
import { SpokenAdd } from './simple/SpokenAdd';
import { FoldAll, FoldToggle, PlaceDot, PlaceMotif, firstLine, focusBox, hueStyle } from './simple/look';
import './simple/simple.css';

export default function World() {
  const t = useT('simple');
  const { lang } = useLang();
  const { book, chapters } = useCurrentBook();
  const folds = useBoxFolds(`${book?.id ?? ''}.place`);
  const { items } = useEntityCollection('place', { sort: byOrder });
  const named = items.filter((p) => p.name.trim());

  return (
    <TabPage tabId="world">
      <div className="sim-scope">
        {items.length > 0 && (
          <nav className="sim-atlas" aria-label={t('world.atlas.aria')}>
            <div className="sim-listbar">
              <span className="sim-kick">{t('world.atlas.kick', { n: fmtNumber(named.length, lang) })}</span>
              <FoldAll folds={folds} ids={items.map((p) => p.id)} />
            </div>
            {named.length >= 2 && (
              <ul className="sim-atlas-row">
                {named.map((p, i) => (
                  <li key={p.id}>
                    {i > 0 && <span className="sim-atlas-sep" aria-hidden="true" />}
                    <button type="button" className="sim-atlas-chip" onClick={() => focusBox(p.id)}>
                      <PlaceDot name={p.name} />
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        )}

        <BoxList
          kind="place"
          columns={2}
          variant="place"
          folds={folds}
          showDescLabel
          descRows={4}
          titleLabel={t('world.titleLabel')}
          titlePlaceholder={t('world.titlePh')}
          descLabel={t('world.descKick')}
          descPlaceholder={t('world.descPh')}
          addLabel={t('world.add')}
          emptyHint={t('world.empty')}
          renderBox={(e, p) => {
            const bodyId = `place-body-${e.id}`;
            const epi = firstLine(e.fields.description ?? '');
            return (
              <div className={`sim-place ${p.folded ? 'is-folded' : ''}`} style={hueStyle(e.name, e.id)}>
                <div className="sim-place-head"><PlaceMotif name={e.name} fallback={e.id} /></div>
                <div className="sim-place-top">
                  <div className="sim-place-id">
                    <span className="sim-place-no">{t('world.no', { n: p.index + 1 })}</span>
                    {p.title}
                    {p.folded && epi && <p className="sim-cast-epi">{epi}</p>}
                  </div>
                  <div className="sim-cardtools">
                    {p.tools}
                    <FoldToggle folded={p.folded} onClick={p.toggleFold} name={e.name} controls={bodyId} />
                  </div>
                </div>
                {!p.folded && (
                  <div id={bodyId} className="sim-place-body">
                    {p.desc}
                    {chapters.length > 0 && e.name.trim() && <div className="sim-ribbon"><AppearsStrip name={e.name} /></div>}
                  </div>
                )}
              </div>
            );
          }}
          renderAdd={({ add, empty, loading }) => loading ? null : (
            <SpokenAdd
              add={add}
              idBase="sim-add-place"
              className="sim-add-place"
              slot={(name) => (
                <span className="sim-compass" style={hueStyle(name || '?')} aria-hidden="true">
                  {name.trim() ? <PlaceMotif name={name} className="is-mini" /> : <Icon name="globe" size={22} />}
                </span>
              )}
              heading={t('world.compose.heading')}
              example={t('world.compose.eg')}
              sayHint={t('world.compose.hint')}
              titleLabel={t('world.titleLabel')}
              titlePlaceholder={t('world.titlePh')}
              descLabel={t('world.compose.descLabel')}
              descPlaceholder={t('world.descPh')}
              keepLabel={(n) => n ? t('world.compose.keep', { name: n }) : t('world.compose.keepEmpty')}
              empty={empty ? { art: 'world', warm: t('world.compose.warm') } : undefined}
            />
          )}
        />
      </div>
    </TabPage>
  );
}
