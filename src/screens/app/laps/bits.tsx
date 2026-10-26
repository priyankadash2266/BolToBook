import { Icon } from '@/components/Icon';
import { useT } from '@/i18n';
import type { Lap, LapTag } from '@/data/types';
import { fmtDate } from '@/lib/format';
import type { AppLang } from '@/data/types';
import { tagKey, type LapCommand } from '@/lib/lapVoice';
import './bits.css';

export const isUsed = (l: Lap) => l.status === 'placed';
export const isUnused = (l: Lap) => l.status === 'inbox' || l.status === 'later';

/** A tag with its type shown as a small label, coloured by type (character, location, event, chapter, theme). */
export function TagChip({ tag, onRemove, onClick, pressed, dark }: { tag: LapTag; onRemove?: () => void; onClick?: () => void; pressed?: boolean; dark?: boolean }) {
  const t = useT('laps');
  const typeLabel = tag.type === 'other' ? '' : t(`tagTypes.${tag.type}`);
  const label = typeLabel ? `${typeLabel}: ${tag.name}` : tag.name;
  const inner = (
    <>
      <span className="lp-tag-dot" aria-hidden="true" />
      {typeLabel && <span className="lp-tag-type">{typeLabel}</span>}
      <span className="lp-tag-name">{tag.name}</span>
    </>
  );
  const cls = `lp-tag lp-tag-${tag.type}${dark ? ' is-dark' : ''}`;
  if (onClick) {
    return <button type="button" className={`${cls} lp-tag-btn`} aria-pressed={!!pressed} onClick={onClick} aria-label={label}>{inner}</button>;
  }
  return (
    <span className={cls}>
      {inner}
      {onRemove && (
        <button type="button" className="lp-tag-x" onClick={onRemove} aria-label={t('edit.removeTag', { tag: label })}><Icon name="x" size={12} /></button>
      )}
    </span>
  );
}

/** Title / tags / twist the author said, shown as chips (removable in the capture sheet). */
export function ParsedChips({ title, tags, twist, onRemove, dark }: { title?: string; tags: LapTag[]; twist?: boolean; onRemove?: (key: string) => void; dark?: boolean }) {
  const t = useT('laps');
  if (!title && !tags.length && !twist) return null;
  return (
    <div className={`lp-parsed${dark ? ' is-dark' : ''}`}>
      {title && (
        <span className="lp-parsed-title">
          <span className="lp-parsed-k">{t('edit.title')}</span>
          <span className="lp-parsed-v">{title}</span>
          {onRemove && <button type="button" className="lp-tag-x" onClick={() => onRemove('title')} aria-label={t('sheet.remove', { x: t('sheet.titleChip', { x: title }) })}><Icon name="x" size={12} /></button>}
        </span>
      )}
      {tags.map((tg) => <TagChip key={tagKey(tg)} tag={tg} dark={dark} onRemove={onRemove ? () => onRemove(tagKey(tg)) : undefined} />)}
      {twist && (
        <span className="lp-twistchip">
          <Icon name="flag" size={12} />{t('card.twist')}
          {onRemove && <button type="button" className="lp-tag-x" onClick={() => onRemove('twist')} aria-label={t('sheet.remove', { x: t('card.twist') })}><Icon name="x" size={12} /></button>}
        </span>
      )}
    </div>
  );
}

/** One line saying what a spoken command will do, so the author can see it was understood. */
export function IntentLine({ cmd }: { cmd: LapCommand }) {
  const t = useT('laps');
  if (cmd.kind === 'create') return <ParsedChips title={cmd.title} tags={cmd.tags} twist={cmd.twist} />;
  const text = cmd.kind === 'append' ? t('hero.will.append', { q: cmd.query })
    : cmd.kind === 'find' ? t('hero.will.find', { q: cmd.query })
    : cmd.kind === 'markUsed' ? (cmd.where ? t('hero.will.usedWhere', { q: cmd.query, where: cmd.where }) : t('hero.will.used', { q: cmd.query }))
    : t('hero.will.unused', { q: cmd.query });
  const icon = cmd.kind === 'find' ? 'search' : cmd.kind === 'append' ? 'plus' : cmd.kind === 'markUsed' ? 'check' : 'undo';
  return <p className="lp-intent"><Icon name={icon} size={14} />{text}</p>;
}

/** A gentle drawn check for the "Saved" moment. */
export function SavedCheck({ size = 40 }: { size?: number }) {
  return (
    <svg className="lp-check-anim" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" />
      <path d="M12 20.5l5.5 5.5L28.5 14" />
    </svg>
  );
}

/* ---------------- grouping by day ---------------- */

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function daysAgo(iso: string): number {
  return Math.round((dayStart(new Date()) - dayStart(new Date(iso))) / 864e5);
}

export interface DayGroup { key: string; label: string; items: Lap[] }

/** Today · Yesterday · Earlier this week · then each older day by its date. */
export function groupByDay(laps: Lap[], lang: AppLang, t: (k: string) => string): DayGroup[] {
  const out: DayGroup[] = [];
  const thisYear = new Date().getFullYear();
  const sorted = [...laps].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const l of sorted) {
    const n = daysAgo(l.createdAt);
    let key: string;
    let label: string;
    if (n <= 0) { key = 'today'; label = t('days.today'); }
    else if (n === 1) { key = 'yesterday'; label = t('days.yesterday'); }
    else if (n < 7) { key = 'week'; label = t('days.week'); }
    else {
      const d = new Date(l.createdAt);
      key = `d-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      label = fmtDate(l.createdAt, lang, d.getFullYear() === thisYear ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
    }
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(l);
    else out.push({ key, label, items: [l] });
  }
  // Set-aside Laps (older data) sit at the end of their day.
  out.forEach((g) => { g.items = [...g.items.filter((l) => l.status !== 'discarded'), ...g.items.filter((l) => l.status === 'discarded')]; });
  return out;
}
