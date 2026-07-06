import React from 'react';

function wavePath(width: number, amplitude: number, waveLength: number, yBase: number) {
  const half = waveLength / 2;
  let path = `M0,${yBase}`;
  let x = 0;
  let up = true;
  while (x < width) {
    const cx = x + half / 2;
    const cy = up ? yBase - amplitude : yBase + amplitude;
    const nx = x + half;
    path += ` Q${cx},${cy} ${nx},${yBase}`;
    x = nx;
    up = !up;
  }
  return path;
}

/** Diagonal double-line pen-stroke flourish, top-left corner accent. */
export const SwooshMark: React.FC<{ className?: string; color?: string }> = ({
  className = '',
  color = 'currentColor',
}) => (
  <svg
    viewBox="0 0 140 150"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M128 8 L14 132 Q4 143 14 149 Q28 156 40 143 Q48 134 36 128 Q22 122 16 134"
      stroke={color}
      strokeWidth="3.5"
      strokeLinecap="round"
      opacity="0.92"
    />
    <path
      d="M118 6 L8 124"
      stroke={color}
      strokeWidth="3.5"
      strokeLinecap="round"
      opacity="0.6"
    />
  </svg>
);

/** Double wavy squiggle lines, bottom-right corner accent. */
export const SquiggleMark: React.FC<{ className?: string; color?: string }> = ({
  className = '',
  color = 'currentColor',
}) => {
  const width = 160;
  return (
    <svg viewBox={`0 0 ${width} 46`} fill="none" className={className} aria-hidden="true">
      <path d={wavePath(width, 9, 26, 12)} stroke={color} strokeWidth="3.2" strokeLinecap="round" opacity="0.95" />
      <path d={wavePath(width, 9, 26, 32)} stroke={color} strokeWidth="3.2" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
};

/** Simple outline fox/wolf brand mark for the story-card corner, falls back to /logo.png elsewhere. */
export const BrandMark: React.FC<{ className?: string; color?: string }> = ({
  className = '',
  color = 'currentColor',
}) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
    <path
      d="M8 6 L20 20 L24 12 L28 20 L40 6 L36 30 Q34 40 24 42 Q14 40 12 30 Z"
      stroke={color}
      strokeWidth="2.4"
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity="0.92"
    />
    <circle cx="19" cy="27" r="1.6" fill={color} opacity="0.92" />
    <circle cx="29" cy="27" r="1.6" fill={color} opacity="0.92" />
  </svg>
);

export const GrainOverlay: React.FC<{ opacity?: number }> = ({ opacity = 0.14 }) => (
  <div className="pointer-events-none absolute inset-0 bg-noise mix-blend-overlay" style={{ opacity }} />
);
