import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { WrappedCardTheme } from './theme';
import { WRAPPED_CARD_ASPECT, WRAPPED_TYPE_CLASS, WRAPPED_TYPE_STYLE } from './theme';
import { GrainOverlay } from './decorations';

const SWOOSH_SRC = '/wrapped/swoosh-flourish.png';
const SQUIGGLE_SRC = '/wrapped/squiggle-mark.png';

export const StoryCardShell: React.FC<{
  theme: WrappedCardTheme;
  index: number;
  total: number;
  children: React.ReactNode;
  contentClassName?: string;
}> = ({ theme, index, total, children, contentClassName = '' }) => {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={`relative mx-auto w-full max-w-[577px] overflow-hidden rounded-[26px] bg-black font-gatwick text-white shadow-[0_34px_90px_rgba(26,10,2,0.26),0_12px_36px_rgba(0,0,0,0.20)] sm:rounded-[30px] ${WRAPPED_TYPE_CLASS}`}
      style={{
        aspectRatio: WRAPPED_CARD_ASPECT,
        containerType: 'inline-size',
        letterSpacing: WRAPPED_TYPE_STYLE.letterSpacing,
        lineHeight: WRAPPED_TYPE_STYLE.lineHeight,
        boxShadow: `0 42px 100px -30px ${theme.accentSoft}, 0 18px 46px rgba(22,12,5,0.22)`,
      }}
    >
      <motion.img
        src={theme.bgImage}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: theme.objectPosition }}
        initial={reduceMotion ? false : { scale: 1.06, opacity: 0 }}
        animate={reduceMotion ? undefined : { scale: 1.08, opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="absolute inset-0" style={{ background: theme.wash }} />
      <div
        className="pointer-events-none absolute inset-0 mix-blend-overlay"
        style={{
          opacity: theme.lightOverlays ? 0.2 : 0.48,
          backgroundImage:
            'radial-gradient(circle at center, rgba(255,255,255,0.72) 0 1px, transparent 1.4px)',
          backgroundSize: '5px 5px',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          opacity: theme.lightOverlays ? 0.08 : 0.18,
          backgroundImage:
            'linear-gradient(0deg, transparent 0 46%, rgba(255,255,255,0.46) 50%, transparent 54%)',
          backgroundSize: '100% 6px',
        }}
      />
      <GrainOverlay opacity={theme.lightOverlays ? 0.1 : 0.22} />

      <motion.img
        src={SWOOSH_SRC}
        alt=""
        draggable={false}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.92, x: -16, y: -12 }}
        animate={reduceMotion ? undefined : { opacity: 0.92, scale: 1, x: 0, y: 0 }}
        transition={{ delay: 0.12, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute -left-[22%] -top-[14%] z-20 h-80 w-[128%] max-w-none object-contain object-left-top mix-blend-screen sm:-left-[24%] sm:-top-[16%] sm:h-96"
      />

      <motion.img
        src="/logo.png"
        alt="DevLabs"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.72, rotate: -8 }}
        animate={reduceMotion ? undefined : { opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 0.22, duration: 0.45 }}
        className="absolute right-7 top-7 z-20 h-8 w-8 object-contain brightness-0 invert sm:h-9 sm:w-9"
        draggable={false}
      />

      <motion.img
        src={SQUIGGLE_SRC}
        alt=""
        draggable={false}
        initial={reduceMotion ? false : { opacity: 0, x: 18 }}
        animate={reduceMotion ? undefined : { opacity: 0.92, x: 0 }}
        transition={{ delay: 0.35, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute bottom-10 right-0 z-20 h-10 w-44 translate-x-2/3 object-contain object-right mix-blend-screen sm:bottom-10 sm:h-12 sm:w-52"
      />

      <div className="absolute bottom-10 left-6 z-20 font-gatwick text-[1.15rem] font-bold tracking-wide text-white sm:left-7">
        {index}/{total}
      </div>

      <div
        className={`absolute inset-0 z-10 ${contentClassName}`}
        style={{ paddingLeft: '8.6%', paddingRight: '8.6%', paddingTop: '8.5%', paddingBottom: '14.5%' }}
      >
        {children}
      </div>
    </div>
  );
};

export default StoryCardShell;
