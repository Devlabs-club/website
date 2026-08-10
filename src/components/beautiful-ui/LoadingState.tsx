"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "@/components/beautiful-ui/agent.css";

/**
 * Adapted from Beautiful UI Loading State
 * https://beautiful-ui-five.vercel.app/
 *
 * Pixel-grid loader with shimmer label + elapsed timer.
 * Distinct from ThinkingState — use this for result panes / tool runs.
 */

type LoadingVariant = "drive" | "dots" | "orbit";

type LoadingStateProps = {
  label?: string;
  captions?: string[];
  variant?: LoadingVariant;
  active?: boolean;
  className?: string;
};

const GRID = 5;
const CELL_COUNT = GRID * GRID;

function cellOpacity(variant: LoadingVariant, index: number, tick: number): number {
  const row = Math.floor(index / GRID);
  const col = index % GRID;
  const center = (GRID - 1) / 2;

  if (variant === "drive") {
    const wave = (col + row + tick) % (GRID + 2);
    return wave < 2 ? 0.95 : wave < 3 ? 0.45 : 0.12;
  }

  if (variant === "dots") {
    const phase = (tick + index * 2) % 10;
    return phase < 3 ? 0.95 : phase < 5 ? 0.4 : 0.14;
  }

  // orbit — ring sweeps around the center
  const dx = col - center;
  const dy = row - center;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.4) return 0.2 + (tick % 6 === 0 ? 0.55 : 0);
  const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
  const sweep = ((tick % 16) / 16) * Math.PI * 2;
  const delta = Math.abs(((angle - sweep + Math.PI) % (Math.PI * 2)) - Math.PI);
  if (delta < 0.55 && dist > 0.9 && dist < 2.2) return 0.95;
  if (delta < 1.1 && dist > 0.9 && dist < 2.2) return 0.4;
  return 0.12;
}

export function LoadingState({
  label = "Searching",
  captions,
  variant = "orbit",
  active = true,
  className = "",
}: LoadingStateProps) {
  const [tick, setTick] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [captionIndex, setCaptionIndex] = useState(0);
  const startedAt = useRef<number | null>(null);
  const lines = useMemo(() => (captions && captions.length > 0 ? captions : null), [captions]);

  useEffect(() => {
    if (!active) return;
    startedAt.current = Date.now();
    setElapsedSec(0);
    setTick(0);
    setCaptionIndex(0);
    const tickId = window.setInterval(() => setTick((t) => t + 1), 120);
    const elapsedId = window.setInterval(() => {
      if (!startedAt.current) return;
      setElapsedSec(Math.max(0, Math.round((Date.now() - startedAt.current) / 100) / 10));
    }, 100);
    return () => {
      window.clearInterval(tickId);
      window.clearInterval(elapsedId);
    };
  }, [active]);

  useEffect(() => {
    if (!active || !lines || lines.length <= 1) return;
    const id = window.setInterval(() => {
      setCaptionIndex((i) => (i + 1) % lines.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [active, lines]);

  const caption = lines ? lines[captionIndex % lines.length] : null;
  const timeLabel = `${elapsedSec.toFixed(1)}s`;

  return (
    <div className={`flex w-full items-center gap-3 ${className}`} aria-live="polite" aria-busy={active}>
      <div
        aria-hidden
        className="grid shrink-0 gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${GRID}, 5px)` }}
      >
        {Array.from({ length: CELL_COUNT }, (_, index) => (
          <span
            key={index}
            className="size-[5px] rounded-[1px] bg-[var(--bui-ink,#111)] transition-opacity duration-150"
            style={{ opacity: cellOpacity(variant, index, tick) }}
          />
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className="bg-clip-text text-[13px] font-medium text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg, var(--bui-ink-3,#9a928a) 35%, var(--bui-ink,#111) 50%, var(--bui-ink-3,#9a928a) 65%)",
              backgroundSize: "200% 100%",
              animation: active ? "bui-shimmer-text 1.4s linear infinite" : undefined,
            }}
          >
            {label}
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--bui-ink-3,#9a928a)]">
            {timeLabel}
          </span>
        </div>
        {caption ? (
          <p
            key={caption}
            className="mt-0.5 truncate text-[12.5px] text-[var(--bui-ink-2,#6b6560)]"
            style={{ animation: "bui-fade-in 280ms ease-out both" }}
          >
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default LoadingState;
