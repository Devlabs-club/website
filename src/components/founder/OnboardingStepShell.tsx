import React from "react";
import { ThemeToggle } from "@/components/app/ThemeToggle";

interface Props {
  step: number;
  totalSteps: number;
  children: React.ReactNode;
}

/** Centered card layout with a "Step X of N" indicator (founder onboarding reviews). */
export const OnboardingStepShell: React.FC<Props> = ({ step, totalSteps, children }) => {
  return (
    <div className="relative min-h-screen bg-muted/30 px-6 py-12">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <p className="mb-8 text-center text-sm text-muted-foreground">
        Step <span className="font-semibold text-foreground">{step}</span> of {totalSteps}
      </p>

      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
};

export default OnboardingStepShell;
