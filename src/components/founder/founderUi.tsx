import React from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 glass-panel px-5 py-4 text-white/60 text-sm">
      <Loader2 className="w-4 h-4 animate-spin text-[#fa7d22] shrink-0" />
      <span>{label || 'Loading…'}</span>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-amber-100">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-[#ffb580] hover:text-white"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function FunnelSteps({
  steps,
}: {
  steps: Array<{ label: string; done: boolean; current?: boolean }>;
}) {
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((step, i) => (
        <li
          key={step.label}
          className={`px-3 py-1.5 rounded-full border ${
            step.done
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : step.current
                ? 'border-[#fa7d22]/40 bg-[#fa7d22]/15 text-[#ffb580]'
                : 'border-white/15 bg-white/5 text-white/45'
          }`}
        >
          {i + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}
