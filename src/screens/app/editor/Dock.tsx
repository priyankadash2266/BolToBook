import { useErrorNotice } from '@/components/Toast';
import { useEffect, useRef } from 'react';
import { Segmented } from '@/components/Segmented';
import { LiveWave, MicOrb } from '@/components/voice';
import { Icon } from '@/components/Icon';
import { useT } from '@/i18n';
import { isMac } from './util';

export type LiveView = 'clean' | 'raw';
export type VePhase = 'idle' | 'understand' | 'find' | 'show' | 'decide' | 'error';

interface Props {
  supported: boolean;
  /** Where the words go, e.g. "Chapter 3" or "your manuscript". */
  target: string;
  dictating: boolean;
  dictStarting: boolean;
  onToggleDictation: () => void;
  liveView: LiveView;
  onLiveView: (v: LiveView) => void;
  level: number;
  /** The newest words while dictating (settled + live), shown as they arrive. */
  liveWords: string;
  /** A spoken change is being prepared or decided. */
  vePhase: VePhase;
  onCancelEdit: () => void;
  onFind: () => void;
  voiceError?: string;
  compact: boolean;
}

const STEP_KEYS = ['understand', 'find', 'show', 'decide'] as const;
const PHASE_STEP: Record<VePhase, number> = { idle: -1, error: -1, understand: 0, find: 1, show: 2, decide: 3 };

/**
 * The one voice control. Dictate writes; a clear spoken change ("change X to Y") inside the
 * dictation is shown as a proposal instead of being written. Find sits beside it, separate.
 */
export function Dock(p: Props) {
  const t = useT('editor');
  const tc = useT('common');
  const live = p.dictating || p.dictStarting;
  const step = PHASE_STEP[p.vePhase];
  const editing = step >= 0;
  const wordsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (wordsRef.current) wordsRef.current.scrollLeft = wordsRef.current.scrollWidth; }, [p.liveWords]);

  const micLabel = live ? t('dock.stopDictate') : t('dock.startDictate');
  useErrorNotice(p.voiceError);

  return (
    <div className={`ed-dock${live ? ' is-dictating' : ''}${editing ? ' is-edit' : ''}`} role="region" aria-label={t('dock.label')}>
      <div className="ed-dock-row">
        <MicOrb
          listening={live}
          level={p.level}
          onClick={p.onToggleDictation}
          label={micLabel}
          size={p.compact ? 50 : 56}
          disabled={!p.supported || editing}
          className="ed-orb"
        />

        {live ? (
          <div className="ed-dock-live">
            <div className="ed-dock-livehead">
              <LiveWave active={p.dictating} level={p.level} bars={p.compact ? 14 : 26} height={26} barWidth={3} gap={2} color="var(--brand-2)" className="ed-wave" />
              <span className="kick ed-kick-brand">
                {p.dictStarting && !p.dictating ? t('dock.starting') : t('dock.listening')}
                {!p.compact && <span className="ed-dock-into"> · {t('dock.into', { place: p.target })}</span>}
              </span>
            </div>
            <div className="ed-dock-words book" ref={wordsRef} aria-hidden="true">
              {p.liveWords ? <span>{p.liveWords}</span> : <span className="ed-dock-wait">{t('dock.sayIt')}</span>}
            </div>
          </div>
        ) : editing ? (
          <ol className="ed-steps" aria-label={t('steps.label')}>
            {STEP_KEYS.map((k, i) => (
              <li key={k} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} aria-current={i === step ? 'step' : undefined}>
                <span className="ed-step-n">{i < step ? <Icon name="check" size={11} weight={3} /> : i + 1}</span>{t(`steps.${k}`)}
              </li>
            ))}
          </ol>
        ) : (
          <div className="ed-dock-text">
            <strong className="ed-dock-lead">{p.supported ? t('dock.lead') : t('dock.leadType')}</strong>
            <span className="ed-hint">{p.supported ? (p.compact ? t('dock.hintShort') : t('dock.hint', { mod: isMac() ? '⌘' : 'Ctrl' })) : t('dock.unsupported')}</span>
          </div>
        )}

        <div className="ed-dock-end">
          {live ? (
            <>
              {!p.compact && (
                <Segmented
                  size="sm"
                  label={t('dock.viewLabel')}
                  value={p.liveView}
                  onChange={p.onLiveView}
                  options={[{ value: 'clean', label: t('dock.clean') }, { value: 'raw', label: t('dock.raw') }]}
                />
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={p.onToggleDictation}>{t('dock.done')}</button>
            </>
          ) : editing ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={p.onCancelEdit}>{tc('actions.cancel')}</button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm ed-dock-find" onClick={p.onFind} aria-label={t('dock.findLabel')} title={t('dock.findLabel')}>
              <Icon name="search" size={16} /><span className="ed-dock-findtext">{t('dock.find')}</span>
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
