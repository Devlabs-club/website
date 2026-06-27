import React, { useState } from "react";
import { ChevronLeft, ThumbsDown, ThumbsUp, X } from "lucide-react";

interface Props {
  /** When provided, the modal renders as an overlay and calls this instead of navigating away. */
  onFinish?: () => void;
}

const SUBTEXT_TITLE = "Devlabs will help you get the best talent, right fit for your team";
const SUBTEXT_BODY =
  "Every hiring platform on the internet is like a talent database — no filtration, just a plain database. We are changing that with Devlabs.";

const ComparisonArt = () => (
  <div className="flex items-stretch justify-center gap-4 rounded-xl bg-muted/60 p-8">
    <div className="flex-1">
      <ThumbsUp className="mx-auto mb-3 h-5 w-5 text-emerald-500" />
      <div className="rotate-[-4deg] rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-center text-sm font-medium text-foreground">Devlabs</p>
        <div className="my-3 space-y-1.5">
          <div className="h-1.5 w-full rounded bg-muted" />
          <div className="h-1.5 w-2/3 rounded bg-muted" />
        </div>
        <p className="text-center text-xs italic text-muted-foreground">Real projects</p>
      </div>
    </div>
    <div className="flex-1">
      <ThumbsDown className="mx-auto mb-3 h-5 w-5 text-destructive" />
      <div className="rotate-[4deg] rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-center text-sm font-medium text-foreground">Other Platforms</p>
        <div className="my-3 space-y-1.5">
          <div className="h-1.5 w-full rounded bg-muted" />
          <div className="h-1.5 w-2/3 rounded bg-muted" />
        </div>
        <p className="text-center text-xs italic text-muted-foreground">Generic skills</p>
      </div>
    </div>
  </div>
);

const FlowArt = () => (
  <div className="flex items-stretch gap-3 rounded-xl bg-muted/60 p-8">
    <div className="flex flex-1 flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs italic text-muted-foreground">
        Enter the job details and we&apos;ll curate the list of best builders for your requirement.
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-md border border-border p-2">
        <div className="h-3 w-3 rounded-full bg-muted" />
        <div className="h-2 flex-1 rounded bg-muted" />
      </div>
    </div>
    <div className="flex-1 rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-medium text-foreground">Job Description</p>
      <div className="space-y-1.5">
        <div className="h-1.5 w-1/2 rounded bg-muted" />
        <div className="h-1.5 w-full rounded bg-muted" />
        <div className="h-1.5 w-full rounded bg-muted" />
        <div className="h-1.5 w-3/4 rounded bg-muted" />
      </div>
    </div>
  </div>
);

export const FounderContextIntroModals: React.FC<Props> = ({ onFinish }) => {
  const [step, setStep] = useState(0);

  const finish = async () => {
    try {
      await fetch("/api/founder/onboarding-complete", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    if (onFinish) onFinish();
    else window.location.href = "/founder/home";
  };

  const slides = [
    { title: "It's Not like Any Other Hiring Platform", art: <ComparisonArt /> },
    { title: "Enter Your Details & Find The Right Builders", art: <FlowArt /> },
  ];
  const current = slides[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-6 py-10 backdrop-blur-sm">
      {step > 0 && (
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          className="absolute left-5 top-5 flex items-center gap-1 text-sm font-medium text-background/90 hover:text-background"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
      )}

      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-foreground">{current.title}</h2>
          <button type="button" onClick={finish} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {current.art}

        <p className="mt-6 text-center text-sm text-foreground">{SUBTEXT_TITLE}</p>
        <p className="mt-3 text-center text-sm text-muted-foreground">{SUBTEXT_BODY}</p>

        <button
          type="button"
          onClick={() => (step < slides.length - 1 ? setStep(step + 1) : finish())}
          className="mt-7 h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Continue
        </button>

        <div className="mt-5 flex justify-center gap-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-foreground" : "w-1.5 bg-muted"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default FounderContextIntroModals;
