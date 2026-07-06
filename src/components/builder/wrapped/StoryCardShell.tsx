import React from 'react';
import { motion } from 'framer-motion';
import type { WrappedCardTheme } from './theme';
import { SwooshMark, SquiggleMark, BrandMark, GrainOverlay } from './decorations';

export const StoryCardShell: React.FC<{
  theme: WrappedCardTheme;
  index: number;
  total: number;
  children: React.ReactNode;
  contentClassName?: string;
}> = ({ theme, index, total, children, contentClassName = '' }) => (
  <div
    className="relative mx-auto aspect-[9/16] w-full max-w-[380px] overflow-hidden rounded-[28px] bg-black"
    style={{
      boxShadow: `0 34px 90px -24px ${theme.accentSoft}, 0 12px 44px rgba(0,0,0,0.55)`,
    }}
  >
    <motion.img
      src={theme.bgImage}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition: theme.objectPosition }}
      initial={{ scale: 1.08, opacity: 0.7 }}
      animate={{ scale: 1.16, opacity: 1 }}
      transition={{ scale: { duration: 9, ease: 'linear' }, opacity: { duration: 0.6 } }}
    />
    <div className="absolute inset-0" style={{ background: theme.wash }} />
    <GrainOverlay opacity={0.16} />

    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.5 }}
      className="absolute left-4 top-4 z-10 h-14 w-14 text-white/80 sm:left-5 sm:top-5"
    >
      <SwooshMark className="h-full w-full" />
    </motion.div>

    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.25, duration: 0.4 }}
      className="absolute right-4 top-4 z-10 h-7 w-7 text-white/85 sm:right-5 sm:top-5"
    >
      <BrandMark className="h-full w-full" />
    </motion.div>

    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.35, duration: 0.5 }}
      className="absolute bottom-5 right-5 z-10 h-6 w-24 text-white/85"
    >
      <SquiggleMark className="h-full w-full" />
    </motion.div>

    <div
      className="absolute bottom-5 left-5 z-10 font-spinnaker text-sm font-bold tracking-wide text-white/70"
    >
      {index}/{total}
    </div>

    <div className={`relative z-10 flex h-full flex-col justify-end px-6 pb-16 pt-6 sm:px-7 ${contentClassName}`}>
      {children}
    </div>
  </div>
);

export default StoryCardShell;
