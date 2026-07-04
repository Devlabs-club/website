import React, { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth_manager";
import { FounderRail } from "@/components/founder/FounderRail";
import FounderBillingCard from "@/components/founder/FounderBillingCard";
import { CalendarClock, CreditCard, Loader2 } from "lucide-react";

/** Accept only Cal.com / Calendly booking links (mirrors the server check). */
function isValidSchedulingLink(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "cal.com" || host.endsWith(".cal.com") || host === "calendly.com" || host.endsWith(".calendly.com");
  } catch {
    return false;
  }
}

type ProfileState = {
  name: string;
  company: string;
  title: string;
  workEmail: string;
  bio: string;
  schedulingLink: string;
  avatarUrl: string | null;
};

const SchedulingLinkCard: React.FC = () => {
  const [state, setState] = useState<ProfileState | null>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/founder/profile", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.profile) {
          const next: ProfileState = {
            name: data.profile.name || "",
            company: data.profile.company || "",
            title: data.profile.title || "",
            workEmail: data.profile.email || "",
            bio: data.profile.bio || "",
            schedulingLink: data.profile.schedulingLink || "",
            avatarUrl: data.profile.avatarUrl || null,
          };
          setState(next);
          setValue(next.schedulingLink);
        }
      } catch {
        /* ignore — leave blank */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (!isValidSchedulingLink(value)) {
      setError("Enter a valid Cal.com or Calendly link (e.g. https://cal.com/yourname).");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/founder/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...state, schedulingLink: value }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Could not save your scheduling link.");
        return;
      }
      setState((prev) => (prev ? { ...prev, schedulingLink: value } : prev));
      setSaved(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-[28px] border border-[#ece7e1] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05),0_10px_30px_rgba(16,24,40,0.05)] sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fdfaf7] text-[#ec9149]">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-black">Scheduling link</h2>
          <p className="text-sm text-black/45">Your Cal.com or Calendly link — sent to builders over iMessage so they can book an interview.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex h-10 items-center text-black/45">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="https://cal.com/yourname"
            className="h-10 w-full rounded-xl border border-[#ece7e1] bg-[#fffcfa] px-3 text-sm text-black shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-colors placeholder:text-black/35 focus:border-[#ec9149]/50"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ec9149] px-4 text-sm font-semibold text-white hover:bg-[#dd7f36] disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="mt-2 text-sm text-emerald-600">Saved.</p>}
    </section>
  );
};

const FounderSettingsInner: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-white">
      <FounderRail onLogout={() => void logout()} initial={(user?.name || "F").slice(0, 1).toUpperCase()} active="settings" />

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <header className="relative z-10 flex h-16 items-center border-b border-[#ece7e1] px-6 sm:px-8">
          <h1 className="text-lg font-bold tracking-tight text-black">Settings</h1>
        </header>

        <section className="relative z-10 mx-auto w-full max-w-[820px] px-6 py-8 sm:px-8">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fdfaf7] text-[#ec9149]">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-black">Plan & billing</h2>
              <p className="text-sm text-black/45">Manage your subscription, usage, and payment method.</p>
            </div>
          </div>

          <FounderBillingCard />

          <SchedulingLinkCard />
        </section>
      </main>
    </div>
  );
};

export const FounderSettingsPage: React.FC = () => (
  <AuthProvider>
    <FounderSettingsInner />
  </AuthProvider>
);

export default FounderSettingsPage;
