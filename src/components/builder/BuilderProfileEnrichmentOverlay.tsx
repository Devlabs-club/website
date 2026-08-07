import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BuilderEnrichmentAsciiVisual, type EnrichmentVisualStage } from './BuilderEnrichmentAsciiVisual';

const STEPS: Array<{
  id: EnrichmentVisualStage;
  title: string;
  detail: string;
}> = [
  {
    id: 'linkedin',
    title: 'Reading LinkedIn',
    detail: 'Public profile, roles, education, and builder proof.',
  },
  {
    id: 'github',
    title: 'Scanning GitHub',
    detail: 'Repos, languages, and projects that show how you ship.',
  },
  {
    id: 'research',
    title: 'Deep research',
    detail: 'Connecting resume, web presence, and founder-facing highlights.',
  },
];

const STAGE_INDEX: Record<EnrichmentVisualStage, number> = {
  linkedin: 0,
  github: 1,
  research: 2,
};

type Props = {
  stage: EnrichmentVisualStage;
  label?: string | null;
  detail?: string | null;
};

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function BuilderProfileEnrichmentOverlay({ stage, label, detail }: Props) {
  const [visible, setVisible] = useState(true);
  const [displayStage, setDisplayStage] = useState(stage);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [barPulse, setBarPulse] = useState(0);
  const transitionRef = useRef<number | null>(null);
  const startedAtRef = useRef(Date.now());

  const activeStep = STEPS[STAGE_INDEX[displayStage]] || STEPS[0];
  const activeIndex = STAGE_INDEX[displayStage] ?? 0;
  const activeLabel = displayStage === stage && label ? label : activeStep.title;
  const activeDetail = displayStage === stage && detail ? detail : activeStep.detail;

  const progressPct = useMemo(() => {
    const base = (activeIndex / STEPS.length) * 100;
    const within = 18 + (barPulse % 22);
    return Math.min(94, Math.round(base + within));
  }, [activeIndex, barPulse]);

  useEffect(() => {
    startedAtRef.current = Date.now();
    setElapsedSec(0);
    const tick = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      setBarPulse((v) => v + 1);
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (stage === displayStage) return;
    setVisible(false);
    transitionRef.current = window.setTimeout(() => {
      setDisplayStage(stage);
      setVisible(true);
    }, 220);
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
      <div
        className="builder-enrichment-backdrop absolute inset-0 bg-[#fbf6f3]/92 backdrop-blur-[28px] backdrop-saturate-[1.2]"
        aria-hidden
      />
      <div className="builder-enrichment-scrim absolute inset-0" aria-hidden />

      <div
        className={`relative z-10 w-full max-w-xl border border-black/10 bg-white px-7 py-8 text-left shadow-[0_24px_80px_rgb(5_5_5_/_0.14)] transition-all duration-300 sm:px-9 sm:py-9 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.66rem] font-extrabold uppercase tracking-[0.24em] text-[#bf4f08]">
              Builder profile enrichment
            </p>
            <h2 className="mt-3 text-xl font-extrabold tracking-[-0.03em] text-[#050505] sm:text-2xl">
              Building your founder-facing profile
            </h2>
          </div>
          <p className="shrink-0 pt-1 font-mono text-[0.7rem] tabular-nums text-black/40">
            {formatElapsed(elapsedSec)}
          </p>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-black/45">
            <span>
              Step {activeIndex + 1} of {STEPS.length}
            </span>
            <span className="tabular-nums text-[#bf4f08]">{progressPct}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden bg-black/[0.06]">
            <div
              className="builder-enrichment-progress-fill h-full bg-[#ff7417] transition-[width] duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-[1fr_148px] sm:items-stretch">
          <ol className="space-y-0 border border-black/8 bg-[#fffcfa]">
            {STEPS.map((step, index) => {
              const done = index < activeIndex;
              const current = index === activeIndex;
              return (
                <li
                  key={step.id}
                  className={`flex gap-3 border-b border-black/8 px-4 py-3.5 last:border-b-0 ${
                    current ? 'bg-[#fff4eb]' : ''
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[0.65rem] font-extrabold ${
                      done
                        ? 'border-[#ff7417] bg-[#ff7417] text-white'
                        : current
                          ? 'border-[#ff7417] text-[#ff7417]'
                          : 'border-black/15 text-black/30'
                    }`}
                    aria-hidden
                  >
                    {done ? '✓' : index + 1}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-extrabold tracking-[-0.02em] ${
                        current ? 'text-[#050505]' : done ? 'text-black/55' : 'text-black/35'
                      }`}
                    >
                      {current ? activeLabel : step.title}
                      {current ? (
                        <span className="builder-enrichment-pulse ml-2 inline-block h-1.5 w-1.5 rounded-none bg-[#ff7417] align-middle" />
                      ) : null}
                    </p>
                    <p
                      className={`mt-0.5 text-[0.8rem] leading-5 ${
                        current ? 'text-black/55' : 'text-black/35'
                      }`}
                    >
                      {current ? activeDetail : step.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="relative hidden overflow-hidden border border-black/8 bg-[#fffcfa] sm:block">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ff7417]/35 to-transparent"
              aria-hidden
            />
            <BuilderEnrichmentAsciiVisual key={displayStage} stage={displayStage} className="h-full min-h-[168px]" />
          </div>
        </div>

        <p className="mt-5 text-[0.8rem] leading-5 text-black/45">
          Usually under a minute. Keep this tab open — we&apos;ll drop you into your profile when it&apos;s ready.
        </p>
      </div>
    </div>
  );
}

export default BuilderProfileEnrichmentOverlay;
