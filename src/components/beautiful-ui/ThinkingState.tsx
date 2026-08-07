"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Adapted from Beautiful UI ThinkingState (Steps variant)
 * https://beautiful-ui-five.vercel.app/
 *
 * Accepts live step labels and stays open while `active`.
 */

type ThinkingStateProps = {
  steps: string[];
  active?: boolean;
  className?: string;
};

function useRevealWhileActive(stepCount: number, active: boolean) {
  const [visible, setVisible] = useState(active ? 1 : stepCount);
  useEffect(() => {
    if (!active) {
      setVisible(stepCount);
      return;
    }
    setVisible(1);
    if (stepCount <= 1) return;
    const id = window.setInterval(() => {
      setVisible((current) => Math.min(stepCount, current + 1));
    }, 1600);
    return () => window.clearInterval(id);
  }, [active, stepCount]);
  return Math.min(visible, Math.max(stepCount, 1));
}

export function ThinkingState({ steps, active = true, className = "" }: ThinkingStateProps) {
  const rows = steps.length > 0 ? steps : ["Working…"];
  const visible = useRevealWhileActive(rows.length, active);
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAt = useRef<number | null>(null);
  const autoExpanded = active;
  const expanded = manualExpanded ?? autoExpanded;
  const working = active;
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);

  useEffect(() => {
    if (active) {
      startedAt.current = Date.now();
      setElapsedSec(0);
      const id = window.setInterval(() => {
        if (!startedAt.current) return;
        setElapsedSec(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
      }, 400);
      return () => window.clearInterval(id);
    }
    if (startedAt.current) {
      setElapsedSec(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
    }
  }, [active]);

  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [visible, expanded, rows.length, active]);

  const doneLabel = `Thought for ${elapsedSec || 1} second${elapsedSec === 1 ? "" : "s"}`;

  return (
    <div className={`flex w-full flex-col ${className}`}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded((current) => !(current ?? autoExpanded))}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-100 hover:bg-[var(--bui-hover-2)]"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={working ? "var(--bui-ink-2)" : "var(--bui-ink-3)"}
          aria-hidden
        >
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
        {working ? (
          <span
            className="bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg, var(--bui-ink-3) 35%, var(--bui-ink) 50%, var(--bui-ink-3) 65%)",
              backgroundSize: "200% 100%",
              animation: "bui-shimmer-text 1.4s linear infinite",
            }}
          >
            Thinking
          </span>
        ) : (
          <span
            className="text-[13px] font-medium whitespace-nowrap text-[var(--bui-ink-2)]"
            style={{ animation: "bui-fade-in 350ms ease-out both" }}
          >
            {doneLabel}
          </span>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--bui-ink-3)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span
              aria-hidden
              className="absolute left-[3px] w-px bg-[var(--bui-line)]"
              style={{
                top: -8,
                height: lineHeight ? lineHeight - 2 : 0,
                transition: "height 500ms cubic-bezier(0.23,1,0.32,1)",
              }}
            />
            <div ref={traceRef} className="flex flex-col gap-1 py-1">
              {rows.slice(0, visible).map((primary, i) => {
                const isLast = i === visible - 1;
                const done = !working || !isLast;
                return (
                  <div
                    key={`${primary}-${i}`}
                    className="flex min-h-7 w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-left"
                    style={{
                      animation: `bui-fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
                    }}
                  >
                    {done ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--bui-ink-3)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0"
                        aria-hidden
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <span
                        className="size-3 shrink-0 rounded-full border-[1.5px] border-[var(--bui-line-strong)] border-t-[var(--bui-ink-2)]"
                        style={{ animation: "bui-spin 700ms linear infinite" }}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 truncate text-[12.5px] font-medium text-[var(--bui-ink)]">
                      {primary}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThinkingState;
