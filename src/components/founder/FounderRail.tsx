import React, { useEffect, useState } from "react";
import { MessageCircle, Search, Settings, UsersRound } from "lucide-react";

export const FounderRail: React.FC<{ onLogout: () => void; initial: string; active?: "sourcing" | "conversations" | "settings" }> = ({
  onLogout,
  initial,
  active = "sourcing",
}) => {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = async () => {
    try {
      const res = await fetch("/api/agent/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "get_founder_threads", payload: {} }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
    } catch {
      // Keep the current badge if the user is logged out or the network blips.
    }
  };

  useEffect(() => {
    void refreshUnread();
    const poll = window.setInterval(() => void refreshUnread(), 30000);
    const events = new EventSource("/api/talent/realtime");
    events.addEventListener("change", () => void refreshUnread());
    events.onerror = () => {
      events.close();
    };
    return () => {
      window.clearInterval(poll);
      events.close();
    };
  }, []);

  const badge = unreadCount > 0 ? (
    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#ec9149] px-1 text-[10px] font-bold leading-none text-white shadow-[0_1px_2px_rgba(16,24,40,0.15)]">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  ) : null;

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
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-xl text-black/35 transition hover:bg-[#fdfaf7] hover:text-black/70"
          title="Search"
        >
          <Search className="h-5 w-5" />
        </button>
      </nav>
      <div className="flex flex-col items-center gap-4">
        <a
          href="/founder/conversations"
          className={
            active === "conversations"
              ? "relative grid h-11 w-11 place-items-center rounded-xl border border-[#ece7e1] bg-[#fdfaf7] text-[#ec9149]"
              : "relative grid h-11 w-11 place-items-center rounded-xl text-black/35 transition hover:bg-[#fdfaf7] hover:text-black/70"
          }
          title="Conversations"
        >
          <MessageCircle className="h-5 w-5" />
          {badge}
        </a>
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
