import React from "react";
import { motion } from "framer-motion";

const sources = [
  { id: "x", label: "X", className: "font-extrabold" },
  { id: "linkedin", label: "LinkedIn", className: "font-semibold" },
  { id: "github", label: "GitHub", className: "font-semibold" },
  { id: "devlabs", label: "DevLabs", className: "font-bold text-[#ff7417]" },
];

export const AuthBuilderImportSources: React.FC = () => {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18, x: -10 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 0.5, delay: 0.36, ease: [0.22, 1, 0.36, 1] }}
      className="absolute -bottom-14 -left-6 z-20 w-[min(100%,17rem)] border border-black/10 bg-[#fffaf7] px-3.5 py-3 shadow-[0_10px_28px_rgba(5,5,5,0.08)] sm:-bottom-16 sm:-left-10 sm:w-[18rem] sm:px-4"
    >
      <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-black/40">
        Imported from
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <span
            key={source.id}
            className={`rounded-md border border-black/8 bg-white px-2 py-1 text-[0.7rem] text-black/70 ${source.className}`}
          >
            {source.label}
          </span>
        ))}
      </div>
    </motion.article>
  );
};

export default AuthBuilderImportSources;
