import React from "react";
import { motion } from "framer-motion";

const experiences = [
  { company: "Amazon", role: "SDE Intern · Summer '25" },
  { company: "Waymo", role: "Software Intern · Spring '24" },
];

export const AuthBuilderExperienceCard: React.FC = () => {
  return (
    <motion.article
      initial={{ opacity: 0, y: 22, x: 12 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 0.5, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="absolute -bottom-10 -right-8 z-20 w-[min(100%,15.5rem)] border border-black/12 bg-white p-3.5 shadow-[0_12px_32px_rgba(5,5,5,0.1)] sm:-bottom-12 sm:-right-12 sm:w-[16.5rem] sm:p-4"
    >
      <p className="mb-2.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-black/40">
        Experience
      </p>
      <ul className="space-y-2">
        {experiences.map((item) => (
          <li key={item.company} className="flex items-start gap-2.5">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff7417]" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight text-[#050505]">{item.company}</p>
              <p className="mt-0.5 text-xs text-black/50">{item.role}</p>
            </div>
          </li>
        ))}
      </ul>
    </motion.article>
  );
};

export default AuthBuilderExperienceCard;
