import React from "react";
import { motion } from "framer-motion";
import { AuthAsciiStar } from "./AuthAsciiStar";
import { AuthBuilderMatchCard } from "./AuthBuilderMatchCard";

/**
 * Right pane: headline, stacked builder cards, bottom glow, and ASCII stars.
 */
export const AuthCommunityPanel: React.FC = () => {
  return (
    <div className="relative hidden h-full min-h-screen overflow-hidden bg-[#cfe6e9] lg:block">
      {/* Meadow background */}
      <img
        src="/landing/hero-meadow.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Light overlay — keeps text readable without washing out the meadow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/[0.04]" />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%]"
        style={{
          background:
            "radial-gradient(ellipse 90% 75% at 50% 100%, rgba(255, 116, 23, 0.14) 0%, transparent 65%)",
        }}
      />

      {/* Top-left star — clipped at pane edge, right half visible */}
      <AuthAsciiStar className="absolute left-0 top-[8%] z-[1] h-[clamp(14rem,24vw,22rem)] w-[clamp(14rem,24vw,22rem)] -translate-x-[48%] -rotate-[20deg]" />

      {/* Right star — left half visible, right half off pane edge */}
      <AuthAsciiStar className="absolute right-0 top-[44%] z-[1] h-[clamp(13rem,22vw,20rem)] w-[clamp(13rem,22vw,20rem)] translate-x-[48%] rotate-[12deg]" />

      <div className="relative z-[2] flex h-full min-h-screen flex-col items-center px-8 pb-12 pt-14 xl:pt-16">
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[20rem] text-center text-[clamp(2.1rem,3.4vw,3rem)] font-normal leading-[1.12] tracking-[-0.03em] text-[#050505] sm:max-w-lg"
        >
          Hire <span className="font-extrabold">builders</span> who have already{" "}
          <span className="font-extrabold">shipped</span>.
        </motion.h2>

        <div className="flex w-full flex-1 items-center justify-center pt-10 sm:pt-14">
          <AuthBuilderMatchCard />
        </div>
      </div>
    </div>
  );
};

export default AuthCommunityPanel;
