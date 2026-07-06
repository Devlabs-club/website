import React from 'react';
import { motion } from 'framer-motion';

export const CalloutPill: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0.5 }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    className="inline-flex w-fit items-center rounded-lg bg-white px-3.5 py-2 text-[13px] font-bold text-black shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
  >
    {children}
  </motion.div>
);

export const AnimatedBar: React.FC<{
  label: string;
  value: number;
  color: string;
  delay?: number;
  valueLabel?: string;
}> = ({ label, value, color, delay = 0, valueLabel }) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
      <span className="font-bold text-white/90">{label}</span>
      <span className="font-spinnaker text-white/60">{valueLabel ?? `${Math.round(value)}%`}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-white/15">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(3, Math.min(100, value))}%` }}
        transition={{ duration: 0.85, delay, ease: [0.16, 1, 0.3, 1] }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  </div>
);

export const StaggerChip: React.FC<{ children: React.ReactNode; index: number }> = ({ children, index }) => (
  <motion.span
    initial={{ opacity: 0, y: 8, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay: 0.35 + index * 0.07, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm"
  >
    {children}
  </motion.span>
);

export const CardEyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.p
    initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
    className="mb-2 text-[11px] font-black uppercase tracking-[0.24em] text-white/60"
  >
    {children}
  </motion.p>
);
