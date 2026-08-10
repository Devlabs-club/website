import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EnrichmentVisualStage } from './BuilderEnrichmentAsciiVisual';

const STEPS: Array<{
  id: EnrichmentVisualStage;
  title: string;
  detail: string;
}> = [
  {
    id: 'linkedin',
    title: 'Reading LinkedIn',
    detail: 'Work history, school, and the basics.',
  },
  {
    id: 'github',
    title: 'Checking GitHub',
    detail: 'Repos, languages, and shipped projects.',
  },
  {
    id: 'research',
    title: 'Checking the web',
    detail: 'Resume, Devpost, portfolio, and anything useful.',
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
  /** Exact live fetch brief (URL, repo, page). */
  brief?: string | null;
  /** Rolling feed of recent live briefs. */
  log?: string[];
};

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function cleanStatusText(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  return text
    .replace(/founder-facing profile/gi, 'profile')
    .replace(/founder-facing highlights/gi, 'useful highlights')
    .replace(/founder-facing fields/gi, 'profile fields')
    .replace(/\bDeep research\b/g, 'Checking the web')
    .replace(/\bdeep research\b/g, 'checking the web');
}

export function BuilderProfileEnrichmentOverlay({
  stage,
  label,
  detail,
  brief,
  log = [],
}: Props) {
  const [visible, setVisible] = useState(true);
  const [displayStage, setDisplayStage] = useState(stage);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [barPulse, setBarPulse] = useState(0);
  const [briefFlash, setBriefFlash] = useState(false);
  const transitionRef = useRef<number | null>(null);
  const startedAtRef = useRef(Date.now());
  const lastBriefRef = useRef<string | null>(null);

  const activeStep = STEPS[STAGE_INDEX[displayStage]] || STEPS[0];
  const activeIndex = STAGE_INDEX[displayStage] ?? 0;
  const activeLabel = displayStage === stage ? cleanStatusText(label) || activeStep.title : activeStep.title;
  const liveBrief =
    displayStage === stage && brief?.trim()
      ? cleanStatusText(brief) || brief.trim()
      : displayStage === stage && detail
        ? cleanStatusText(detail) || detail
        : activeStep.detail;
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

  useEffect(() => {
    const next = brief?.trim() || null;
    if (!next || next === lastBriefRef.current) return;
    lastBriefRef.current = next;
    setBriefFlash(true);
    const t = window.setTimeout(() => setBriefFlash(false), 420);
    return () => window.clearTimeout(t);
  }, [brief]);

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
        className={`relative z-10 w-full max-w-4xl border border-black/10 bg-white text-left shadow-[0_24px_80px_rgb(5_5_5_/_0.14)] transition-all duration-300 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'
        }`}
      >
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="border-b border-black/10 px-6 py-7 sm:px-8 lg:border-b-0 lg:border-r lg:px-9 lg:py-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.66rem] font-extrabold uppercase tracking-[0.24em] text-[#bf4f08]">
                  Profile update running
                </p>
                <h2 className="mt-3 text-[1.7rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#050505] sm:text-[2.15rem]">
                  Pulling your links in.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-black/50">
                  Keep this open. Stuff will fill in as each source finishes.
                </p>
              </div>
              <p className="shrink-0 pt-1 font-mono text-[0.72rem] tabular-nums text-black/40">
                {formatElapsed(elapsedSec)}
              </p>
            </div>

            <div className="mt-7">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-black/35">
                    Current
                  </p>
                  <p className="mt-1 text-lg font-extrabold tracking-[-0.02em] text-[#050505]">
                    {activeLabel}
                    <span className="builder-enrichment-pulse ml-2 inline-block h-2 w-2 align-middle bg-[#ff7417]" />
                  </p>
                </div>
                <span className="font-mono text-2xl font-extrabold tabular-nums text-[#bf4f08]">{progressPct}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden bg-black/[0.06]">
                <div
                  className="builder-enrichment-progress-fill h-full bg-[#ff7417] transition-[width] duration-700 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div
              className={`mt-6 border border-black/8 bg-[#fffcfa] px-4 py-4 transition-colors duration-300 ${
                briefFlash ? 'border-[#ff7417]/45 bg-[#fff4eb]' : ''
              }`}
            >
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-[#bf4f08]">
                Now
              </p>
              <p className="mt-2 font-mono text-sm leading-6 text-[#050505] break-all">
                {liveBrief}
              </p>
            </div>

            <p className="mt-5 text-[0.8rem] leading-5 text-black/45">
              The line above updates as we move through each source.
            </p>
          </div>

          <aside className="bg-[#fffcfa] px-5 py-6 sm:px-6 lg:py-8">
            <ol className="space-y-2">
              {STEPS.map((step, index) => {
                const done = index < activeIndex;
                const current = index === activeIndex;
                return (
                  <li
                    key={step.id}
                    className={`border px-3 py-3 ${
                      current
                        ? 'border-[#ff7417]/35 bg-[#fff4eb]'
                        : done
                          ? 'border-black/8 bg-white'
                          : 'border-black/8 bg-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[0.62rem] font-extrabold ${
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
                      <p
                        className={`text-sm font-extrabold tracking-[-0.02em] ${
                          current ? 'text-[#050505]' : done ? 'text-black/55' : 'text-black/35'
                        }`}
                      >
                        {current ? activeLabel : step.title}
                      </p>
                    </div>
                    <p className={`mt-2 pl-7 text-[0.78rem] leading-5 ${current ? 'text-black/55' : 'text-black/35'}`}>
                      {step.detail}
                    </p>
                  </li>
                );
              })}
            </ol>

            <div className="mt-5 border-t border-black/10 pt-4">
              <p className="text-[0.72rem] font-semibold leading-5 text-black/45">
                You can leave this tab open. We will send you back when it is done.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default BuilderProfileEnrichmentOverlay;
