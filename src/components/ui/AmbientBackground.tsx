import React from 'react';

type AmbientBackgroundProps = {
  className?: string;
  /** Kept for API compat — ignored. Paper theme has no dark overlay. */
  overlayOpacity?: number;
};

/**
 * Full-viewport cream paper background matching the landing page.
 * Use on full-screen React views (dashboard, founder OS, modals).
 */
export function AmbientBackground({
  className = '',
}: AmbientBackgroundProps) {
  return (
    <div
      className={`fixed inset-0 z-0 pointer-events-none bg-paper-grid ${className}`}
      aria-hidden="true"
    />
  );
}
