import React, { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { BuilderProfilePreview, type BuilderProfileView } from "./BuilderProfilePreview";
import { Briefcase, Code2, Loader2, Send, Sparkles, Wrench } from "lucide-react";

const options = [
  { id: "experience", label: "Add Experience", icon: Briefcase },
  { id: "project", label: "Add New Project", icon: Code2 },
  { id: "skills", label: "Add Skill Set", icon: Sparkles },
  { id: "something", label: "Something Else", icon: Wrench },
] as const;

export const BuilderProfileRefinePage: React.FC = () => {
  const [profile, setProfile] = useState<BuilderProfileView | null>(null);
  const [intent, setIntent] = useState<(typeof options)[number]["id"]>("project");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/builder/profile", { credentials: "include" });
      const data = await res.json();
      if (data.success) setProfile(data.profile);
      setLoading(false);
    })();
  }, []);

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/builder/profile/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ intent, message }),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.profile);
        setMessage("");
        setStatus(data.message || "Updated.");
      } else {
        setStatus(data.error || "Could not refine profile.");
      }
    } catch {
      setStatus("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    window.location.href = "/builder/home";
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        {loading ? (
          <div className="col-span-full flex h-60 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !profile ? (
          <p className="col-span-full rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Create your builder profile first.
          </p>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-6">
              <h1 className="text-2xl font-semibold tracking-tight">Build Your Profile & Get Seen by Founders</h1>
              <p className="mt-2 text-sm text-muted-foreground">Choose what to update, then describe it in plain English.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {options.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setIntent(option.id)}
                      className={`flex items-center gap-3 rounded-2xl border p-4 text-left text-sm font-medium transition-colors hover:bg-muted ${
                        intent === option.id ? "border-foreground/50 bg-muted" : "border-border"
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 rounded-2xl border border-border p-3">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Suggest changes..."
                  className="min-h-32 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">{status || "Profile preview updates after each suggestion."}</p>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy || !message.trim()}
                    aria-label="Send"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={save}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
              >
                Save
              </button>
            </section>
            <BuilderProfilePreview profile={profile} />
          </>
        )}
      </main>
    </div>
  );
};

export default BuilderProfileRefinePage;
