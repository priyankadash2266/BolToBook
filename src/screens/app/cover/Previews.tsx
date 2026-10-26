import { CoverArt, COVER_FONTS, MOODS } from '@/components/CoverArt';
import type { CoverSpec } from '@/data/types';
import { useT } from '@/i18n';

export interface CoverText { title: string; subtitle?: string; author: string; deva: boolean }

/** Paperback or hardcover in 3D: a front face and a spine face in CSS perspective. */
export function Book3D({ text, spec, width, spinePx, hard = false, angle = 26 }: { text: CoverText; spec: CoverSpec; width: number; spinePx: number; hard?: boolean; angle?: number }) {
  const m = MOODS[spec.mood];
  const board = hard ? Math.max(4, Math.round(width * 0.02)) : 0;
  const W = width + board, H = width * 1.5 + board * 2;
  const sp = Math.max(10, spinePx) + (hard ? board * 2 : 0);
  return (
    <div className="cv-3d" style={{ width: W, height: H }}>
      <div className="cv-3d-book" style={{ width: W, height: H, transform: `rotateY(${angle}deg) rotateX(2deg)` }}>
        <div className="cv-3d-front" style={{ transform: `translateZ(${sp / 2}px)`, background: m.bg, padding: `${board}px ${board}px ${board}px 0`, borderRadius: hard ? '2px 4px 4px 2px' : '1px 3px 3px 1px' }}>
          <CoverArt title={text.title || ' '} subtitle={text.subtitle} author={text.author} spec={spec} width={width} deva={text.deva} />
          <span className={hard ? 'cv-3d-hinge cv-3d-hinge-hard' : 'cv-3d-hinge'} aria-hidden="true" />
        </div>
        <div className="cv-3d-spine" aria-hidden="true"
          style={{ width: sp, height: H, left: -sp / 2, background: m.bg, color: m.fg, transform: 'rotateY(-90deg)', borderRadius: hard ? 3 : 0 }}>
          <span style={{ fontFamily: text.deva ? "'Tiro Devanagari Hindi', serif" : COVER_FONTS[spec.type].family, fontSize: Math.max(8, Math.min(sp * 0.42, 15)) }}>{text.title}</span>
        </div>
        <div className="cv-3d-back" aria-hidden="true" style={{ transform: `translateZ(${-sp / 2}px)`, background: m.bg }} />
      </div>
    </div>
  );
}

/** How the cover reads at store size, next to neutral placeholder neighbours. */
export function StoreThumbs({ text, spec }: { text: CoverText; spec: CoverSpec }) {
  const t = useT('cover2');
  const NEIGHBOURS = ['#9AA39E', '#D9CDB4', '#4F5B66', '#C7B9A3'];
  const sizes = [72, 60, 48];
  return (
    <div className="cv-store">
      <div className="kick" style={{ marginBottom: 12 }}>{t('stage.store.title')}</div>
      {sizes.map((s, si) => (
        <div key={s} className="cv-store-row">
          <span className="cv-store-size">{s}px</span>
          <div className="cv-store-shelf">
            {[0, 1, 2].map((i) => {
              const mine = i === (si % 3 === 1 ? 0 : 1);
              return (
                <div key={i} className="cv-store-item">
                  {mine ? (
                    <CoverArt title={text.title || ' '} subtitle={text.subtitle} author={text.author} spec={spec} width={s} deva={text.deva} />
                  ) : (
                    <span className="cv-store-ph" style={{ width: s, height: s * 1.5, background: NEIGHBOURS[(i + si) % NEIGHBOURS.length] }} aria-hidden="true">
                      <i style={{ width: '62%' }} /><i style={{ width: '40%' }} />
                    </span>
                  )}
                  <span className="cv-store-meta" aria-hidden={!mine}>
                    {mine ? <><b lang={text.deva ? 'hi' : undefined}>{text.title}</b><br /><span>{text.author}</span></> : <><i className="cv-bar" style={{ width: 70 }} /><i className="cv-bar" style={{ width: 44 }} /></>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="cv-store-note">{t('stage.store.note')}</p>
    </div>
  );
}
