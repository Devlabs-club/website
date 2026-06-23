import React, { useRef, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { AlertCircle, CheckCircle2, FileText, Github, Linkedin, Loader2, Upload } from "lucide-react";

type MissingLink = "github" | "linkedin";
type GithubProjectOption = {
  projectName: string;
  description?: string | null;
  builderContribution?: string | null;
  techStack?: string[];
  links?: { github?: string | null; demo?: string | null };
  source?: string;
  sourceId: string;
  confidence?: number;
};

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40";

export const BuilderResumeOnboardingPage: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [missingLinks, setMissingLinks] = useState<MissingLink[]>([]);
  const [links, setLinks] = useState({ github: "", linkedin: "" });
  const [githubProjectOptions, setGithubProjectOptions] = useState<GithubProjectOption[]>([]);
  const [selectedGithubProjectIds, setSelectedGithubProjectIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [scanComplete, setScanComplete] = useState(false);

  const uploadResume = async (file: File) => {
    setBusy(true);
    setError("");
    setStatus("Scanning resume and building your profile...");
    setScanComplete(false);
    const formData = new FormData();
    formData.append("resume", file);

    try {
      const res = await fetch("/api/builder/onboarding/resume", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || data.message || "Could not scan your resume.");
        return;
      }

      setScanComplete(true);
      setMissingLinks(data.missingLinks || []);
      setGithubProjectOptions(data.githubProjectOptions || []);
      setSelectedGithubProjectIds([]);
      setLinks({
        github: data.links?.github || "",
        linkedin: data.links?.linkedin || "",
      });

      if (data.missingLinks?.length) {
        setStatus("Resume scanned. Add the missing profile links so we can enrich the rest.");
      } else if (data.githubProjectOptions?.length) {
        setStatus("GitHub scanned. Choose which projects should appear on your profile.");
      } else {
        setStatus("Profile built. Opening review...");
        window.setTimeout(() => {
          window.location.href = data.next || "/builder/onboarding/profile";
        }, 650);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitLinks = async () => {
    setBusy(true);
    setError("");
    setStatus("Enriching profile from your links...");
    try {
      const res = await fetch("/api/builder/onboarding/resume", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(links),
      });
      const data = await res.json();
      if (data.success) {
        setMissingLinks(data.missingLinks || []);
        setGithubProjectOptions(data.githubProjectOptions || []);
        setSelectedGithubProjectIds([]);
        if (data.missingLinks?.length) {
          setStatus("Add the remaining missing links to continue.");
        } else if (data.githubProjectOptions?.length) {
          setStatus("GitHub scanned. Choose which projects should appear on your profile.");
        } else {
          window.location.href = data.next || "/builder/onboarding/profile";
        }
      } else {
        setError(data.error || "Could not enrich those links.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleGithubProject = (sourceId: string) => {
    setSelectedGithubProjectIds((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const submitGithubProjects = async () => {
    setBusy(true);
    setError("");
    setStatus("Saving selected projects...");
    const selectedGithubProjects = githubProjectOptions.filter((project) =>
      selectedGithubProjectIds.includes(project.sourceId)
    );

    try {
      const res = await fetch("/api/builder/onboarding/resume", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          githubProjectSelectionComplete: true,
          selectedGithubProjects,
        }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = data.next || "/builder/onboarding/profile";
      } else {
        setError(data.error || "Could not save selected projects.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const selectedMissing = missingLinks.filter((key) => !links[key].trim());
  const showGithubProjectPicker = scanComplete && missingLinks.length === 0 && githubProjectOptions.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-2xl items-center px-4 py-10">
        <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#fa7d22]/10 text-[#fa7d22]">
            <FileText className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Upload your resume</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We will extract your skills, links, experience, and strongest projects, then use GitHub and LinkedIn when available to build a better profile.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              void uploadResume(file);
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="mt-6 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background px-5 py-10 text-center transition-colors hover:border-foreground/40 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : <Upload className="h-7 w-7 text-muted-foreground" />}
            <span className="mt-3 text-sm font-medium">{fileName || "Choose PDF resume"}</span>
            <span className="mt-1 text-xs text-muted-foreground">PDF only, up to 10MB</span>
          </button>

          {scanComplete && (
            <div className="mt-5 rounded-2xl border border-border bg-background p-4">
              <div className="flex items-start gap-3">
                {missingLinks.length ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#fa7d22]" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{missingLinks.length ? "Add missing links" : "Links found"}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {missingLinks.length
                      ? "These help us pull your profile photo, GitHub projects, skills, and profile details."
                      : "We found enough links to continue to profile review."}
                  </p>
                </div>
              </div>

              {missingLinks.length > 0 && (
                <div className="mt-4 space-y-3">
                  {missingLinks.includes("github") && (
                    <label className="block space-y-2">
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Github className="h-4 w-4" /> GitHub profile
                      </span>
                      <input
                        className={inputClass}
                        value={links.github}
                        onChange={(event) => setLinks((prev) => ({ ...prev, github: event.target.value }))}
                        placeholder="https://github.com/yourname"
                        autoComplete="url"
                      />
                    </label>
                  )}
                  {missingLinks.includes("linkedin") && (
                    <label className="block space-y-2">
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Linkedin className="h-4 w-4" /> LinkedIn profile
                      </span>
                      <input
                        className={inputClass}
                        value={links.linkedin}
                        onChange={(event) => setLinks((prev) => ({ ...prev, linkedin: event.target.value }))}
                        placeholder="https://linkedin.com/in/yourname"
                        autoComplete="url"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={submitLinks}
                    disabled={busy || selectedMissing.length > 0}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Continue to profile review
                  </button>
                </div>
              )}

              {showGithubProjectPicker && (
                <div className="mt-5 border-t border-border pt-4">
                  <div className="flex items-start gap-3">
                    <Github className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Choose GitHub projects for your profile</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Select only the projects you want founders to see. You can continue without selecting any.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
                    {githubProjectOptions.map((project) => {
                      const checked = selectedGithubProjectIds.includes(project.sourceId);
                      return (
                        <label
                          key={project.sourceId}
                          className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${
                            checked ? "border-foreground/50 bg-muted" : "border-border bg-background hover:border-foreground/30"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-border"
                            checked={checked}
                            onChange={() => toggleGithubProject(project.sourceId)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground">{project.projectName}</span>
                            {project.description && (
                              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                                {project.description}
                              </span>
                            )}
                            {(project.techStack || []).length > 0 && (
                              <span className="mt-2 flex flex-wrap gap-1.5">
                                {(project.techStack || []).slice(0, 8).map((tech) => (
                                  <span key={tech} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {tech}
                                  </span>
                                ))}
                              </span>
                            )}
                            {project.links?.github && (
                              <span className="mt-2 block truncate text-xs text-muted-foreground">{project.links.github}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={submitGithubProjects}
                    disabled={busy}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Continue with {selectedGithubProjectIds.length} selected
                  </button>
                </div>
              )}
            </div>
          )}

          {status && <p className="mt-4 text-sm text-muted-foreground">{status}</p>}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </section>
      </main>
    </div>
  );
};

export default BuilderResumeOnboardingPage;
