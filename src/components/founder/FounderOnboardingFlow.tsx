import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  founderFieldClass,
  founderHeadingClass,
  founderLabelClass,
  founderStepClass,
  founderSubtextClass,
  founderTextareaClass,
} from "@/components/founder/founderOnboardingStyles";
import { fetchEnrichmentJson } from "@/lib/enrichmentFetch";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Globe, Linkedin, Loader2, MapPin, Plus, Sparkles } from "lucide-react";

const SCRAPE_MESSAGES = [
  "Connecting to LinkedIn…",
  "Reading your profile…",
  "Collecting work experience…",
  "Pulling company details…",
  "Almost there…",
];

const ENRICHMENT_POLL_MS = 2_000;
const ENRICHMENT_TIMEOUT_MS = 90_000;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function enrichmentFinished(status: string | null | undefined): boolean {
  return status === "complete" || status === "partial" || status === "failed";
}

function profileLooksEnriched(data: any): boolean {
  // While a scrape is in flight, never treat leftover/previous fields as done.
  // Re-queue clears them; this guard covers any race before the clear lands.
  if (data?.enrichmentStatus === "pending") return false;
  const profile = data?.profile;
  if (!profile) return false;
  const company = typeof profile.company === "string" ? profile.company.trim() : "";
  const hasCompany = Boolean(company) && company !== "My company";
  const hasTitle = Boolean(profile.title);
  const hasBio = Boolean(profile.bio);
  const hasAvatar = Boolean(profile.avatarUrl);
  const experienceCount = Array.isArray(data?.experiences) ? data.experiences.length : 0;
  return hasCompany && (hasTitle || hasBio || hasAvatar || experienceCount > 0);
}

type FlowStep = "linkedin" | "profile" | "experiences";
type ExperiencePhase = "select" | "confirm";

interface ProfileState {
  name: string;
  company: string;
  title: string;
  workEmail: string;
  bio: string;
  schedulingLink: string;
  avatarUrl: string | null;
}

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

const EMPTY_PROFILE: ProfileState = {
  name: "",
  company: "",
  title: "",
  workEmail: "",
  bio: "",
  schedulingLink: "",
  avatarUrl: null,
};

const EMPTY_COMPANY: CompanyState = {
  name: "",
  website: "",
  location: "",
  description: "",
  logoUrl: null,
};

const DRAFT_CACHE_KEY = "founderOnboardingDraft.v1";

function readDraftCache(): {
  profile?: ProfileState;
  experiences?: Experience[];
  company?: CompanyState;
  linkedin?: string;
} | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraftCache(patch: {
  profile?: ProfileState;
  experiences?: Experience[];
  company?: CompanyState;
  linkedin?: string;
}) {
  try {
    const prev = readDraftCache() || {};
    sessionStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* ignore quota */
  }
}

function clearDraftCache() {
  try {
    sessionStorage.removeItem(DRAFT_CACHE_KEY);
  } catch {
    /* ignore */
  }
}


function isValidSchedulingLink(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (
      host === "cal.com" ||
      host.endsWith(".cal.com") ||
      host === "calendly.com" ||
      host.endsWith(".calendly.com")
    );
  } catch {
    return false;
  }
}

function normalizeCompanyWebsite(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function stepFromLocation(): FlowStep {
  if (typeof window === "undefined") return "linkedin";
  const params = new URLSearchParams(window.location.search);
  const step = params.get("step");
  if (step === "profile") return "profile";
  if (step === "experiences" || step === "company") return "experiences";
  const path = window.location.pathname;
  if (path.includes("/profile")) return "profile";
  if (path.includes("/company")) return "experiences";
  return "linkedin";
}

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? "-100%" : "100%", opacity: 0 }),
};

