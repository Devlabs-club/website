import React from "react";
import { AuthCommunityPanel } from "./AuthCommunityPanel";

/**
 * Two-pane auth layout: landing-page-styled form on the left,
 * community proof panel with orange mesh gradient on the right.
 */
export const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative grid min-h-screen bg-[#fbf6f3] text-[#050505] lg:grid-cols-2">
      {/* Mobile community strip */}
      <div className="relative overflow-hidden border-b border-[#ff7417]/15 bg-gradient-to-r from-[#fbf6f3] via-[#fff5ef] to-[rgba(255,116,23,0.12)] px-6 py-4 lg:hidden">
        <p className="relative z-10 text-center text-sm font-bold text-[#bf4f08]">
          A community of builders who ship — not scraped from LinkedIn.
        </p>
        <div className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay">
          <svg className="h-full w-full" aria-hidden>
            <filter id="auth-grain-mobile">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#auth-grain-mobile)" />
          </svg>
        </div>
      </div>

      {/* Left: form */}
      <div className="auth-ruler-section relative flex min-h-screen items-center justify-center px-6 py-16 sm:px-12">
        <div className="relative z-10 w-full max-w-md">{children}</div>
      </div>

      {/* Right: community panel */}
      <AuthCommunityPanel />
    </div>
  );
};

export default AuthShell;
