import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, LogOut } from "lucide-react";
import { useAuth } from "../auth_manager";
import { countWords, type PortalUser } from "./types";

const STEPS = [
  { id: "you", title: "About you", subtitle: "How we reach you" },
  { id: "startup", title: "Your startup", subtitle: "The basics" },
  { id: "story", title: "Story", subtitle: "What you’re building" },
  { id: "links", title: "Links & deck", subtitle: "Show your work" },
  { id: "traction", title: "Traction", subtitle: "Stage & signals" },
];

const founderOptions = [
  { value: "student", label: "Student" },
  {
    value: "working_professional_side",
    label: "Working pro · building on the side",
  },
  { value: "full_time_founder", label: "Full-time startup founder" },
  { value: "other", label: "Other" },
];

const heardOptions = [
  { value: "x", label: "X (Twitter)" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "friend", label: "Friend" },
  { value: "university", label: "University" },
  { value: "other", label: "Other" },
];

function fieldWrap(label: string, hint: string | undefined, children: React.ReactNode) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
        {label}
      </span>
      {hint ? <span className="block text-xs text-white/35 -mt-1">{hint}</span> : null}
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none transition focus:border-orange-400/50 focus:ring-2 focus:ring-orange-400/20";

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-white/80">{label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            value
              ? "bg-orange-400 text-black"
              : "bg-white/5 text-white/60 hover:bg-white/10"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            !value
              ? "bg-orange-400 text-black"
              : "bg-white/5 text-white/60 hover:bg-white/10"
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}

