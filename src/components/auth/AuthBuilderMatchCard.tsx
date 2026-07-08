import React from "react";
import { motion } from "framer-motion";
import { AuthBuilderExperienceCard } from "./AuthBuilderExperienceCard";
import { AuthBuilderImportSources } from "./AuthBuilderImportSources";

export const AuthBuilderMatchCard: React.FC = () => {
  return (
    <div className="relative w-full max-w-[20rem] pb-24 pt-4 sm:max-w-[22rem] sm:pb-28">
      <motion.article
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full border-2 border-black bg-white p-4 shadow-[0_14px_28px_rgba(5,5,5,0.07)] sm:p-5"
      >
        <div className="mb-3 inline-flex items-center gap-2 border border-[#ff7417]/50 bg-[#fff5ef] px-2.5 py-1.5 text-xs font-semibold text-[#bf4f08]">
          <span className="text-[#ff7417]">✦</span>
          Verified builder
        </div>

        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center bg-[#ff7417] text-sm font-extrabold text-white">
            PS
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-black">Priya S.</p>
            <p className="mt-0.5 text-xs text-black/55">Full-stack builder · 96% match</p>
          </div>
        </div>

        <ul className="mt-4 space-y-2.5 text-sm leading-snug text-black/70">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-base" aria-hidden>
              🏆
            </span>
            <span>
              Won <strong className="font-bold text-black">2 hackathons</strong> at DevHacks &amp;
              DevHouse
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-base" aria-hidden>
              📦
            </span>
            <span>
              <strong className="font-bold text-black">3 shipped projects</strong> match your job
              description
            </span>
          </li>
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          {["Next.js", "Stripe", "In prod"].map((chip) => (
            <span
              key={chip}
              className="border border-[#ff7417]/30 bg-[#fff5ef] px-2.5 py-1 text-xs font-semibold text-[#bf4f08]"
            >
              {chip}
            </span>
          ))}
        </div>
      </motion.article>

      <AuthBuilderExperienceCard />
      <AuthBuilderImportSources />
    </div>
  );
};

export default AuthBuilderMatchCard;
