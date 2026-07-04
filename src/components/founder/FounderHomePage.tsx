import React, { useEffect, useMemo, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth_manager";
import FounderContextIntroModals from "@/components/founder/FounderContextIntroModals";
import { FounderRail } from "@/components/founder/FounderRail";
import { FounderUpgradeModal } from "@/components/founder/FounderUpgradeModal";
import type { PlanId } from "@/components/founder/FounderBillingCard";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  Plus,
} from "lucide-react";

type Role = {
  id: string;
  title?: string;
  roleTitle?: string;
  status?: string;
  skillsNeeded?: string[];
  updatedAt?: string;
};

type Question = {
  key: "role" | "techStack" | "compensation";
  title: string;
  options: string[];
  placeholder: string;
  validate: (value: string) => string | null;
  format: (value: string) => string;
};

const titleCase = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));

const cleanCommaList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");

const formatCompensation = (value: string) => value.trim().replace(/\s+/g, " ");

const questions: Question[] = [
  {
    key: "role",
    title: "What role are you hiring for?",
    options: ["Frontend developer", "Backend developer", "Full-stack developer"],
    placeholder: "e.g. Founding mobile engineer",
    validate: (value) => {
      const text = value.trim();
      if (text.length < 2) return "Tell us the role title (at least 2 characters).";
      if (text.length > 60) return "Keep the role title under 60 characters.";
      if (!/[a-zA-Z]/.test(text)) return "Enter a real role title, e.g. iOS engineer.";
      return null;
    },
    format: (value) => titleCase(value),
  },
  {
    key: "techStack",
    title: "Enter your tech stack",
    options: ["Java, Spring Boot", "Node.js", "Golang"],
    placeholder: "e.g. React, Node.js, PostgreSQL",
    validate: (value) => {
      const items = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (items.length === 0) return "List at least one technology.";
      if (items.some((item) => item.length > 30)) return "Use short tech names separated by commas.";
      return null;
    },
    format: (value) => cleanCommaList(value),
  },
  {
    key: "compensation",
    title: "Compensation (In-hand)",
    options: ["$10k - $20k P.a.", "$20k - $50k P.a.", "$50k - $100k P.a."],
    placeholder: "e.g. $40k - $60k P.a.",
    validate: (value) => {
      if (!/\d/.test(value)) return "Include an amount, e.g. $40k - $60k P.a.";
      if (value.trim().length > 40) return "Keep the compensation short, e.g. $40k - $60k P.a.";
      return null;
    },
    format: (value) => formatCompensation(value),
  },
];

