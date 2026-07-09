import React from "react";
import { Settings, UsersRound } from "lucide-react";

export const FounderRail: React.FC<{ onLogout: () => void; initial: string; active?: "sourcing" | "conversations" | "settings" }> = ({
  onLogout,
  initial,
  active = "sourcing",
}) => {
  return (
    <aside className="flex min-h-screen w-20 shrink-0 flex-col items-center border-r border-[#ece7e1] bg-white py-6">
      <a href="/dashboard" aria-label="DevLabs dashboard" className="mb-9">
        <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
      </a>
      <nav className="flex flex-1 flex-col items-center gap-4" aria-label="Founder navigation">
        <a
          href="/founder/home"
          className={
            active === "sourcing"
              ? "grid h-12 w-12 place-items-center rounded-xl border border-[#ece7e1] bg-[#fdfaf7] text-[#ec9149] shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
              : "grid h-11 w-11 place-items-center rounded-xl text-black/35 transition hover:bg-[#fdfaf7] hover:text-black/70"
          }
          title="Sourcing"
        >
          <UsersRound className="h-5 w-5" />
        </a>
      </nav>
      <div className="flex flex-col items-center gap-4">
        <a
          href="/founder/settings"
          className={
            active === "settings"
              ? "grid h-11 w-11 place-items-center rounded-xl border border-[#ece7e1] bg-[#fdfaf7] text-[#ec9149]"
              : "grid h-11 w-11 place-items-center rounded-xl text-black/35 transition hover:bg-[#fdfaf7] hover:text-black/70"
          }
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </a>
        <button
          type="button"
          onClick={onLogout}
          className="grid h-10 w-10 place-items-center rounded-full bg-[#f3ede4] text-xs font-bold text-black/60 transition hover:bg-[#ece3d5] hover:text-black"
          title="Sign out"
        >
          {initial}
        </button>
      </div>
    </aside>
  );
};

export default FounderRail;
