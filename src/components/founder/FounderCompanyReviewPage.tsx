import React, { useEffect, useState } from "react";
import { OnboardingStepShell } from "./OnboardingStepShell";
import { Building2, Globe, Loader2, MapPin, Plus } from "lucide-react";

const fieldClass =
  "h-12 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40";
const labelClass = "text-sm text-muted-foreground";

interface Experience {
  title: string | null;
  company: string | null;
  companyUsername: string | null;
  companyLinkedInUrl: string | null;
  companyLogoUrl: string | null;
  employmentType: string | null;
  location: string | null;
  dateRange: string | null;
  isCurrent: boolean;
}

interface CompanyState {
  name: string;
  website: string;
  location: string;
  description: string;
  logoUrl: string | null;
}

const EMPTY_COMPANY: CompanyState = {
  name: "",
  website: "",
  location: "",
  description: "",
  logoUrl: null,
};

type Phase = "select" | "confirm";

export const FounderCompanyReviewPage: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("select");
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [state, setState] = useState<CompanyState>(EMPTY_COMPANY);
  const [loading, setLoading] = useState(true);
  const [enrichingIndex, setEnrichingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/founder/profile", { credentials: "include" });
        const data = await res.json();
        if (data.success !== false) {
          const exps: Experience[] = Array.isArray(data?.experiences) ? data.experiences : [];
          const usable = exps.filter((e) => e?.company);
          setExperiences(usable);
          // Prefill the form from any previously-saved company (used if they continue
          // to the confirm step), but keep the selection screen as the entry point.
          const c = data?.company;
          if (c?.name) {
            setState({
              name: c.name || "",
              website: c.website || "",
              location: c.location || "",
              description: c.description || "",
              logoUrl: c.logoUrl || null,
            });
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (k: keyof CompanyState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setState((s) => ({ ...s, [k]: e.target.value }));

  const enrichExperience = async (experience: Experience, index: number) => {
    setEnrichingIndex(index);
    setError("");
    try {
      const res = await fetch("/api/onboarding/founder-company-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          experienceIndex: index,
          company: experience.company,
          companyUsername: experience.companyUsername,
          companyLinkedInUrl: experience.companyLinkedInUrl,
          companyLogoUrl: experience.companyLogoUrl,
          location: experience.location,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const c = data.company || {};
        setState({
          name: c.name || experience.company || "",
          website: c.website || "",
          location: c.location || experience.location || "",
          description: c.description || "",
          logoUrl: c.logoUrl || experience.companyLogoUrl || null,
        });
        setPhase("confirm");
      } else {
        setError(data.error || "Could not enrich that company.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setEnrichingIndex(null);
    }
  };

  const addManually = () => {
    setState(EMPTY_COMPANY);
    setError("");
    setPhase("confirm");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/founder/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(state),
      });
      const data = await res.json();
      if (data.success) window.location.href = data.next || "/founder/onboarding/context";
      else setError(data.error || "Could not save company details.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingStepShell step={2} totalSteps={2}>
      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : phase === "select" ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Choose your company</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick the company you want to set up. We&apos;ll enrich it from the web automatically — or add one yourself.
          </p>

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          {experiences.length === 0 && (
            <p className="mt-6 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              We couldn&apos;t pull any experiences from your LinkedIn yet. You can add your company manually below.
            </p>
          )}

          <div className="mt-6 space-y-3">
            {experiences.map((experience, index) => {
              const busy = enrichingIndex === index;
              const disabled = enrichingIndex !== null;
              return (
                <div
                  key={`${experience.company}-${index}`}
                  className="flex items-center gap-4 rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                    {experience.companyLogoUrl ? (
                      <img src={experience.companyLogoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{experience.company}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[experience.title, experience.dateRange].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => enrichExperience(experience, index)}
                    disabled={disabled}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addManually}
            disabled={enrichingIndex !== null}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Add company manually
          </button>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Review Company Details</h1>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                {state.logoUrl ? (
                  <img src={state.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-muted-foreground">
                    {state.name?.[0]?.toUpperCase() || "C"}
                  </span>
                )}
              </div>
              <span className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Update logo</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className={labelClass}>Company name</label>
                <input
                  className={fieldClass}
                  value={state.name}
                  onChange={update("name")}
                  placeholder="Company name"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Website</label>
                <div className="relative">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className={`${fieldClass} pl-9`}
                    value={state.website}
                    onChange={update("website")}
                    placeholder="www.example.com"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>Location</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className={`${fieldClass} pr-9`}
                  value={state.location}
                  onChange={update("location")}
                  placeholder="City, Country"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>About</label>
              <textarea
                className={`${fieldClass} h-28 resize-none py-3`}
                value={state.description}
                onChange={update("description")}
                placeholder="What does your company do?"
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setPhase("select");
                }}
                className="h-12 rounded-xl border border-border px-5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm &amp; continue
              </button>
            </div>
          </form>
        </>
      )}
    </OnboardingStepShell>
  );
};

export default FounderCompanyReviewPage;
