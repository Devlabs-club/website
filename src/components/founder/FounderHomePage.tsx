import React, { useEffect, useMemo, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth_manager";
import FounderContextIntroModals from "@/components/founder/FounderContextIntroModals";
import FounderBillingCard from "@/components/founder/FounderBillingCard";
import {
  ArrowRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Settings,
  UsersRound,
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

const FounderRail: React.FC<{ onLogout: () => void; initial: string }> = ({ onLogout, initial }) => (
  <aside className="flex min-h-screen w-20 shrink-0 flex-col items-center border-r border-white/10 bg-[#1b1b1b] py-6">
    <a href="/dashboard" aria-label="DevLabs dashboard" className="mb-9">
      <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
    </a>
    <nav className="flex flex-1 flex-col items-center gap-4" aria-label="Founder navigation">
      <a
        href="/founder/home"
        className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-white shadow-[0_14px_34px_rgba(0,0,0,0.28)]"
        title="Sourcing"
      >
        <UsersRound className="h-5 w-5" />
      </a>
      <button
        type="button"
        className="grid h-11 w-11 place-items-center rounded-xl text-white/45 transition hover:bg-white/[0.05] hover:text-white/75"
        title="Search"
      >
        <Search className="h-5 w-5" />
      </button>
    </nav>
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        className="relative grid h-11 w-11 place-items-center rounded-xl text-white/45 transition hover:bg-white/[0.05] hover:text-white/75"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#fa7d22]" />
      </button>
      <button
        type="button"
        className="grid h-11 w-11 place-items-center rounded-xl text-white/45 transition hover:bg-white/[0.05] hover:text-white/75"
        title="Settings"
      >
        <Settings className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onLogout}
        className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-xs font-bold text-white/50 transition hover:bg-white/[0.1] hover:text-white"
        title="Sign out"
      >
        {initial}
      </button>
    </div>
  </aside>
);

const FounderAsciiBlock: React.FC<{ className?: string }> = ({ className = "" }) => (
  <pre className={`founder-ascii-mark pointer-events-none text-[10px] ${className}`} aria-hidden="true">
{`        .  .  .  .  .
   +-------------------+
   |  DL SIGNAL MAP    |
   |  +----+     +--+  |
   |  |role|-----|fit| |
   |  +----+     +--+  |
   |     \\  proof  /   |
   |      +------+     |
   +-------------------+
        *  *  *  *`}
  </pre>
);

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
      else setError(data.error || "Could not create the role.");
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
    <div className="founder-dark-canvas flex min-h-screen">
      {showIntro && <FounderContextIntroModals onFinish={() => setShowIntro(false)} />}
      <FounderRail onLogout={() => void logout()} initial={firstName.slice(0, 1).toUpperCase()} />

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 founder-dark-dots opacity-[0.18]" />
        <FounderAsciiBlock className="absolute right-8 top-24 hidden opacity-45 lg:block" />

        <header className="relative z-10 flex h-16 items-center justify-between border-b border-white/10 px-6 sm:px-8">
          <h1 className="text-lg font-bold tracking-tight text-white">Sourcing</h1>
          <button
            type="button"
            onClick={startNewRole}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 transition hover:text-[#fa7d22]"
          >
            <Plus className="h-3.5 w-3.5" />
            New Search
          </button>
        </header>

        {pageLoading ? (
          <section className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#fa7d22]" />
          </section>
        ) : mode === "list" ? (
          <section className="relative z-10 mx-auto w-full max-w-[1220px] px-6 py-8 sm:px-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Roles Created</h2>
                <div className="mt-6 inline-flex overflow-hidden rounded-md bg-white text-sm font-semibold text-black">
                  <button type="button" className="bg-white px-6 py-2">Active</button>
                  <button type="button" className="bg-[#f0f0f0] px-6 py-2 text-black/70">Paused</button>
                </div>
              </div>
              <FounderAsciiBlock className="hidden text-[8px] opacity-25 md:block" />
            </div>

            <div className="divide-y divide-white/10 border-y border-white/10">
              {roles.map((role) => (
                <a
                  key={role.id}
                  href={`/founder/roles/${role.id}`}
                  className="group grid gap-4 px-0 py-6 transition hover:bg-white/[0.025] md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-white">{role.title || role.roleTitle || "Untitled role"}</p>
                    <p className="mt-1 truncate text-xs text-white/42">
                      Internship * 6 Months * $300-500 * Hybrid
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {["12 Recommended", "3 Contacted", "2 Accepted", "1 Trial", "0 Hired"].map((label) => (
                        <span key={label} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] text-white/48">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-white/34 md:justify-self-end">10:00 am * 12 June 2026</p>
                  <span className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-white/[0.11] px-4 text-xs font-semibold text-white transition group-hover:bg-[#fa7d22] group-hover:text-black">
                    View <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </a>
              ))}
            </div>

            <div className="mt-8">
              <FounderBillingCard />
            </div>
          </section>
        ) : (
          <section className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-10">
            <div className="w-full max-w-[580px]">
              <div className="mb-10 text-center">
                <h2 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">Hey! {firstName}</h2>
                <p className="mt-4 text-sm font-medium text-white/52">{current.title}</p>
              </div>

              <div
                className={`founder-dark-panel overflow-hidden rounded-2xl transition-all duration-200 ease-out ${
                  fading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
                }`}
              >
                <div className="divide-y divide-white/10">
                  {current.options.map((option, index) => {
                    const selected = answers[current.key] === current.format(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={busy}
                        onClick={() => void commit(option)}
                        className={`flex w-full items-center gap-5 px-6 py-4 text-left text-sm transition-colors hover:bg-white/[0.06] disabled:opacity-50 ${
                          selected ? "bg-white/[0.07] text-white" : "text-white/82"
                        }`}
                      >
                        <span className="w-4 text-center text-white/38">{index + 1}</span>
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
                        className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm font-medium text-white/42 transition-colors hover:text-white/75"
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
                        className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white outline-none transition-colors placeholder:text-white/28 focus:border-[#fa7d22]/60"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => void commit(customOpen ? customValue : answers[current.key] || current.options[0])}
                      disabled={busy || (customOpen && !customValue.trim())}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-5 text-sm font-bold text-black transition hover:bg-[#fa7d22] disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {step === questions.length - 1 ? "Finish" : "Continue"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between px-1 text-xs text-white/34">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={step === 0}
                  className="inline-flex items-center gap-1 transition hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <span className="tabular-nums">{step + 1} of {questions.length}</span>
                <button
                  type="button"
                  onClick={goForward}
                  disabled={step >= questions.length - 1 || !answers[current.key]}
                  className="inline-flex items-center gap-1 transition hover:text-white disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {error && <p className="mt-4 text-center text-sm font-medium text-red-300">{error}</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export const FounderHomePage: React.FC = () => (
  <AuthProvider>
    <FounderHomeInner />
  </AuthProvider>
);

export default FounderHomePage;
