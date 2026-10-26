import { useMemo } from 'react';
import { BoxList, TabPage, useBookFont, useBoxFolds, useEntityCollection } from '@/components/kit';
import { useCurrentBook } from '@/app/context';
import { Icon } from '@/components/Icon';
import { fmtNumber } from '@/lib/format';
import { useLang, useT } from '@/i18n';
import { byOrder, timelineMarks, yearIn } from './simple/detect';
import { SpokenAdd } from './simple/SpokenAdd';
import { FoldAll, FoldToggle, firstLine } from './simple/look';
import './simple/simple.css';

export default function Timeline() {
  const t = useT('simple');
  const { lang } = useLang();
  const { book } = useCurrentBook();
  const font = useBookFont();
  const folds = useBoxFolds(`${book?.id ?? ''}.event`);
  const { items } = useEntityCollection('event', { sort: byOrder });
  const { marks, outOfOrder, sameWhen } = useMemo(() => timelineMarks(items), [items]);
  const num = (n: number) => fmtNumber(n, lang);
  const indexOf = useMemo(() => new Map(items.map((e, i) => [e.id, i])), [items]);

  return (
    <TabPage tabId="timeline">
      <div className="sim-scope">
        {items.length > 0 && (
          <div className="sim-tl-sum">
            <p className="sim-tl-line" aria-live="polite">
              <strong>{items.length === 1 ? t('timeline.oneEvent') : t('timeline.summary', { n: num(items.length) })}</strong>
              <span className="sim-tl-dot" aria-hidden="true" />
              {outOfOrder > 0 ? <span className="sim-tl-flag">{t('timeline.outOfOrder', { n: num(outOfOrder) })}</span> : <span>{t('timeline.allClear')}</span>}
              {sameWhen > 0 && <><span className="sim-tl-dot" aria-hidden="true" /><span className="sim-tl-flag">{t('timeline.sameWhen', { n: num(sameWhen) })}</span></>}
            </p>
            <div className="sim-listbar">
              <p className="faint sim-tl-howto">{t('timeline.howto')}</p>
              <FoldAll folds={folds} ids={items.map((e) => e.id)} />
            </div>
          </div>
        )}

        <BoxList
          kind="event"
          columns={1}
          variant="rail"
          folds={folds}
          showDescLabel
          titleLabel={t('timeline.titleLabel')}
          titlePlaceholder={t('timeline.titlePh')}
          descLabel={t('timeline.descLabel')}
          descPlaceholder={t('timeline.descPh')}
          addLabel={t('timeline.add')}
          emptyHint={t('timeline.empty')}
          renderBox={(e, p) => {
            const m = marks.get(e.id);
            const hasMark = !!(m && (m.order || m.same?.length));
            const i = indexOf.get(e.id) ?? p.index;
            const prev = i > 0 ? items[i - 1] : undefined;
            const y = yearIn(e.name), py = prev ? yearIn(prev.name) : null;
            const gap = y !== null && py !== null && y > py ? y - py : 0;
            return (
              <>
                {gap > 0 && (
                  <div className={`sim-ev-gap ${gap >= 10 ? 'is-era' : ''}`}>
                    <span>{gap === 1 ? t('timeline.gapOne') : t('timeline.gap', { n: num(gap) })}</span>
                  </div>
                )}
                <div className={`sim-ev ${hasMark ? 'has-mark' : ''} ${p.folded ? 'is-folded' : ''}`}>
                  <div className="sim-ev-when">{p.title}</div>
                  <div className="sim-ev-rail" aria-hidden="true"><span className="sim-ev-node">{num(p.index + 1)}</span></div>
                  <div className="sim-ev-card">
                    <div className="sim-ev-cardtop">
                      {p.folded && <span className={`sim-ev-peek ${font}`}>{firstLine(e.fields.description ?? '', 90) || <span className="faint">{t('timeline.descLabel')}</span>}</span>}
                      <div className="sim-cardtools">
                        {p.tools}
                        <FoldToggle folded={p.folded} onClick={p.toggleFold} name={e.name} controls={`ev-body-${e.id}`} />
                      </div>
                    </div>
                    {!p.folded && <div id={`ev-body-${e.id}`} className="sim-ev-body">{p.desc}</div>}
                    {hasMark && (
                      <ul className="sim-ev-marks">
                        {m!.order && (
                          <li className="sim-ev-mark">
                            {t('timeline.mark.order')}
                            <span className="sim-mark-detail"> · {t('timeline.mark.orderDetail', { n: m!.order.otherN, year: m!.order.otherYear })}</span>
                          </li>
                        )}
                        {m!.same?.map((n) => <li key={n} className="sim-ev-mark">{t('timeline.mark.same', { n })}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
                {p.index < p.count - 1 && (
                  <button type="button" className="sim-ev-insert" onClick={p.insertAfter} aria-label={t('timeline.insert', { n: p.index + 1 })}>
                    <Icon name="plus" size={14} />
                    <span className="sim-ev-insert-label" aria-hidden="true">{t('timeline.insertShort')}</span>
                  </button>
                )}
              </>
            );
          }}
          renderAdd={({ add, empty, loading }) => loading ? null : (
            <div className={`sim-ev-end ${empty ? 'is-first' : ''}`}>
              {!empty && <div className="sim-ev-rail" aria-hidden="true"><span className="sim-ev-node is-next"><Icon name="plus" size={14} /></span></div>}
              <SpokenAdd
                add={add}
                mode="lead"
                idBase="sim-add-ev"
                className="sim-add-ev"
                slot={(when) => <span className="sim-ev-slot display">{when.trim() || (empty ? t('timeline.firstSlot') : t('timeline.nextSlot'))}</span>}
                heading={empty ? t('timeline.compose.headingFirst') : t('timeline.compose.heading')}
                example={t('timeline.compose.eg')}
                sayHint={t('timeline.compose.hint')}
                titleLabel={t('timeline.compose.titleLabel')}
                titlePlaceholder={t('timeline.titlePh')}
                descLabel={t('timeline.descLabel')}
                descPlaceholder={t('timeline.descPh')}
                keepLabel={() => t('timeline.compose.keep')}
                empty={empty ? { art: 'timeline', warm: t('timeline.compose.warm') } : undefined}
              />
            </div>
          )}
        />
      </div>
    </TabPage>
  );
}
