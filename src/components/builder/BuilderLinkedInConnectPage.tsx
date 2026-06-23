import React, { useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Linkedin, Loader2 } from "lucide-react";

const NEXT = "/builder/onboarding/registry-check";

export const BuilderLinkedInConnectPage: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [linkedin, setLinkedin] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/linkedin-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accountType: "builder", linkedin }),
      });
      const data = await res.json();
      if (data.success) window.location.href = data.next || "/builder/onboarding/profile";
      else setError(data.error || "Could not enrich your LinkedIn profile.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <img src="/logo.png" alt="DevLabs" className="mb-8 h-11 w-11 rounded-xl object-contain" />
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Paste your LinkedIn URL or username</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        We use this to pre-fill your builder profile. Projects, skills, and experience can be edited in the next steps.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm text-muted-foreground">LinkedIn profile</span>
          <input
            className="h-12 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
            value={linkedin}
            onChange={(event) => setLinkedin(event.target.value)}
            placeholder="https://linkedin.com/in/yourname or yourname"
            autoComplete="url"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={busy || !linkedin.trim()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A66C2] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Linkedin className="h-5 w-5" />}
          {busy ? "Enriching profile..." : "Continue"}
        </button>
        <a href={NEXT} className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Start manually
        </a>
      </form>
    </AuthShell>
  );
};

export default BuilderLinkedInConnectPage;
