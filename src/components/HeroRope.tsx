import React from "react";

export default function HeroRope() {
  return (
    <div className="absolute top-20 left-0 w-full pointer-events-none z-10">
      <svg
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        className="w-full h-32"
      >
        <defs>
          {/* Rope texture gradient */}
          <linearGradient id="ropeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5a2b" />
            <stop offset="50%" stopColor="#a47148" />
            <stop offset="100%" stopColor="#8b5a2b" />
          </linearGradient>

          {/* Subtle rope shadow */}
          <filter id="shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.4" />
          </filter>
        </defs>

        {/* Left loop */}
        <path
          d="M 40 80 
             q -40 -40 20 -60 
             q 40 0 20 60"
          fill="none"
          stroke="url(#ropeGradient)"
          strokeWidth="6"
        />

        {/* Main sagging rope */}
        <path
          d="M 60 80 
             Q 720 130 1380 95"
          fill="none"
          stroke="url(#ropeGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          filter="url(#shadow)"
        />

        {/* Right loop */}
        <path
          d="M 1380 95 
             q 40 -40 -20 -60 
             q -40 0 -20 60"
          fill="none"
          stroke="url(#ropeGradient)"
          strokeWidth="6"
        />
      </svg>
    </div>
  );
}
