import React, { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { fetchEnrichmentJson } from "@/lib/enrichmentFetch";
import { AnimatePresence, motion } from "framer-motion";
import { Linkedin, Loader2, Sparkles } from "lucide-react";

const NEXT = "/founder/onboarding/profile?step=profile";

const SCRAPE_MESSAGES = [
  "Connecting to LinkedIn…",
  "Reading your profile…",
  "Collecting work experience…",
  "Pulling company details…",
  "Almost there…",
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const FounderLinkedInConnectPage: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeMessageIndex, setScrapeMessageIndex] = useState(0);
  const [linkedin, setLinkedin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!scraping) return;
    const id = window.setInterval(() => {
      setScrapeMessageIndex((i) => (i + 1) % SCRAPE_MESSAGES.length);
    }, 2_400);
    return () => window.clearInterval(id);
  }, [scraping]);

  const waitForEnrichment = async () => {
    setScraping(true);
    setScrapeMessageIndex(0);
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      const res = await fetch("/api/founder/profile", { credentials: "include" });
      const data = await res.json().catch(() => null);
      const status = data?.enrichmentStatus;
      if (status === "pending") {
        await sleep(2_000);
        continue;
      }
      const company = typeof data?.profile?.company === "string" ? data.profile.company.trim() : "";
      const looksReady =
        Boolean(company) &&
        company !== "My company" &&
        (Boolean(data?.profile?.title) ||
          Boolean(data?.profile?.bio) ||
          Boolean(data?.profile?.avatarUrl) ||
          (Array.isArray(data?.experiences) && data.experiences.length > 0));
      if (status === "complete" || status === "partial" || status === "failed" || looksReady) {
        window.location.href = NEXT;
        return;
      }
      await sleep(2_000);
    }
    window.location.href = NEXT;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await fetchEnrichmentJson<{ success?: boolean; error?: string; next?: string; queued?: boolean }>(
        "/api/onboarding/linkedin-enrichment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountType: "founder", linkedin }),
          timeoutMs: 45_000,
        }
      );
      if (!data.success) {
        setError(data.error || "Could not enrich your LinkedIn profile.");
        return;
      }
      if (data.queued) {
        await waitForEnrichment();
        return;
      }
      window.location.href = data.next || NEXT;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (scraping) {
    return (
      <AuthShell>
        <div className="flex min-h-[22rem] flex-col items-center justify-center px-2 text-center">
          <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#0A66C2]/15" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[#0A66C2]/25 bg-[#0A66C2]/10">
              <Sparkles className="h-7 w-7 text-[#0A66C2]" />
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Collecting your LinkedIn info</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            We’re scraping your profile so we can pre-fill the next step. This usually takes under a minute.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm font-medium text-[#0A66C2]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AnimatePresence mode="wait">
              <motion.span
                key={scrapeMessageIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                {SCRAPE_MESSAGES[scrapeMessageIndex]}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <img src="/logo.png" alt="DevLabs" className="mb-8 h-11 w-11 rounded-xl object-contain" />
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Paste your LinkedIn URL or username</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        We use this to pre-fill your founder profile. After you confirm it, we will enrich your company profile from the same LinkedIn signal.
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
          {busy ? "Starting LinkedIn scrape…" : "Continue"}
        </button>

        <a
          href={NEXT}
          className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Skip for now
        </a>
      </form>
    </AuthShell>
  );
};

export default FounderLinkedInConnectPage;
