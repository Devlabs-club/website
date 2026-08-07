import React, { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth_manager";
import { resolvePostAuthDestination } from "@/lib/authDestination";
import { Briefcase, Hammer, Loader2 } from "lucide-react";

type Choice = "founder" | "builder";

function redirectParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("redirect");
}

/** Auth funnel stays light — match login/signup, ignore stored dark preference. */
function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const prevScheme = root.style.colorScheme;
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    return () => {
      if (hadDark) root.classList.add("dark");
      root.style.colorScheme = prevScheme || "";
    };
  }, []);
}

const RoleCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  busy: boolean;
  onClick: () => void;
}> = ({ title, description, icon, selected, busy, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    className={`group flex w-full flex-col items-start gap-4 rounded-2xl border bg-white p-6 text-left transition-all hover:border-[#ff7417]/50 hover:bg-[#fffaf7] disabled:opacity-60 ${
      selected
        ? "border-[#ff7417] ring-1 ring-[#ff7417]/30 shadow-[0_12px_28px_rgba(255,116,23,0.12)]"
        : "border-black/10 shadow-[0_8px_20px_rgba(5,5,5,0.04)]"
    }`}
  >
    <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-black/8 bg-[#fff5ef] text-[#bf4f08]">
      {busy && selected ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
    </span>
    <span>
      <span className="block text-lg font-semibold text-[#050505]">{title}</span>
      <span className="mt-1 block text-sm text-black/50">{description}</span>
    </span>
  </button>
);

const SelectRoleInner: React.FC = () => {
  useForceLightTheme();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Choice | null>(null);
  const [error, setError] = useState("");

  // Returning users who already chose a role skip this screen entirely.
  // Claim links (/founder/claim/...) also bypass — destination helper routes them through.
  useEffect(() => {
    if (loading || !user) return;
    const next = resolvePostAuthDestination(user, redirectParam());
    if (next.startsWith("/auth/select-role")) return;
    window.location.replace(next);
  }, [loading, user]);

  const choose = async (accountType: Choice) => {
    setSelected(accountType);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accountType }),
      });
      const data = await res.json();
      if (data.success) {
        const redirect = redirectParam();
        // Claim / deep links win; otherwise honor server onboarding destination.
        if (redirect?.startsWith("/founder/claim/")) {
          window.location.href = redirect;
        } else if (redirect?.startsWith("/founder/") || redirect?.startsWith("/builder/")) {
          window.location.href = resolvePostAuthDestination({ accountType, role: accountType }, redirect);
        } else {
          window.location.href = data.next || resolvePostAuthDestination({ accountType, role: accountType }, null);
        }
      } else {
        setError(data.message || "Something went wrong.");
        setBusy(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  };

  // Avoid flashing the chooser while we redirect assigned users / claim links.
  if (loading || (user && !resolvePostAuthDestination(user, redirectParam()).startsWith("/auth/select-role"))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbf6f3] text-black/40">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#fbf6f3] px-6 py-16 text-[#050505]">
      <div className="w-full max-w-2xl">
        <div className="mb-10 text-center">
          <img src="/logo.png" alt="DevLabs" className="mx-auto mb-6 h-11 w-11 rounded-xl object-contain" />
          <h1 className="text-3xl font-bold tracking-tight text-[#050505]">How do you want to use DevLabs?</h1>
          <p className="mt-3 text-sm text-black/45">
            Pick the option that fits you. You can&apos;t change this later without contacting us.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <RoleCard
            title="I'm looking to hire"
            description="Find proof-of-work builders for your roles and invite them."
            icon={<Briefcase className="h-5 w-5" />}
            selected={selected === "founder"}
            busy={busy}
            onClick={() => choose("founder")}
          />
          <RoleCard
            title="I'm a builder"
            description="Build your profile and get discovered by founders."
            icon={<Hammer className="h-5 w-5" />}
            selected={selected === "builder"}
            busy={busy}
            onClick={() => choose("builder")}
          />
        </div>

        {error ? <p className="mt-6 text-center text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
};

export const AuthSelectRolePage: React.FC = () => (
  <AuthProvider>
    <SelectRoleInner />
  </AuthProvider>
);

export default AuthSelectRolePage;
