import React from 'react';
import { motion } from 'framer-motion';
import { StoryCardShell } from '../StoryCardShell';
import { CARD_THEMES } from '../theme';

function displayFirstName(builderName?: string) {
  const raw = (builderName || 'this builder').trim();
  const token = raw.split(/[\s._@+-]+/).filter(Boolean)[0] || raw;
  if (!token || token.toLowerCase() === 'this') return 'this builder';
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export const BuildprintConversionCard: React.FC<{
  index: number;
  total: number;
  builderName?: string;
  viewer: 'signed_out' | 'builder' | 'founder' | 'owner';
  onPrimary: () => void;
  onSecondary: () => void;
}> = ({ index, total, builderName, viewer, onPrimary, onSecondary }) => {
  const firstName = displayFirstName(builderName);
  const founderPrimary = viewer === 'founder';

  return (
    <StoryCardShell theme={CARD_THEMES.convert} index={index} total={total}>
      <div className="relative flex h-full flex-col justify-between px-1 py-2 text-[#14110f]">
        <div>
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-gatwick text-[0.7rem] font-black uppercase tracking-[0.4em] text-black/50"
          >
            See how you build
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6 font-gatwick text-[2.4rem] font-black leading-[0.95] tracking-[-0.05em] text-[#14110f] drop-shadow-[0_1px_0_rgba(255,255,255,0.65)] [overflow-wrap:anywhere]"
          >
            Want to see how you build?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-4 max-w-[28rem] rounded-xl py-2 text-[1rem] font-medium leading-relaxed text-black/65"
          >
            {founderPrimary
              ? `Looking for builders like ${firstName}? Find them on DevLabs.`
              : 'Analyze your real building sessions and get your own AI Wrapped.'}
          </motion.p>
        </div>

        <div className="space-y-3 pb-4">
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrimary();
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[#fa7d22] px-4 text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(250,125,34,0.35)]"
          >
            {founderPrimary ? 'Find builders like this' : 'Get my AI Wrapped'}
          </motion.button>
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSecondary();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="w-full rounded-lg bg-white/50 py-2 text-center text-sm font-bold text-black/60 underline-offset-4 backdrop-blur-[2px] hover:underline"
          >
            {founderPrimary ? 'Or get your own AI Wrapped →' : 'Hiring? Find builders like this →'}
          </motion.button>
          <p className="text-center text-[0.7rem] font-medium text-black/45">
            Runs locally. You choose what gets shared.
          </p>
        </div>
      </div>
    </StoryCardShell>
  );
};

export default BuildprintConversionCard;
