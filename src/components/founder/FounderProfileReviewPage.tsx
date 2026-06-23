import React, { useEffect, useState } from "react";
import { OnboardingStepShell } from "./OnboardingStepShell";
import { Loader2 } from "lucide-react";

const fieldClass =
  "h-12 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40";
const labelClass = "text-sm text-muted-foreground";

interface ProfileState {
  name: string;
  company: string;
  title: string;
  workEmail: string;
  bio: string;
  avatarUrl: string | null;
}

export const FounderProfileReviewPage: React.FC = () => {
  const [state, setState] = useState<ProfileState>({
    name: "",
    company: "",
    title: "",
    workEmail: "",
    bio: "",
    avatarUrl: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/founder/profile", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.profile) {
          setState((s) => ({
            ...s,
            name: data.profile.name || "",
            company: data.profile.company || "",
            title: data.profile.title || "",
            workEmail: data.profile.email || "",
            bio: data.profile.bio || "",
            avatarUrl: data.profile.avatarUrl || null,
          }));
        }
      } catch {
        /* ignore — start blank */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (k: keyof ProfileState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setState((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/founder/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(state),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Could not save your details.");
        return;
      }

      // Go to the company step, where the founder chooses which experience/company
      // to represent before we enrich it.
      window.location.href = data.next || "/founder/onboarding/company";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingStepShell step={1} totalSteps={2}>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Review Your Details</h1>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-full bg-muted">
              {state.avatarUrl ? (
                <img src={state.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <span className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Update image
            </span>
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Full name</label>
            <input className={fieldClass} value={state.name} onChange={update("name")} placeholder="Your name" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className={labelClass}>Working at</label>
              <input className={fieldClass} value={state.company} onChange={update("company")} placeholder="Company" />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Role</label>
              <input className={fieldClass} value={state.title} onChange={update("title")} placeholder="e.g. Hiring Manager" />
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Work Email</label>
            <input className={fieldClass} type="email" value={state.workEmail} onChange={update("workEmail")} placeholder="you@company.com" />
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Bio</label>
            <textarea
              className={`${fieldClass} h-24 resize-none py-3`}
              value={state.bio}
              onChange={update("bio")}
              placeholder="A short bio"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm &amp; continue
          </button>
        </form>
      )}
    </OnboardingStepShell>
  );
};

export default FounderProfileReviewPage;
