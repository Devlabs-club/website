import React, { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth_manager";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { Briefcase, Hammer, Loader2 } from "lucide-react";

type Choice = "founder" | "builder";

function postRoleRedirect(accountType: Choice): string | null {
  if (typeof window === "undefined") return null;
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (!redirect || !redirect.startsWith("/")) return null;
  if (accountType === "founder" && redirect.startsWith("/founder/")) return redirect;
  if (accountType === "builder" && redirect.startsWith("/builder/")) return redirect;
  return null;
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
    className={`group flex w-full flex-col items-start gap-4 rounded-2xl border p-6 text-left transition-all hover:border-foreground/40 hover:shadow-sm disabled:opacity-60 ${
      selected ? "border-foreground/60 ring-1 ring-foreground/20" : "border-border"
    }`}
  >
    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-foreground">
      {busy && selected ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
    </span>
    <span>
      <span className="block text-lg font-semibold text-foreground">{title}</span>
      <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
    </span>
  </button>
);

const SelectRoleInner: React.FC = () => {
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Choice | null>(null);
  const [error, setError] = useState("");

  // Returning users who already chose a role skip this screen.
  useEffect(() => {
    if (!loading && user?.accountType === "founder") window.location.href = postRoleRedirect("founder") || "/founder/home";
    else if (!loading && user?.accountType === "builder") window.location.href = postRoleRedirect("builder") || "/builder/home";
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
        window.location.href = postRoleRedirect(accountType) || data.next;
      } else {
        setError(data.message || "Something went wrong.");
        setBusy(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-2xl">
        <div className="mb-10 text-center">
          <img src="/logo.png" alt="DevLabs" className="mx-auto mb-6 h-11 w-11 rounded-xl object-contain" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">How do you want to use DevLabs?</h1>
          <p className="mt-3 text-sm text-muted-foreground">Pick the option that fits you. You can&apos;t change this later without contacting us.</p>
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

        {error && <p className="mt-6 text-center text-sm text-destructive">{error}</p>}
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
