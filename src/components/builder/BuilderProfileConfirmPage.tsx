import React, { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { BuilderProfilePreview, type BuilderProfileView } from "./BuilderProfilePreview";
import { Loader2, Plus, Trash2, X } from "lucide-react";

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40";
const textareaClass = "min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40";
const smallButtonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50";

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

type ProjectDraft = NonNullable<BuilderProfileView["projects"]>[number];

function normalizeProject(project?: Partial<ProjectDraft>): ProjectDraft {
  return {
    id: project?.id,
    projectName: project?.projectName || "",
    description: project?.description || "",
    problemSolved: project?.problemSolved || "",
    builderContribution: project?.builderContribution || "",
    techStack: project?.techStack || [],
    links: project?.links || {},
    source: project?.source || "manual",
    sourceId: project?.sourceId || `manual-${Date.now()}`,
  };
}

export const BuilderProfileConfirmPage: React.FC = () => {
  const [profile, setProfile] = useState<BuilderProfileView>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newSkill, setNewSkill] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/builder/profile", { credentials: "include" });
        const data = await res.json();
        if (data.success) {
          setProfile({
            ...(data.profile || { ...emptyProfile, name: data.basics?.name || "", email: data.basics?.email || "" }),
            avatarUrl: data.basics?.avatarUrl || data.profile?.avatarUrl || null,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (key: keyof BuilderProfileView, value: any) => setProfile((prev) => ({ ...prev, [key]: value }));
  const updateLinks = (key: string, value: string) => setProfile((prev) => ({ ...prev, links: { ...(prev.links || {}), [key]: value } }));
  const addSkill = () => {
    const skill = newSkill.trim();
    if (!skill) return;
    setProfile((prev) => ({
      ...prev,
      rolePreference: [...new Set([...(prev.rolePreference || []), skill])],
    }));
    setNewSkill("");
  };
  const removeSkill = (skill: string) => {
    setProfile((prev) => ({
      ...prev,
      rolePreference: (prev.rolePreference || []).filter((item) => item !== skill),
    }));
  };
  const addProject = () => {
    setProfile((prev) => ({
      ...prev,
      projects: [...(prev.projects || []), normalizeProject({ projectName: "New project" })],
    }));
  };
  const removeProject = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      projects: (prev.projects || []).filter((_, projectIndex) => projectIndex !== index),
    }));
  };
  const updateProject = (index: number, patch: Partial<ProjectDraft>) => {
    setProfile((prev) => ({
      ...prev,
      projects: (prev.projects || []).map((project, projectIndex) =>
        projectIndex === index ? normalizeProject({ ...project, ...patch }) : project
      ),
    }));
  };
  const updateProjectLink = (index: number, key: string, value: string) => {
    setProfile((prev) => ({
      ...prev,
      projects: (prev.projects || []).map((project, projectIndex) =>
        projectIndex === index
          ? normalizeProject({ ...project, links: { ...(project.links || {}), [key]: value } })
          : project
      ),
    }));
  };

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
              <p className="mt-2 text-sm text-muted-foreground">Review what we found. Edit skills and projects before founders see this profile.</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={profile.name || ""} onChange={(v) => update("name", v)} />
                <Field label="Location" value={profile.location || ""} onChange={(v) => update("location", v)} />
                <Field label="Headline" value={profile.headline || ""} onChange={(v) => update("headline", v)} />
                <Field label="School / company" value={profile.universityOrCompany || ""} onChange={(v) => update("universityOrCompany", v)} />
                <Field label="Work types" value={(profile.preferredWorkType || []).join(", ")} onChange={(v) => update("preferredWorkType", v.split(",").map((s) => s.trim()).filter(Boolean))} />
                <Field label="GitHub" value={profile.links?.github || ""} onChange={(v) => updateLinks("github", v)} />
                <Field label="LinkedIn" value={profile.links?.linkedin || ""} onChange={(v) => updateLinks("linkedin", v)} />
                <Field label="Portfolio" value={profile.links?.portfolio || ""} onChange={(v) => updateLinks("portfolio", v)} />
              </div>
              <label className="mt-4 block space-y-2">
                <span className="text-sm text-muted-foreground">Bio</span>
                <textarea className={textareaClass} value={profile.bio || ""} onChange={(e) => update("bio", e.target.value)} />
              </label>

              <section className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Skills</h2>
                  <div className="flex min-w-0 flex-1 justify-end gap-2">
                    <input
                      className="h-9 w-full max-w-56 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40"
                      value={newSkill}
                      onChange={(event) => setNewSkill(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="Add skill"
                    />
                    <button type="button" onClick={addSkill} className={smallButtonClass} aria-label="Add skill">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(profile.rolePreference || []).map((skill) => (
                    <span key={skill} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-sm">
                      {skill}
                      <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {!(profile.rolePreference || []).length && <p className="text-sm text-muted-foreground">No skills added yet.</p>}
                </div>
              </section>

              <section className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Projects</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Edit, delete, or add proof-of-work projects.</p>
                  </div>
                  <button type="button" onClick={addProject} className={smallButtonClass}>
                    <Plus className="h-4 w-4" /> Add
                  </button>
                </div>
                <div className="mt-4 space-y-4">
                  {(profile.projects || []).map((project, index) => (
                    <div key={project.id || project.sourceId || index} className="rounded-2xl border border-border bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <Field label="Project name" value={project.projectName || ""} onChange={(v) => updateProject(index, { projectName: v })} />
                        <button
                          type="button"
                          onClick={() => removeProject(index)}
                          className="mt-7 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Delete ${project.projectName || "project"}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <label className="mt-4 block space-y-2">
                        <span className="text-sm text-muted-foreground">Description</span>
                        <textarea className={textareaClass} value={project.description || ""} onChange={(e) => updateProject(index, { description: e.target.value })} />
                      </label>
                      <label className="mt-4 block space-y-2">
                        <span className="text-sm text-muted-foreground">Your contribution</span>
                        <textarea className={textareaClass} value={project.builderContribution || ""} onChange={(e) => updateProject(index, { builderContribution: e.target.value })} />
                      </label>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Tech stack"
                          value={(project.techStack || []).join(", ")}
                          onChange={(v) => updateProject(index, { techStack: v.split(",").map((s) => s.trim()).filter(Boolean) })}
                        />
                        <Field label="GitHub" value={project.links?.github || ""} onChange={(v) => updateProjectLink(index, "github", v)} />
                        <Field label="Demo" value={project.links?.demo || ""} onChange={(v) => updateProjectLink(index, "demo", v)} />
                      </div>
                    </div>
                  ))}
                  {!(profile.projects || []).length && (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No projects added yet.
                    </div>
                  )}
                </div>
              </section>

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
