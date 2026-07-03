import React from "react";
import { ThemeToggle } from "@/components/app/ThemeToggle";

interface AppTopBarProps {
  right?: React.ReactNode;
  variant?: "light" | "dark";
}

export const AppTopBar: React.FC<AppTopBarProps> = ({ right, variant = "light" }) => {
  const isDark = variant === "dark";

  return (
    <header
      className={
        isDark
          ? "sticky top-0 z-30 border-b border-white/10 bg-[#111111]/92 backdrop-blur-xl"
          : "sticky top-0 z-30 border-b border-[#1a140f]/10 bg-[#fbfaf7]/90 backdrop-blur-xl"
      }
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href="/dashboard"
          className={isDark ? "flex items-center gap-2.5 text-sm font-extrabold tracking-tight text-white" : "flex items-center gap-2.5 text-sm font-extrabold tracking-tight text-[#14110f]"}
        >
          <span
            className={
              isDark
                ? "flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"
                : "flex h-9 w-9 items-center justify-center rounded-xl border border-[#1a140f]/10 bg-white shadow-[0_8px_20px_rgba(33,24,16,0.08)]"
            }
          >
            <img src="/logo.png" alt="DevLabs" className="h-6 w-6 object-contain" />
          </span>
          <span>DevLabs</span>
        </a>
        <div className="flex items-center gap-2">
          {right}
          <ThemeToggle
            className={
              isDark
                ? "border-white/10 bg-white/[0.04] text-white/70 shadow-none hover:bg-white/[0.08] hover:text-white"
                : undefined
            }
          />
        </div>
      </div>
    </header>
  );
};

export default AppTopBar;