const FounderHomeInner: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const checkoutStartedRef = useRef(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [mode, setMode] = useState<"list" | "questions">("questions");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [fading, setFading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [showIntro, setShowIntro] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; upgradeTarget: PlanId; reason?: string }>({
    open: false,
    upgradeTarget: "growth",
  });

  // Jump straight into a new role when linked here from "+ New Search" elsewhere in the app.
  useEffect(() => {
    if (pageLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    startNewRole();
  }, [pageLoading]);

  // Show the "how DevLabs works" intro on top of the home screen until completed.
  useEffect(() => {
    if (!loading && user && user.onboardingStatus && user.onboardingStatus !== "complete") {
      setShowIntro(true);
    }
  }, [loading, user]);

  useEffect(() => {
    if (!loading && !user) {
      const redirect = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/auth/login?redirect=${encodeURIComponent(redirect)}`;
    }
    if (!loading && user && user.accountType !== "founder" && user.role !== "founder") {
      const redirect = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/auth/select-role?redirect=${encodeURIComponent(redirect)}`;
    }
  }, [loading, user]);

  useEffect(() => {
    if (checkoutStartedRef.current || loading || !user) return;
    if (user.accountType !== "founder" && user.role !== "founder") return;
    const params = new URLSearchParams(window.location.search);
    const plan = params.get("checkout_plan");
    if (plan !== "growth" && plan !== "custom") return;

    checkoutStartedRef.current = true;
    const interval = params.get("checkout_interval") === "yearly" ? "yearly" : "monthly";
    setBusy(true);
    setError("");

    void (async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ plan, interval }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success || !data.url) {
          throw new Error(data.error || "Could not start checkout.");
        }
        window.location.href = data.url;
      } catch (error) {
        // Drop the checkout params so a refresh doesn't re-trigger the failed attempt.
        const url = new URL(window.location.href);
        url.searchParams.delete("checkout_plan");
        url.searchParams.delete("checkout_interval");
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
        setError(error instanceof Error ? error.message : "Could not start checkout.");
        setBusy(false);
      }
    })();
  }, [loading, user]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/founder/roles", { credentials: "include" });
        const data = await res.json();
        if (data.success && Array.isArray(data.jobs) && data.jobs.length > 0) {
          setRoles(data.jobs);
          setMode("list");
        }
      } catch {
        setError("Could not load your roles.");
      } finally {
        setPageLoading(false);
      }
    })();
  }, []);

  const firstName = useMemo(() => (user?.name || "there").split(" ")[0], [user]);
  const current = questions[step];

  /** Fade the current question out, apply the step change, then fade the next one in. */
  const animateTo = (apply: () => void) => {
    setFading(true);
    window.setTimeout(() => {
      apply();
      setFading(false);
    }, 160);
  };

  const startNewRole = () => {
    setMode("questions");
    setStep(0);
    setAnswers({});
    setCustomOpen(false);
    setCustomValue("");
    setError("");
  };

  const submit = async (finalAnswers: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/founder/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(finalAnswers),
      });
      const data = await res.json();
      if (data.success) window.location.href = data.next;
      else if (res.status === 402 && data.upgradeTarget) {
        setUpgradeModal({ open: true, upgradeTarget: data.upgradeTarget, reason: data.error });
      } else setError(data.error || "Could not create the role.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  /** Validate + format an answer for the current question, then advance or submit. */
  const commit = async (rawValue: string) => {
    const validationError = current.validate(rawValue);
    if (validationError) {
      setError(validationError);
      return;
    }
    const value = current.format(rawValue);
    const nextAnswers = { ...answers, [current.key]: value };
    setAnswers(nextAnswers);
    setError("");

    if (step < questions.length - 1) {
      animateTo(() => {
        setStep(step + 1);
        setCustomOpen(false);
        setCustomValue("");
      });
      return;
    }
    await submit(nextAnswers);
  };

  const goBack = () => {
    if (step === 0) return;
    setError("");
    animateTo(() => {
      setStep(step - 1);
      setCustomOpen(false);
      setCustomValue("");
    });
  };

  const goForward = () => {
    if (step >= questions.length - 1) return;
    if (!answers[current.key]) return;
    setError("");
    animateTo(() => {
      setStep(step + 1);
      setCustomOpen(false);
      setCustomValue("");
    });
  };

  return (
    <div className="flex min-h-screen bg-white">
      {showIntro && <FounderContextIntroModals onFinish={() => setShowIntro(false)} />}
      <FounderRail onLogout={() => void logout()} initial={firstName.slice(0, 1).toUpperCase()} />

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <header className="relative z-10 flex h-16 items-center border-b border-[#ece7e1] px-6 sm:px-8">
          <h1 className="text-lg font-bold tracking-tight text-black">Sourcing</h1>
        </header>

        {pageLoading ? (
          <section className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#ec9149]" />
          </section>
        ) : mode === "list" ? (
          <section className="relative z-10 mx-auto w-full max-w-[1220px] px-6 py-8 sm:px-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-black">Roles Created</h2>
                <div className="mt-6 inline-flex overflow-hidden rounded-xl border border-[#ece7e1] bg-[#fdfaf7] p-1 text-sm font-semibold">
                  <button type="button" className="rounded-lg bg-white px-6 py-2 text-black shadow-[0_1px_2px_rgba(16,24,40,0.04)]">Active</button>
                  <button type="button" className="rounded-lg px-6 py-2 text-black/45">Paused</button>
                </div>
              </div>
              <button
                type="button"
                onClick={startNewRole}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-black/70 transition hover:text-[#ec9149]"
              >
                <Plus className="h-3.5 w-3.5" />
                New Search
              </button>
            </div>

            <div className="divide-y divide-[#ece7e1] border-y border-[#ece7e1]">
              {roles.map((role) => (
                <a
                  key={role.id}
                  href={`/founder/roles/${role.id}`}
                  className="group grid gap-4 px-0 py-6 transition hover:bg-[#fdfaf7] md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-black">{role.title || role.roleTitle || "Untitled role"}</p>
                    <p className="mt-1 truncate text-xs text-black/42">
                      Internship * 6 Months * $300-500 * Hybrid
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {["12 Recommended", "3 Contacted", "2 Accepted", "1 Trial", "0 Hired"].map((label) => (
                        <span key={label} className="rounded-lg border border-[#ece7e1] bg-[#f3ede4] px-2.5 py-1 text-[10px] text-black/50">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-black/34 md:justify-self-end">10:00 am * 12 June 2026</p>
                  <span className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-[#f3ede4] px-4 text-xs font-semibold text-black transition group-hover:bg-[#ec9149] group-hover:text-white">
                    View <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : (
          <section className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-10">
            <div className="w-full max-w-[580px]">
              <div className="mb-10 text-center">
                <h2 className="text-5xl font-extrabold tracking-tight text-black sm:text-6xl">Hey! {firstName}</h2>
                <p className="mt-4 text-sm font-medium text-black/52">{current.title}</p>
              </div>

              <div
                className={`overflow-hidden rounded-[28px] border border-[#ece7e1] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05),0_10px_30px_rgba(16,24,40,0.05)] transition-all duration-200 ease-out ${
                  fading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
                }`}
              >
                <div className="divide-y divide-[#ece7e1]">
                  {current.options.map((option, index) => {
                    const selected = answers[current.key] === current.format(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={busy}
                        onClick={() => void commit(option)}
                        className={`flex w-full items-center gap-5 px-6 py-4 text-left text-sm transition-colors hover:bg-[#fdfaf7] disabled:opacity-50 ${
                          selected ? "bg-[#fdfaf7] text-black" : "text-black/75"
                        }`}
                      >
                        <span className="w-4 text-center text-black/35">{index + 1}</span>
                        <span className="font-medium">{option}</span>
                      </button>
                    );
                  })}

                  <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
                    {!customOpen ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomOpen(true);
                          setError("");
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm font-medium text-black/40 transition-colors hover:text-black/75"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        Something else...
                      </button>
                    ) : (
                      <input
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commit(customValue);
                        }}
                        placeholder={current.placeholder}
                        autoFocus
                        disabled={busy}
                        className="h-11 min-w-0 flex-1 rounded-xl border border-[#ece7e1] bg-[#fffcfa] px-3 text-sm font-medium text-black outline-none transition-colors placeholder:text-black/30 focus:border-[#ec9149]/50"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => void commit(customOpen ? customValue : answers[current.key] || current.options[0])}
                      disabled={busy || (customOpen && !customValue.trim())}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#ec9149] px-5 text-sm font-bold text-white transition hover:bg-[#dd7f36] disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {step === questions.length - 1 ? "Finish" : "Continue"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between px-1 text-xs text-black/40">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={step === 0}
                  className="inline-flex items-center gap-1 transition hover:text-black disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <span className="tabular-nums">{step + 1} of {questions.length}</span>
                <button
                  type="button"
                  onClick={goForward}
                  disabled={step >= questions.length - 1 || !answers[current.key]}
                  className="inline-flex items-center gap-1 transition hover:text-black disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {error && <p className="mt-4 text-center text-sm font-medium text-red-500">{error}</p>}
            </div>
          </section>
        )}
      </main>

      <FounderUpgradeModal
        open={upgradeModal.open}
        onClose={() => setUpgradeModal((prev) => ({ ...prev, open: false }))}
        upgradeTarget={upgradeModal.upgradeTarget}
        reason={upgradeModal.reason}
      />
    </div>
  );
};

export const FounderHomePage: React.FC = () => (
  <AuthProvider>
    <FounderHomeInner />
  </AuthProvider>
);

export default FounderHomePage;
