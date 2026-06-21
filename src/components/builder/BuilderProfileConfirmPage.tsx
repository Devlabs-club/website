import React, { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { BuilderProfilePreview, type BuilderProfileView } from "./BuilderProfilePreview";
import { Loader2 } from "lucide-react";

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40";
const textareaClass = "min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40";

const emptyProfile: BuilderProfileView = {
  name: "",
  headline: "",
  bio: "",
  location: "",
  universityOrCompany: "",
  rolePreference: [],
  preferredWorkType: [],
  experiences: [],
  projects: [],
  links: {},
};

export const BuilderProfileConfirmPage: React.FC = () => {
  const [profile, setProfile] = useState<BuilderProfileView>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/builder/profile", { credentials: "include" });
        const data = await res.json();
        if (data.success) {
          setProfile(data.profile || { ...emptyProfile, name: data.basics?.name || "", email: data.basics?.email || "" });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (key: keyof BuilderProfileView, value: any) => setProfile((prev) => ({ ...prev, [key]: value }));
  const updateLinks = (key: string, value: string) => setProfile((prev) => ({ ...prev, links: { ...(prev.links || {}), [key]: value } }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/builder/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) window.location.href = "/builder/onboarding/refine";
      else setError(data.error || "Could not save profile.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        {loading ? (
          <div className="col-span-full flex h-60 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-6">
              <h1 className="text-2xl font-semibold tracking-tight">{profile.id ? "Confirm Details" : "Let's Build Your Profile"}</h1>
              <p className="mt-2 text-sm text-muted-foreground">Review the basics. You can refine projects and experience with the assistant next.</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={profile.name || ""} onChange={(v) => update("name", v)} />
                <Field label="Location" value={profile.location || ""} onChange={(v) => update("location", v)} />
                <Field label="Headline" value={profile.headline || ""} onChange={(v) => update("headline", v)} />
                <Field label="School / company" value={profile.universityOrCompany || ""} onChange={(v) => update("universityOrCompany", v)} />
                <Field label="Skills" value={(profile.rolePreference || []).join(", ")} onChange={(v) => update("rolePreference", v.split(",").map((s) => s.trim()).filter(Boolean))} />
                <Field label="Work types" value={(profile.preferredWorkType || []).join(", ")} onChange={(v) => update("preferredWorkType", v.split(",").map((s) => s.trim()).filter(Boolean))} />
                <Field label="GitHub" value={profile.links?.github || ""} onChange={(v) => updateLinks("github", v)} />
                <Field label="Portfolio" value={profile.links?.portfolio || ""} onChange={(v) => updateLinks("portfolio", v)} />
              </div>
              <label className="mt-4 block space-y-2">
                <span className="text-sm text-muted-foreground">Bio</span>
                <textarea className={textareaClass} value={profile.bio || ""} onChange={(e) => update("bio", e.target.value)} />
              </label>
              {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm & continue
              </button>
            </section>
            <BuilderProfilePreview profile={profile} />
          </>
        )}
      </main>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="space-y-2">
    <span className="text-sm text-muted-foreground">{label}</span>
    <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
  </label>
);

export default BuilderProfileConfirmPage;