export default function MomentumApplicationWizard({
  user,
  defaultFirstName = "",
  defaultLastName = "",
  onSuccess,
}: {
  user: PortalUser;
  defaultFirstName?: string;
  defaultLastName?: string;
  onSuccess: () => void;
}) {
  const { logout } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: defaultFirstName,
    lastName: defaultLastName,
    email: user.email,
    phone: "",
    city: "",
    state: "",
    country: "",
    startupName: "",
    startupAge: "",
    founderType: "student",
    startupDomain: "",
    hasCoFounder: false,
    numCoFounders: 0,
    coFounderDetails: "",
    description: "",
    accomplishments: "",
    adjectives: "",
    websiteOrGithub: "",
    demoVideo: "",
    linkedin: "",
    twitter: "",
    pitchDeck: "",
    keyMetrics: "",
    hasRevenue: false,
    isIncorporated: false,
    hasRaisedMoney: false,
    lookingToFundraise: false,
    heardAboutUs: "linkedin",
  });

  const descWords = useMemo(() => countWords(form.description), [form.description]);

  const update = <K extends keyof typeof form>(key: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: v }));
  };

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!form.firstName.trim()) return "First name is required.";
      if (!form.lastName.trim()) return "Last name is required.";
      if (!form.email.trim()) return "Email is required.";
      if (!form.phone.trim()) return "Phone is required.";
      if (!form.city.trim()) return "City is required.";
      if (!form.state.trim()) return "State / region is required.";
      if (!form.country.trim()) return "Country is required.";
    }
    if (s === 1) {
      if (!form.startupName.trim()) return "Startup name is required.";
      if (!form.startupAge.trim()) return "Startup age is required.";
      if (!form.startupDomain.trim()) return "Startup domain is required.";
      if (form.hasCoFounder && form.numCoFounders < 1)
        return "Enter how many co-founders you have.";
    }
    if (s === 2) {
      if (!form.description.trim()) return "Please describe what you’re building.";
      if (descWords > 50) return "Description must be 50 words or fewer.";
      if (!form.accomplishments.trim()) return "Share your best accomplishments.";
      if (!form.adjectives.trim()) return "Three adjectives — go for it.";
    }
    if (s === 3) {
      if (!form.demoVideo.trim()) return "A demo video link is required.";
    }
    if (s === 4) {
      if (!form.heardAboutUs) return "Tell us how you heard about Momentum.";
    }
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
  };

  const back = () => {
    setError(null);
    setStep((x) => Math.max(x - 1, 0));
  };

  const submit = async () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    for (let s = 0; s < STEPS.length; s++) {
      const e = validateStep(s);
      if (e) {
        setStep(s);
        setError(e);
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/momentum/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          numCoFounders: form.hasCoFounder ? form.numCoFounders : 0,
          coFounderDetails: form.hasCoFounder ? form.coFounderDetails : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl relative">
      <div className="absolute top-0 right-0">
        <button
          onClick={() => void logout()}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>

      <div className="mb-10 text-center">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-orange-300">
          <Sparkles className="h-3.5 w-3.5" />
          Application
        </p>
        <h1 className="font-seasons text-3xl text-white sm:text-4xl md:text-5xl">
          Join Momentum
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-white/55 sm:text-base">
          A few thoughtful answers help us know you and your startup. You can
          save time by moving step by step — it only takes a few minutes.
        </p>
      </div>

      {/* Progress */}
      <div className="mb-8 flex items-center justify-between gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              if (i < step) {
                setError(null);
                setStep(i);
              }
            }}
            className={`group flex flex-1 flex-col items-center gap-1 ${
              i <= step ? "cursor-pointer" : "cursor-default opacity-40"
            }`}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                i < step
                  ? "bg-orange-400 text-black"
                  : i === step
                    ? "bg-white text-black ring-2 ring-orange-400/60"
                    : "bg-white/10 text-white/50"
              }`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-white/40 sm:block">
              {s.title}
            </span>
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-6 shadow-[0_0_80px_rgba(249,115,22,0.08)] backdrop-blur-xl sm:p-10">
        <div className="mb-6 border-b border-white/10 pb-6">
          <h2 className="font-seasons text-xl text-white sm:text-2xl">
            {STEPS[step].title}
          </h2>
          <p className="text-sm text-white/45">{STEPS[step].subtitle}</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.22 }}
            className="space-y-5"
          >
            {step === 0 && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  {fieldWrap(
                    "First name",
                    undefined,
                    <input
                      className={inputClass}
                      value={form.firstName}
                      onChange={(e) => update("firstName", e.target.value)}
                      placeholder="Alex"
                    />,
                  )}
                  {fieldWrap(
                    "Last name",
                    undefined,
                    <input
                      className={inputClass}
                      value={form.lastName}
                      onChange={(e) => update("lastName", e.target.value)}
                      placeholder="Rivera"
                    />,
                  )}
                </div>
                {fieldWrap(
                  "Email",
                  undefined,
                  <input
                    type="email"
                    className={inputClass}
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="you@university.edu"
                  />,
                )}
                {fieldWrap(
                  "Phone",
                  undefined,
                  <input
                    className={inputClass}
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="+1 · · ·"
                  />,
                )}
                <div className="grid gap-5 sm:grid-cols-3">
                  {fieldWrap(
                    "City",
                    undefined,
                    <input
                      className={inputClass}
                      value={form.city}
                      onChange={(e) => update("city", e.target.value)}
                    />,
                  )}
                  {fieldWrap(
                    "State / region",
                    undefined,
                    <input
                      className={inputClass}
                      value={form.state}
                      onChange={(e) => update("state", e.target.value)}
                    />,
                  )}
                  {fieldWrap(
                    "Country",
                    undefined,
                    <input
                      className={inputClass}
                      value={form.country}
                      onChange={(e) => update("country", e.target.value)}
                    />,
                  )}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                {fieldWrap(
                  "Startup name",
                  undefined,
                  <input
                    className={inputClass}
                    value={form.startupName}
                    onChange={(e) => update("startupName", e.target.value)}
                  />,
                )}
                {fieldWrap(
                  "Startup age",
                  undefined,
                  <input
                    className={inputClass}
                    value={form.startupAge}
                    onChange={(e) => update("startupAge", e.target.value)}
                    placeholder="e.g. 6 months, idea stage"
                  />,
                )}
                {fieldWrap(
                  "You are a…",
                  undefined,
                  <select
                    className={`${inputClass} appearance-none cursor-pointer`}
                    value={form.founderType}
                    onChange={(e) => update("founderType", e.target.value)}
                  >
                    {founderOptions.map((o) => (
                      <option key={o.value} value={o.value} className="bg-[#1a1b1c]">
                        {o.label}
                      </option>
                    ))}
                  </select>,
                )}
                {fieldWrap(
                  "Startup domain",
                  "AI, SaaS, biotech, robotics…",
                  <input
                    className={inputClass}
                    value={form.startupDomain}
                    onChange={(e) => update("startupDomain", e.target.value)}
                  />,
                )}
                <ToggleRow
                  label="Do you have a co-founder?"
                  value={form.hasCoFounder}
                  onChange={(v) => update("hasCoFounder", v)}
                />
                {form.hasCoFounder && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-4"
                  >
                    {fieldWrap(
                      "How many co-founders?",
                      undefined,
                      <input
                        type="number"
                        min={1}
                        className={inputClass}
                        value={form.numCoFounders || ""}
                        onChange={(e) =>
                          update("numCoFounders", Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                      />,
                    )}
                    {fieldWrap(
                      "Co-founder details",
                      "Names, roles, short background",
                      <textarea
                        className={`${inputClass} min-h-[100px] resize-y`}
                        value={form.coFounderDetails}
                        onChange={(e) => update("coFounderDetails", e.target.value)}
                      />,
                    )}
                  </motion.div>
                )}
              </>
            )}

            {step === 2 && (
              <>
                {fieldWrap(
                  "What are you building?",
                  `Max 50 words · ${descWords} / 50`,
                  <textarea
                    className={`${inputClass} min-h-[120px] resize-y`}
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                  />,
                )}
                {fieldWrap(
                  "2–3 best accomplishments",
                  undefined,
                  <textarea
                    className={`${inputClass} min-h-[100px] resize-y`}
                    value={form.accomplishments}
                    onChange={(e) => update("accomplishments", e.target.value)}
                  />,
                )}
                {fieldWrap(
                  "Describe yourself in 3 adjectives",
                  undefined,
                  <input
                    className={inputClass}
                    value={form.adjectives}
                    onChange={(e) => update("adjectives", e.target.value)}
                    placeholder="Bold, curious, relentless"
                  />,
                )}
              </>
            )}

            {step === 3 && (
              <>
                {fieldWrap(
                  "Website or GitHub",
                  undefined,
                  <input
                    className={inputClass}
                    value={form.websiteOrGithub}
                    onChange={(e) => update("websiteOrGithub", e.target.value)}
                    placeholder="https://"
                  />,
                )}
                {fieldWrap(
                  "~1 min demo video (link)",
                  "YouTube, Loom, Drive…",
                  <input
                    className={inputClass}
                    value={form.demoVideo}
                    onChange={(e) => update("demoVideo", e.target.value)}
                    placeholder="https://"
                  />,
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                  {fieldWrap(
                    "LinkedIn",
                    undefined,
                    <input
                      className={inputClass}
                      value={form.linkedin}
                      onChange={(e) => update("linkedin", e.target.value)}
                    />,
                  )}
                  {fieldWrap(
                    "X (Twitter)",
                    undefined,
                    <input
                      className={inputClass}
                      value={form.twitter}
                      onChange={(e) => update("twitter", e.target.value)}
                    />,
                  )}
                </div>
                {fieldWrap(
                  "Pitch deck",
                  "Link to PDF or slides (under 5 slides ideal)",
                  <input
                    className={inputClass}
                    value={form.pitchDeck}
                    onChange={(e) => update("pitchDeck", e.target.value)}
                  />,
                )}
                {fieldWrap(
                  "Key traction metrics (optional)",
                  undefined,
                  <textarea
                    className={`${inputClass} min-h-[80px] resize-y`}
                    value={form.keyMetrics}
                    onChange={(e) => update("keyMetrics", e.target.value)}
                  />,
                )}
              </>
            )}

            {step === 4 && (
              <>
                <ToggleRow
                  label="Do you have revenue?"
                  value={form.hasRevenue}
                  onChange={(v) => update("hasRevenue", v)}
                />
                <ToggleRow
                  label="Legal entity formed / incorporated?"
                  value={form.isIncorporated}
                  onChange={(v) => update("isIncorporated", v)}
                />
                <ToggleRow
                  label="Raised money? (angels, VCs, friends & family)"
                  value={form.hasRaisedMoney}
                  onChange={(v) => update("hasRaisedMoney", v)}
                />
                <ToggleRow
                  label="Looking to fundraise or join an accelerator?"
                  value={form.lookingToFundraise}
                  onChange={(v) => update("lookingToFundraise", v)}
                />
                {fieldWrap(
                  "How did you hear about Momentum?",
                  undefined,
                  <select
                    className={`${inputClass} cursor-pointer`}
                    value={form.heardAboutUs}
                    onChange={(e) => update("heardAboutUs", e.target.value)}
                  >
                    {heardOptions.map((o) => (
                      <option key={o.value} value={o.value} className="bg-[#1a1b1c]">
                        {o.label}
                      </option>
                    ))}
                  </select>,
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/10 pt-8 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/5 disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-400 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-400/25 transition hover:bg-orange-400"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-400 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-400/30 transition hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Submit application
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-white/35">
        Logged in as <span className="text-white/55">{user.email}</span>
      </p>
    </div>
  );
}
