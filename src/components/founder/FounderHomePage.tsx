import React, { useEffect, useMemo, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth_manager";
import { AppTopBar } from "@/components/app/AppTopBar";
import FounderContextIntroModals from "@/components/founder/FounderContextIntroModals";
import { ArrowRight, ChevronLeft, ChevronRight, Loader2, Paperclip, Plus } from "lucide-react";

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

/** Friendly gradient avatar with two eyes, matching the home hero. */
const HeroBubble: React.FC = () => (
  <div className="relative mx-auto h-16 w-16">
    <div
      className="h-16 w-16 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      style={{
        background:
          "radial-gradient(120% 120% at 30% 25%, #c9b8ff 0%, #ffb3d9 38%, #aee3ff 68%, #b6f5c9 100%)",
      }}
    />
    <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-700/80" />
      <span className="h-1.5 w-1.5 rounded-full bg-slate-700/80" />
    </div>
  </div>
);

const FounderHomeInner: React.FC = () => {
  const { user, loading } = useAuth();
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
    if (!loading && !user) window.location.href = "/auth/login?redirect=/founder/home";
    if (!loading && user && user.accountType !== "founder" && user.role !== "founder") {
      window.location.href = "/auth/select-role";
    }
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
    <div className="min-h-screen bg-background text-foreground">
      {showIntro && <FounderContextIntroModals onFinish={() => setShowIntro(false)} />}
      <AppTopBar />
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-16 sm:px-6">
        <section className="mb-8 text-center">
          <HeroBubble />
          <h1 className="mt-6 text-4xl font-semibold tracking-tight">Hey! {firstName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">How can we help you, today?</p>
        </section>

        {pageLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : mode === "list" ? (
          <section className="w-full space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-muted-foreground">Your open roles</h2>
              <button
                type="button"
                onClick={startNewRole}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Plus className="h-4 w-4" /> New role
              </button>
            </div>
            <div className="space-y-2.5">
              {roles.map((role) => (
                <a
                  key={role.id}
                  href={`/founder/roles/${role.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{role.title || role.roleTitle || "Untitled role"}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {(role.skillsNeeded || []).slice(0, 4).join(", ") || "Draft role"}
                      {role.status ? ` · ${role.status}` : ""}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              ))}
            </div>
          </section>
        ) : (
          <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div
              className={`transition-all duration-200 ease-out ${
                fading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
              }`}
            >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold">{current.title}</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={step === 0}
                  className="rounded-md p-0.5 transition-colors hover:bg-muted disabled:opacity-30"
                  aria-label="Previous question"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="tabular-nums">
                  {step + 1} of {questions.length}
                </span>
                <button
                  type="button"
                  onClick={goForward}
                  disabled={step >= questions.length - 1 || !answers[current.key]}
                  className="rounded-md p-0.5 transition-colors hover:bg-muted disabled:opacity-30"
                  aria-label="Next question"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="divide-y divide-border">
              {current.options.map((option, index) => {
                const selected = answers[current.key] === current.format(option);
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    onClick={() => void commit(option)}
                    className={`flex w-full items-center gap-3 py-3 text-left text-sm transition-colors hover:text-foreground disabled:opacity-50 ${
                      selected ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-medium ${
                        selected ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-foreground">{option}</span>
                  </button>
                );
              })}

              <div className="py-3">
                {!customOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomOpen(true);
                      setError("");
                    }}
                    className="flex w-full items-center gap-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" />
                    </span>
                    Something else
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commit(customValue);
                      }}
                      placeholder={current.placeholder}
                      autoFocus
                      disabled={busy}
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
                    />
                    <button
                      type="button"
                      onClick={() => void commit(customValue)}
                      disabled={busy || !customValue.trim()}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {step === questions.length - 1 ? "Finish" : "Next"}
                    </button>
                  </div>
                )}
              </div>
            </div>
            </div>

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
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
