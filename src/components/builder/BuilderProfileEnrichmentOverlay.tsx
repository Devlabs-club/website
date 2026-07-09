import React, { useEffect, useRef, useState } from 'react';
import { BuilderEnrichmentAsciiVisual, type EnrichmentVisualStage } from './BuilderEnrichmentAsciiVisual';

const enrichmentStages: Record<
  EnrichmentVisualStage,
  { label: string; detail: string }
> = {
  linkedin: {
    label: 'Scraping information from LinkedIn right now',
    detail: 'Reading your public profile, roles, education, and builder proof.',
  },
  github: {
    label: 'Scraping your GitHub right now',
    detail: 'Scanning repositories, commits, languages, and projects that show how you ship.',
  },
  research: {
    label: 'Deep research going on your profile right now',
    detail: 'Connecting the dots across your resume, web presence, and founder-facing highlights.',
  },
};

type Props = {
  stage: EnrichmentVisualStage;
  label?: string | null;
  detail?: string | null;
};

export function BuilderProfileEnrichmentOverlay({ stage, label, detail }: Props) {
  const [visible, setVisible] = useState(true);
  const [displayStage, setDisplayStage] = useState(stage);
  const transitionRef = useRef<number | null>(null);
  const activeStage = enrichmentStages[displayStage];
  const activeLabel = displayStage === stage && label ? label : activeStage.label;
  const activeDetail = displayStage === stage && detail ? detail : activeStage.detail;

  useEffect(() => {
    if (stage === displayStage) return;
    setVisible(false);
    transitionRef.current = window.setTimeout(() => {
      setDisplayStage(stage);
      setVisible(true);
    }, 240);
    return () => {
      if (transitionRef.current) window.clearTimeout(transitionRef.current);
    };
  }, [displayStage, stage]);

  return (
    <div
      className="builder-enrichment-overlay pointer-events-auto absolute inset-0 z-40 flex min-h-full items-center justify-center px-5 py-10"
      role="status"
      aria-live="polite"
      aria-label={activeLabel}
    >
      <div className="builder-enrichment-backdrop absolute inset-0 bg-[#fbf6f3]/92 backdrop-blur-[28px] backdrop-saturate-[1.2]" aria-hidden />
      <div className="builder-enrichment-scrim absolute inset-0" aria-hidden />

      <div
        className={`relative z-10 w-full max-w-lg border border-black/10 bg-white px-8 py-10 text-center shadow-[0_24px_80px_rgb(5_5_5_/_0.14)] transition-all duration-300 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'
        }`}
      >
        <p className="text-[0.66rem] font-extrabold uppercase tracking-[0.24em] text-[#bf4f08]">
          Builder profile enrichment
        </p>

        <div className="relative mt-7 overflow-hidden border border-black/8 bg-[#fffcfa]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ff7417]/35 to-transparent" aria-hidden />
          <BuilderEnrichmentAsciiVisual key={displayStage} stage={displayStage} className="h-52" />
        </div>

        <p className="mt-7 text-lg font-extrabold tracking-[-0.02em] text-[#050505]">{activeLabel}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black/55">{activeDetail}</p>
      </div>
    </div>
  );
}

export default BuilderProfileEnrichmentOverlay;
