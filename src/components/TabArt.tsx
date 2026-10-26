import type {JSX} from 'react';
/** Small line drawings that give each place in the book its own character. Decorative only. */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const ART: Record<string, JSX.Element> = {
  // A notebook with a ribbon and a few loose notes flying out
  laps: (
    <g {...S}>
      <rect x="30" y="34" width="62" height="80" rx="4" />
      <path d="M38 34v80" />
      <path d="M78 34v26l6-5 6 5V34" className="ta-brass" />
      <path d="M48 56h30M48 66h34M48 76h26M48 86h32" opacity=".55" />
      <path d="M100 38c8-6 18-6 26 0l-8 14c-5-3-11-3-16 0z" className="ta-brass" />
      <path d="M104 72c6-3 13-3 19 1l-6 10c-3-2-7-2-10 0z" />
      <circle cx="124" cy="22" r="2" className="ta-brass" /><circle cx="134" cy="56" r="1.5" />
    </g>
  ),
  // Quill over an open page
  brief: (
    <g {...S}>
      <path d="M22 108c18-6 36-6 54 0 18-6 36-6 54 0V44c-18-6-36-6-54 0-18-6-36-6-54 0z" />
      <path d="M76 44v64" />
      <path d="M34 60h30M34 70h26M34 80h30M88 60h30M88 70h22" opacity=".5" />
      <path d="M128 18c-20 10-36 30-44 54l4 2c10-22 24-40 40-52z" className="ta-brass" />
      <path d="M84 72l-4 10" className="ta-brass" />
    </g>
  ),
  // Three overlapping portrait medallions
  characters: (
    <g {...S}>
      <circle cx="52" cy="70" r="26" />
      <circle cx="98" cy="62" r="26" className="ta-brass" />
      <circle cx="78" cy="98" r="20" opacity=".7" />
      <circle cx="52" cy="64" r="8" /><path d="M38 86c4-8 24-8 28 0" />
      <circle cx="98" cy="56" r="8" className="ta-brass" /><path d="M84 78c4-8 24-8 28 0" className="ta-brass" />
    </g>
  ),
  // A compass rose over hills
  world: (
    <g {...S}>
      <path d="M14 112c22-26 40-30 58-12 14-18 34-24 62 12" />
      <path d="M40 112c10-10 20-12 30-6" opacity=".5" />
      <circle cx="96" cy="46" r="24" className="ta-brass" />
      <path d="M96 28l5 18-5 18-5-18z" className="ta-brass" />
      <path d="M78 46h36" opacity=".5" />
      <circle cx="44" cy="40" r="3" /><path d="M44 43v14" />
    </g>
  ),
  // An hourglass beside a thread of beads
  timeline: (
    <g {...S}>
      <path d="M40 22h40M40 118h40M44 22c0 26 32 30 32 48s-32 22-32 48M76 22c0 26-32 30-32 48s32 22 32 48" />
      <path d="M50 108c4-6 16-6 20 0z" className="ta-brass" />
      <path d="M104 24v96" opacity=".5" />
      <circle cx="104" cy="40" r="5" className="ta-brass" /><circle cx="104" cy="70" r="5" /><circle cx="104" cy="100" r="5" className="ta-brass" />
      <path d="M112 40h20M112 70h14M112 100h18" opacity=".5" />
    </g>
  ),
  // Loose pages with a fountain pen
  manuscript: (
    <g {...S}>
      <path d="M30 30h56l14 14v74H30z" transform="rotate(-6 64 74)" opacity=".5" />
      <path d="M40 28h56l14 14v76H40z" />
      <path d="M96 28v14h14" />
      <path d="M50 54h40M50 64h46M50 74h36M50 84h44M50 94h30" opacity=".5" />
      <path d="M136 26l-38 52-4 12 10-6 38-52z" className="ta-brass" />
    </g>
  ),
  // A stack of bound chapters with numbered tabs
  chapters: (
    <g {...S}>
      <rect x="26" y="30" width="84" height="22" rx="3" />
      <rect x="32" y="58" width="84" height="22" rx="3" className="ta-brass" />
      <rect x="22" y="86" width="84" height="22" rx="3" />
      <path d="M112 41h14M118 69h14M108 97h14" opacity=".55" />
      <path d="M38 41h40M44 69h44M34 97h36" opacity=".45" />
    </g>
  ),
  // A magnifying glass over lines
  review: (
    <g {...S}>
      <path d="M24 36h70M24 50h56M24 64h64M24 78h44M24 92h60" opacity=".45" />
      <circle cx="96" cy="70" r="24" className="ta-brass" />
      <path d="M113 87l20 20" className="ta-brass" />
      <path d="M86 70h20" />
    </g>
  ),
  // A book standing with a cover motif
  cover: (
    <g {...S}>
      <path d="M44 22h64v100H44z" />
      <path d="M44 22c-6 0-10 4-10 10v84c0 6 4 6 10 6" />
      <circle cx="76" cy="58" r="14" className="ta-brass" />
      <path d="M54 92h44M60 102h32" opacity=".55" />
    </g>
  ),
  // An open printed book with a ribbon
  generate: (
    <g {...S}>
      <path d="M16 46c22-8 42-8 60 4 18-12 38-12 60-4v66c-22-8-42-8-60 4-18-12-38-12-60-4z" />
      <path d="M76 50v66" />
      <path d="M28 62h36M28 72h36M28 82h30M88 62h36M88 72h30" opacity=".45" />
      <path d="M104 46v40l6-6 6 6V44" className="ta-brass" />
    </g>
  ),
};

export function TabArt({ id, className = '' }: { id: string; className?: string }) {
  const art = ART[id];
  if (!art) return null;
  return (
    <svg className={`ta ${className}`} viewBox="0 0 152 140" width="152" height="140" aria-hidden="true">{art}</svg>
  );
}