export const FounderOnboardingFlow: React.FC = () => {
  const [step, setStep] = useState<FlowStep>(stepFromLocation);
  const [direction, setDirection] = useState(1);
  const [linkedin, setLinkedin] = useState("");
  const [linkedinBusy, setLinkedinBusy] = useState(false);

  const [profile, setProfile] = useState<ProfileState>(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(stepFromLocation() !== "linkedin");
  const [profileEnriching, setProfileEnriching] = useState(false);
  const [scrapeMessageIndex, setScrapeMessageIndex] = useState(0);
  const [profileSaving, setProfileSaving] = useState(false);

  const [experiencePhase, setExperiencePhase] = useState<ExperiencePhase>("select");
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [selectedExperienceIndex, setSelectedExperienceIndex] = useState<number | null>(null);
  const [company, setCompany] = useState<CompanyState>(EMPTY_COMPANY);
  const [experiencesLoading, setExperiencesLoading] = useState(false);
  const [enrichingIndex, setEnrichingIndex] = useState<number | null>(null);
  const [companySaving, setCompanySaving] = useState(false);

  const [error, setError] = useState("");

  const goTo = useCallback((next: FlowStep, dir = 1) => {
    setDirection(dir);
    setError("");
    setStep(next);
    const url = new URL(window.location.href);
    url.pathname = "/founder/onboarding/linkedin";
    url.searchParams.set("step", next === "linkedin" ? "linkedin" : next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, []);

  const applyProfilePayload = useCallback((data: any) => {
    if (!data?.profile) return;
    const company = data.profile.company || "";
    const nextProfile: ProfileState = {
      name: data.profile.name || "",
      company: company === "My company" && data.enrichmentStatus === "pending" ? "" : company,
      title: data.profile.title || "",
      workEmail: data.profile.email || "",
      bio: data.profile.bio || "",
      schedulingLink: data.profile.schedulingLink || "",
      avatarUrl: data.profile.avatarUrl || null,
    };
    setProfile((s) => ({
      ...s,
      ...nextProfile,
      // Keep scheduling link the founder already typed in this session.
      schedulingLink: s.schedulingLink || nextProfile.schedulingLink,
    }));
    if (Array.isArray(data.experiences)) {
      const exps = data.experiences.filter((e: Experience) => e?.company);
      setExperiences(exps);
      const currentIdx = exps.findIndex((e: Experience) => e.isCurrent);
      setSelectedExperienceIndex(currentIdx >= 0 ? currentIdx : exps.length ? 0 : null);
      writeDraftCache({
        profile: { ...nextProfile, schedulingLink: nextProfile.schedulingLink },
        experiences: exps,
        linkedin: data.profile.linkedin || undefined,
      });
    }
  }, []);

  const loadProfile = useCallback(async (opts?: { keepLoading?: boolean }) => {
    if (!opts?.keepLoading) setProfileLoading(true);
    try {
      const res = await fetch("/api/founder/profile", { credentials: "include" });
      const data = await res.json();
      if (data.success !== false) {
        applyProfilePayload(data);
        return data as { enrichmentStatus?: string | null; profile?: ProfileState; experiences?: Experience[] };
      }
    } catch {
      /* start blank */
    } finally {
      if (!opts?.keepLoading) setProfileLoading(false);
    }
    return null;
  }, [applyProfilePayload]);

  const waitForLinkedInEnrichment = useCallback(async (signal?: AbortSignal) => {
    setProfileEnriching(true);
    setProfileLoading(false);
    setScrapeMessageIndex(0);
    const deadline = Date.now() + ENRICHMENT_TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        if (signal?.aborted) return;
        const res = await fetch("/api/founder/profile", { credentials: "include", signal });
        const data = await res.json().catch(() => null);
        if (data && data.success !== false) {
          applyProfilePayload(data);
          if (enrichmentFinished(data.enrichmentStatus) || profileLooksEnriched(data)) {
            if (data.enrichmentStatus === "failed") {
              setError("We couldn’t finish reading LinkedIn. You can fill in your details manually.");
            }
            return;
          }
        }
        await sleep(ENRICHMENT_POLL_MS, signal);
      }
      setError("LinkedIn is taking longer than usual — you can keep editing while we finish in the background.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Could not refresh scraped details. You can fill them in manually.");
    } finally {
      if (!signal?.aborted) setProfileEnriching(false);
      setProfileLoading(false);
    }
  }, [applyProfilePayload]);

  const skipEnrichmentWait = useCallback(() => {
    setProfileEnriching(false);
    setProfileLoading(false);
    setError("You can fill these in manually — we’ll keep trying LinkedIn in the background.");
  }, []);

  const loadExperiences = useCallback(async () => {
    setExperiencesLoading(true);
    try {
      const res = await fetch("/api/founder/profile", { credentials: "include" });
      const data = await res.json();
      if (data.success !== false) {
        const exps: Experience[] = Array.isArray(data?.experiences) ? data.experiences : [];
        const filtered = exps.filter((e) => e?.company);
        setExperiences(filtered);
        const currentIdx = filtered.findIndex((e) => e.isCurrent);
        setSelectedExperienceIndex((prev) =>
          prev !== null && prev < filtered.length
            ? prev
            : currentIdx >= 0
              ? currentIdx
              : filtered.length
                ? 0
                : null
        );
        const c = data?.company;
        if (c?.name) {
          setCompany({
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
      setExperiencesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step !== "profile") return;
    const controller = new AbortController();
    (async () => {
      // Prefer session draft after a Back→Continue cycle so we never flash wiped DB.
      const cached = readDraftCache();
      if (cached?.profile && (cached.profile.company || cached.profile.title || cached.profile.bio)) {
        setProfile((s) => ({ ...s, ...cached.profile }));
        if (cached.experiences) {
          const exps = cached.experiences.filter((e) => e?.company);
          setExperiences(exps);
          const currentIdx = exps.findIndex((e) => e.isCurrent);
          setSelectedExperienceIndex(currentIdx >= 0 ? currentIdx : exps.length ? 0 : null);
        }
        setProfileLoading(false);
        setProfileEnriching(false);
        return;
      }

      setProfileLoading(true);
      try {
        const data = await loadProfile({ keepLoading: true });
        if (controller.signal.aborted) return;
        if (data?.enrichmentStatus === "pending") {
          await waitForLinkedInEnrichment(controller.signal);
        } else if (data?.enrichmentStatus === "failed") {
          setProfile((s) => ({
            ...EMPTY_PROFILE,
            workEmail: s.workEmail || data?.profile?.email || "",
            name: s.name || data?.profile?.name || "",
          }));
          setExperiences([]);
          setProfileLoading(false);
          setProfileEnriching(false);
        } else {
          setProfileLoading(false);
          setProfileEnriching(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setProfileLoading(false);
          setProfileEnriching(false);
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [step, loadProfile, waitForLinkedInEnrichment]);

  useEffect(() => {
    if (step !== "experiences") return;
    const cached = readDraftCache();
    if (cached?.experiences?.length && experiences.length === 0) {
      const exps = cached.experiences.filter((e) => e?.company);
      setExperiences(exps);
      const currentIdx = exps.findIndex((e) => e.isCurrent);
      setSelectedExperienceIndex(currentIdx >= 0 ? currentIdx : exps.length ? 0 : null);
    }
    if (cached?.company?.name) setCompany(cached.company);
    if (experiences.length === 0) void loadExperiences();
  }, [step, loadExperiences, experiences.length]);

  useEffect(() => {
    if (!profileEnriching) return;
    const id = window.setInterval(() => {
      setScrapeMessageIndex((i) => (i + 1) % SCRAPE_MESSAGES.length);
    }, 2_400);
    return () => window.clearInterval(id);
  }, [profileEnriching]);

  const submitLinkedIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLinkedinBusy(true);
    setError("");
    // New scrape — drop any previous draft so Back→retry cannot resurrect it.
    clearDraftCache();
    setProfile(EMPTY_PROFILE);
    setExperiences([]);
    setSelectedExperienceIndex(null);
    setCompany(EMPTY_COMPANY);
    setExperiencePhase("select");
    try {
      const { data } = await fetchEnrichmentJson<{ success?: boolean; error?: string; queued?: boolean }>(
        "/api/onboarding/linkedin-enrichment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountType: "founder", linkedin }),
          timeoutMs: 45_000,
        }
      );
      if (data.success) {
        writeDraftCache({ linkedin });
        goTo("profile");
      } else {
        setError(data.error || "Could not load your LinkedIn profile.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLinkedinBusy(false);
    }
  };

  const skipLinkedIn = () => {
    clearDraftCache();
    setProfile(EMPTY_PROFILE);
    setExperiences([]);
    goTo("profile");
  };

  const goBackToLinkedIn = () => {
    setProfileEnriching(false);
    setProfileLoading(false);
    setError("");
    setProfile(EMPTY_PROFILE);
    setExperiences([]);
    setSelectedExperienceIndex(null);
    setCompany(EMPTY_COMPANY);
    setExperiencePhase("select");
    clearDraftCache();
    void fetch("/api/onboarding/discard-linkedin-draft", {
      method: "POST",
      credentials: "include",
    }).catch(() => null);
    goTo("linkedin", -1);
  };

  const updateProfile = (k: keyof ProfileState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setProfile((s) => {
      const next = { ...s, [k]: e.target.value };
      writeDraftCache({ profile: next });
      return next;
    });

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidSchedulingLink(profile.schedulingLink)) {
      setError("Add a valid Cal.com or Calendly link so builders can book an interview with you.");
      return;
    }
    setProfileSaving(true);
    setError("");
    try {
      // Step 1 stays client/cache-only. Persist only when step 2 is confirmed.
      writeDraftCache({ profile, experiences, linkedin });
      goTo("experiences");
    } finally {
      setProfileSaving(false);
    }
  };

  const updateCompany = (k: keyof CompanyState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCompany((s) => {
      const next = { ...s, [k]: e.target.value };
      writeDraftCache({ company: next });
      return next;
    });

  const loadCompanyFromExperience = async (experience: Experience, index: number) => {
    setEnrichingIndex(index);
    setError("");
    try {
      const { data } = await fetchEnrichmentJson<{
        success?: boolean;
        error?: string;
        company?: Partial<CompanyState> & { logoUrl?: string | null };
      }>("/api/onboarding/founder-company-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: true,
          experienceIndex: index,
          company: experience.company,
          companyUsername: experience.companyUsername,
          companyLinkedInUrl: experience.companyLinkedInUrl,
          companyLogoUrl: experience.companyLogoUrl,
          location: experience.location,
        }),
        timeoutMs: 120_000,
      });
      if (data.success) {
        const c = data.company || {};
        const nextCompany = {
          name: c.name || experience.company || "",
          website: c.website || "",
          location: c.location || experience.location || "",
          description: c.description || "",
          logoUrl: c.logoUrl || experience.companyLogoUrl || null,
        };
        setCompany(nextCompany);
        writeDraftCache({ company: nextCompany });
        setExperiencePhase("confirm");
      } else {
        // If enrichment fails, still let them continue with what we know from LinkedIn.
        const nextCompany = {
          name: experience.company || "",
          website: "",
          location: experience.location || "",
          description: "",
          logoUrl: experience.companyLogoUrl || null,
        };
        setCompany(nextCompany);
        writeDraftCache({ company: nextCompany });
        setExperiencePhase("confirm");
        setError(data.error || "Couldn’t auto-load company details — fill them in below.");
      }
    } catch (err) {
      const nextCompany = {
        name: experience.company || "",
        website: "",
        location: experience.location || "",
        description: "",
        logoUrl: experience.companyLogoUrl || null,
      };
      setCompany(nextCompany);
      writeDraftCache({ company: nextCompany });
      setExperiencePhase("confirm");
      setError(err instanceof Error ? err.message : "Network error — fill company details manually.");
    } finally {
      setEnrichingIndex(null);
    }
  };

  const submitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate this step's fields first — don't surface step-1 Cal errors here.
    if (!company.name.trim()) {
      setError("Enter your company name to continue.");
      return;
    }
    const website = normalizeCompanyWebsite(company.website);
    if (!website) {
      setError("Enter your company website (e.g. www.yourcompany.com).");
      return;
    }
    if (!company.location.trim()) {
      setError("Enter your company location to continue.");
      return;
    }
    if (!company.description.trim()) {
      setError("Add a short about section for your company.");
      return;
    }

    const cached = readDraftCache();
    const profileToSave: ProfileState = {
      ...profile,
      ...(cached?.profile || {}),
      // Prefer live form state over cache for fields the founder may have edited.
      name: profile.name || cached?.profile?.name || "",
      company: profile.company || cached?.profile?.company || company.name,
      title: profile.title || cached?.profile?.title || "",
      workEmail: profile.workEmail || cached?.profile?.workEmail || "",
      bio: profile.bio || cached?.profile?.bio || "",
      schedulingLink: profile.schedulingLink || cached?.profile?.schedulingLink || "",
      avatarUrl: profile.avatarUrl || cached?.profile?.avatarUrl || null,
    };

    if (!isValidSchedulingLink(profileToSave.schedulingLink)) {
      setError("Your scheduling link from step 1 is missing. Go back to your profile and add a Cal.com or Calendly link.");
      return;
    }

    setCompanySaving(true);
    try {
      const profileRes = await fetch("/api/founder/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profileToSave),
      });
      const profileData = await profileRes.json();
      if (!profileData.success) {
        setError(profileData.error || "Could not save your profile details.");
        return;
      }

      const res = await fetch("/api/founder/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...company, website }),
      });
      const data = await res.json();
      if (data.success) {
        clearDraftCache();
        window.location.href = data.next || "/founder/onboarding/context";
      } else {
        setError(data.error || "Could not save company details.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCompanySaving(false);
    }
  };

  const stepLabel = useMemo(() => {
    if (step === "linkedin" || profileEnriching) return null;
    if (step === "profile") return "Step 1 of 2";
    return "Step 2 of 2";
  }, [step, profileEnriching]);

  return (
    <AuthShell>
      {stepLabel && <p className={founderStepClass}>{stepLabel}</p>}

      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {step === "linkedin" && (
            <motion.div
              key="linkedin"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <img src="/logo.png" alt="DevLabs" className="mb-8 h-11 w-11 rounded-xl object-contain" />
              <h1 className={founderHeadingClass}>Paste your LinkedIn URL or username</h1>
              <p className={founderSubtextClass}>
                We use this to load your founder profile from LinkedIn. After you confirm your details, we&apos;ll pull
                your work experience from the same profile.
              </p>

              <form onSubmit={submitLinkedIn} className="mt-8 space-y-4">
                <label className="block space-y-2">
                  <span className={founderLabelClass}>LinkedIn profile</span>
                  <input
                    className={founderFieldClass}
                    value={linkedin}
                    onChange={(event) => setLinkedin(event.target.value)}
                    placeholder="https://linkedin.com/in/yourname or yourname"
                    autoComplete="url"
                  />
                </label>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={linkedinBusy || !linkedin.trim()}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A66C2] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {linkedinBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Linkedin className="h-5 w-5" />}
                  {linkedinBusy ? "Starting LinkedIn scrape…" : "Continue"}
                </button>

                <button
                  type="button"
                  onClick={skipLinkedIn}
                  className="block w-full text-center text-sm text-black/45 underline-offset-4 hover:text-[#050505] hover:underline"
                >
                  Skip for now
                </button>
              </form>
            </motion.div>
          )}

          {step === "profile" && (
            <motion.div
              key="profile"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              {profileEnriching ? (
                <div className="mt-2 flex min-h-[22rem] flex-col items-center justify-center px-2 text-center">
                  <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
                    <span className="absolute inset-0 animate-ping rounded-full bg-[#0A66C2]/15" />
                    <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[#0A66C2]/25 bg-[#0A66C2]/10">
                      <Sparkles className="h-7 w-7 text-[#0A66C2]" />
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#050505]">Collecting your LinkedIn info</h1>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-black/55">
                    We’re scraping your profile so we can pre-fill the next step. The LinkedIn queue sometimes takes a few minutes.
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
                  <button
                    type="button"
                    onClick={skipEnrichmentWait}
                    className="mt-8 text-sm text-black/45 underline-offset-4 hover:text-[#050505] hover:underline"
                  >
                    Continue without waiting
                  </button>
                  <button
                    type="button"
                    onClick={goBackToLinkedIn}
                    className="mt-3 text-sm text-black/45 underline-offset-4 hover:text-[#050505] hover:underline"
                  >
                    Back to LinkedIn URL
                  </button>
                </div>
              ) : (
                <>
              <h1 className="text-2xl font-bold tracking-tight text-[#050505]">Review your details</h1>
              <p className="mt-2 text-sm text-black/55">Confirm what we loaded from LinkedIn — you can edit anything.</p>

              {profileLoading ? (
                <div className="flex h-48 items-center justify-center text-black/45">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <form onSubmit={submitProfile} className="mt-6 space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="h-20 w-20 overflow-hidden rounded-full border border-black/10 bg-white">
                      {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <span className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black/45">
                      From LinkedIn
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className={founderLabelClass}>Full name</label>
                    <input className={founderFieldClass} value={profile.name} onChange={updateProfile("name")} placeholder="Your name" />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className={founderLabelClass}>Working at</label>
                      <input className={founderFieldClass} value={profile.company} onChange={updateProfile("company")} placeholder="Company" />
                    </div>
                    <div className="space-y-2">
                      <label className={founderLabelClass}>Role</label>
                      <input className={founderFieldClass} value={profile.title} onChange={updateProfile("title")} placeholder="e.g. Hiring Manager" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={founderLabelClass}>Work email</label>
                    <input className={founderFieldClass} type="email" value={profile.workEmail} onChange={updateProfile("workEmail")} placeholder="you@company.com" />
                  </div>

                  <div className="space-y-2">
                    <label className={founderLabelClass}>Scheduling link</label>
                    <input
                      className={founderFieldClass}
                      type="url"
                      value={profile.schedulingLink}
                      onChange={updateProfile("schedulingLink")}
                      placeholder="https://cal.com/yourname or https://calendly.com/yourname"
                    />
                    <p className="text-xs text-black/45">
                      Required. We send this to builders over email when you request an intro, so they can book an
                      interview with you directly. Cal.com or Calendly only.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className={founderLabelClass}>Bio</label>
                    <textarea className={founderTextareaClass} value={profile.bio} onChange={updateProfile("bio")} placeholder="A short bio" />
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={goBackToLinkedIn}
                      className="h-12 rounded-xl border border-black/10 px-5 text-sm font-semibold text-black/55 transition-colors hover:text-[#050505]"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ec9149] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {profileSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Next
                    </button>
                  </div>
                </form>
              )}
                </>
              )}
            </motion.div>
          )}

          {step === "experiences" && (
            <motion.div
              key={`experiences-${experiencePhase}`}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              {experiencesLoading ? (
                <div className="flex h-48 items-center justify-center text-black/45">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : experiencePhase === "select" ? (
                <>
                  <h1 className="text-2xl font-bold tracking-tight text-[#050505]">Choose your company</h1>
                  <p className="mt-2 text-sm text-black/55">
                    Select the company you want to represent, then continue. We&apos;ll load details from LinkedIn and
                    the web — or add one yourself.
                  </p>

                  {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                  {experiences.length === 0 && (
                    <p className="mt-6 rounded-xl border border-dashed border-black/15 bg-white/80 p-4 text-sm text-black/55">
                      We couldn&apos;t pull any experiences from your LinkedIn yet. You can add your company manually
                      below.
                    </p>
                  )}

                  <div className="mt-6 space-y-3">
                    {experiences.map((experience, index) => {
                      const selected = selectedExperienceIndex === index;
                      const busy = enrichingIndex === index;
                      const disabled = enrichingIndex !== null;
                      return (
                        <button
                          key={`${experience.company}-${index}`}
                          type="button"
                          onClick={() => {
                            setSelectedExperienceIndex(index);
                            setError("");
                          }}
                          disabled={disabled}
                          className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left shadow-sm transition-colors disabled:opacity-60 ${
                            selected
                              ? "border-[#ec9149] bg-[#fff7f0] ring-1 ring-[#ec9149]/40"
                              : "border-black/10 bg-white hover:border-black/20"
                          }`}
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-[#fdfaf7]">
                            {experience.companyLogoUrl ? (
                              <img src={experience.companyLogoUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Building2 className="h-5 w-5 text-black/35" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-[#050505]">{experience.company}</p>
                            <p className="truncate text-sm text-black/45">
                              {[experience.title, experience.dateRange].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected ? "border-[#ec9149] bg-[#ec9149] text-white" : "border-black/20 bg-white"
                            }`}
                            aria-hidden
                          >
                            {busy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : selected ? (
                              <span className="block h-2 w-2 rounded-full bg-white" />
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedExperienceIndex(null);
                      setCompany(EMPTY_COMPANY);
                      setError("");
                      setExperiencePhase("confirm");
                    }}
                    disabled={enrichingIndex !== null}
                    className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 text-sm font-semibold text-black/45 transition-colors hover:border-[#ff7417]/40 hover:text-[#050505] disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    Add company manually
                  </button>

                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={() => goTo("profile", -1)}
                      disabled={enrichingIndex !== null}
                      className="h-12 rounded-xl border border-black/10 px-5 text-sm font-semibold text-black/55 transition-colors hover:text-[#050505] disabled:opacity-60"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={
                        enrichingIndex !== null ||
                        (experiences.length > 0 && selectedExperienceIndex === null)
                      }
                      onClick={() => {
                        if (selectedExperienceIndex === null) {
                          setSelectedExperienceIndex(null);
                          setCompany(EMPTY_COMPANY);
                          setExperiencePhase("confirm");
                          return;
                        }
                        const experience = experiences[selectedExperienceIndex];
                        if (experience) void loadCompanyFromExperience(experience, selectedExperienceIndex);
                      }}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ec9149] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {enrichingIndex !== null && <Loader2 className="h-4 w-4 animate-spin" />}
                      {enrichingIndex !== null ? "Loading company…" : "Next"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold tracking-tight text-[#050505]">Review company details</h1>

                  <form onSubmit={submitCompany} className="mt-6 space-y-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-[#fdfaf7]">
                        {company.logoUrl ? (
                          <img src={company.logoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-2xl font-bold text-black/35">{company.name?.[0]?.toUpperCase() || "C"}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className={founderLabelClass}>Company name</label>
                        <input className={founderFieldClass} value={company.name} onChange={updateCompany("name")} placeholder="Company name" />
                      </div>
                      <div className="space-y-2">
                        <label className={founderLabelClass}>Website</label>
                        <div className="relative">
                          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                          <input className={`${founderFieldClass} pl-9`} value={company.website} onChange={updateCompany("website")} placeholder="www.example.com" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={founderLabelClass}>Location</label>
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                        <input className={`${founderFieldClass} pr-9`} value={company.location} onChange={updateCompany("location")} placeholder="City, Country" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={founderLabelClass}>About</label>
                      <textarea className={`${founderTextareaClass} h-28`} value={company.description} onChange={updateCompany("description")} placeholder="What does your company do?" />
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setExperiencePhase("select");
                        }}
                        className="h-12 rounded-xl border border-black/10 px-5 text-sm font-semibold text-black/55 transition-colors hover:text-[#050505]"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={companySaving}
                        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ec9149] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        {companySaving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirm &amp; continue
                      </button>
                    </div>
                  </form>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthShell>
  );
};

export default FounderOnboardingFlow;
