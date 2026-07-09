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
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Globe, Linkedin, Loader2, MapPin, Plus } from "lucide-react";

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

const EMPTY_COMPANY: CompanyState = {
  name: "",
  website: "",
  location: "",
  description: "",
  logoUrl: null,
};


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

  const [profile, setProfile] = useState<ProfileState>({
    name: "",
    company: "",
    title: "",
    workEmail: "",
    bio: "",
    schedulingLink: "",
    avatarUrl: null,
  });
  const [profileLoading, setProfileLoading] = useState(stepFromLocation() !== "linkedin");
  const [profileSaving, setProfileSaving] = useState(false);

  const [experiencePhase, setExperiencePhase] = useState<ExperiencePhase>("select");
  const [experiences, setExperiences] = useState<Experience[]>([]);
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

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch("/api/founder/profile", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile((s) => ({
          ...s,
          name: data.profile.name || "",
          company: data.profile.company || "",
          title: data.profile.title || "",
          workEmail: data.profile.email || "",
          bio: data.profile.bio || "",
          schedulingLink: data.profile.schedulingLink || "",
          avatarUrl: data.profile.avatarUrl || null,
        }));
      }
    } catch {
      /* start blank */
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadExperiences = useCallback(async () => {
    setExperiencesLoading(true);
    try {
      const res = await fetch("/api/founder/profile", { credentials: "include" });
      const data = await res.json();
      if (data.success !== false) {
        const exps: Experience[] = Array.isArray(data?.experiences) ? data.experiences : [];
        setExperiences(exps.filter((e) => e?.company));
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
    if (step === "profile") void loadProfile();
    if (step === "experiences") void loadExperiences();
  }, [step, loadProfile, loadExperiences]);

  const submitLinkedIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLinkedinBusy(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/linkedin-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accountType: "founder", linkedin }),
      });
      const data = await res.json();
      if (data.success) {
        await loadProfile();
        goTo("profile");
      } else {
        setError(data.error || "Could not load your LinkedIn profile.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLinkedinBusy(false);
    }
  };

  const skipLinkedIn = () => {
    void loadProfile();
    goTo("profile");
  };

  const updateProfile = (k: keyof ProfileState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setProfile((s) => ({ ...s, [k]: e.target.value }));

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidSchedulingLink(profile.schedulingLink)) {
      setError("Add a valid Cal.com or Calendly link so builders can book an interview with you.");
      return;
    }
    setProfileSaving(true);
    setError("");
    try {
      const res = await fetch("/api/founder/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Could not save your details.");
        return;
      }
      await loadExperiences();
      goTo("experiences");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setProfileSaving(false);
    }
  };

  const updateCompany = (k: keyof CompanyState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCompany((s) => ({ ...s, [k]: e.target.value }));

  const loadCompanyFromExperience = async (experience: Experience, index: number) => {
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
        setCompany({
          name: c.name || experience.company || "",
          website: c.website || "",
          location: c.location || experience.location || "",
          description: c.description || "",
          logoUrl: c.logoUrl || experience.companyLogoUrl || null,
        });
        setExperiencePhase("confirm");
      } else {
        setError(data.error || "Could not load that company.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setEnrichingIndex(null);
    }
  };

  const submitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanySaving(true);
    setError("");
    try {
      const res = await fetch("/api/founder/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(company),
      });
      const data = await res.json();
      if (data.success) window.location.href = data.next || "/founder/onboarding/context";
      else setError(data.error || "Could not save company details.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCompanySaving(false);
    }
  };

  const stepLabel = useMemo(() => {
    if (step === "linkedin") return null;
    if (step === "profile") return "Step 1 of 2";
    return "Step 2 of 2";
  }, [step]);

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
                  {linkedinBusy ? "Loading profile..." : "Continue"}
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
                      onClick={() => goTo("linkedin", -1)}
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
                    Pick the company you want to represent. We&apos;ll load details from LinkedIn and the web — or add
                    one yourself.
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
                      const busy = enrichingIndex === index;
                      const disabled = enrichingIndex !== null;
                      return (
                        <div
                          key={`${experience.company}-${index}`}
                          className="flex items-center gap-4 rounded-xl border border-black/10 bg-white p-4 shadow-sm"
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
                          <button
                            type="button"
                            onClick={() => void loadCompanyFromExperience(experience, index)}
                            disabled={disabled}
                            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#ec9149] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {busy ? "Loading..." : "Add"}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
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

                  <button
                    type="button"
                    onClick={() => goTo("profile", -1)}
                    className="mt-4 text-sm text-black/45 underline-offset-4 hover:text-[#050505] hover:underline"
                  >
                    Back to profile
                  </button>
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
                        <input className={founderFieldClass} value={company.name} onChange={updateCompany("name")} placeholder="Company name" required />
                      </div>
                      <div className="space-y-2">
                        <label className={founderLabelClass}>Website</label>
                        <div className="relative">
                          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                          <input className={`${founderFieldClass} pl-9`} value={company.website} onChange={updateCompany("website")} placeholder="www.example.com" required />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={founderLabelClass}>Location</label>
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                        <input className={`${founderFieldClass} pr-9`} value={company.location} onChange={updateCompany("location")} placeholder="City, Country" required />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={founderLabelClass}>About</label>
                      <textarea className={`${founderTextareaClass} h-28`} value={company.description} onChange={updateCompany("description")} placeholder="What does your company do?" required />
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
