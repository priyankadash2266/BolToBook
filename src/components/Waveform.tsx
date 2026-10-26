import { LiveWave } from './voice';

interface Props {
  active: boolean;
  /** Live microphone level 0–1. When provided, bars follow the author's voice. */
  level?: number;
  bars?: number;
  height?: number;
  color?: string;
  className?: string;
  idle?: boolean;
}

/** Compatibility wrapper: every waveform in the product uses the same LiveWave motion. */
export function Waveform({ active, level, bars = 24, height = 36, color = 'var(--brand-2)', className = '', idle }: Props) {
  return <LiveWave active={active} level={level} bars={bars} height={height} color={color} className={className} idle={idle} barWidth={bars <= 9 ? 3 : 3} gap={bars <= 6 ? 2 : 3} />;
}
