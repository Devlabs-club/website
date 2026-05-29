import React from 'react';

type AmbientBackgroundProps = {
  className?: string;
  /** Overlay darkness on top of texture (0–1). Default 0.55 */
  overlayOpacity?: number;
};

/**
 * Full-viewport dark background: texture overlay + noise grain.
 * Use on full-screen React views (dashboard, founder OS, modals).
 */
export function AmbientBackground({
  className = '',
  overlayOpacity = 0.55,
}: AmbientBackgroundProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-0 pointer-events-none bg-texture ${className}`}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ backgroundColor: `hsl(8 8 9 / ${overlayOpacity})` }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-0 opacity-[0.06] mix-blend-overlay pointer-events-none bg-noise"
        aria-hidden="true"
      />
    </>
  );
}
