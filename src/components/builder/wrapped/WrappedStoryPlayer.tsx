import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toBlob, toPng } from 'html-to-image';
import { Check, ChevronLeft, ChevronRight, Clipboard, Download, Loader2, Share2 } from 'lucide-react';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { CARD_ORDER } from './theme';
import CoverCard from './cards/CoverCard';
import TimeInvestedCard from './cards/TimeInvestedCard';
import StackCard from './cards/StackCard';
import BuildSurfaceCard from './cards/BuildSurfaceCard';
import MultiAgentCard from './cards/MultiAgentCard';
import IdentityCard from './cards/IdentityCard';

const DURATION_MS = 6500;
const HOLD_THRESHOLD_MS = 250;
const EXPORT_PIXEL_RATIO = 2.8;

export const WrappedStoryPlayer: React.FC<{ report: AgentWrappedReport }> = ({ report }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done'>('idle');
  const [copied, setCopied] = useState(false);
  const pointerDownAt = useRef(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const total = CARD_ORDER.length;

  const goTo = useCallback(
    (next: number) => {
      setActiveIndex(Math.max(0, Math.min(total - 1, next)));
    },
    [total]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') goTo(activeIndex + 1);
      if (event.key === 'ArrowLeft') goTo(activeIndex - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, goTo]);

  const handlePointerDown = () => {
    pointerDownAt.current = Date.now();
    setPaused(true);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    setPaused(false);
    const held = Date.now() - pointerDownAt.current;
    if (held >= HOLD_THRESHOLD_MS) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    if (relativeX < 0.32) goTo(activeIndex - 1);
    else goTo(activeIndex + 1);
  };

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return report.share.publicUrl;
    return report.share.publicUrl.startsWith('http')
      ? report.share.publicUrl
      : `${window.location.origin}${report.share.publicUrl}`;
  }, [report.share.publicUrl]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const downloadCard = async () => {
    if (!frameRef.current) return;
    setExportState('working');
    try {
      const dataUrl = await toPng(frameRef.current, { pixelRatio: EXPORT_PIXEL_RATIO, cacheBust: true });
      const link = document.createElement('a');
      link.download = `devlabs-wrapped-${CARD_ORDER[activeIndex]}.png`;
      link.href = dataUrl;
      link.click();
      setExportState('done');
      window.setTimeout(() => setExportState('idle'), 1600);
    } catch {
      setExportState('idle');
    }
  };

  const shareCard = async () => {
    if (!frameRef.current) return;
    setExportState('working');
    try {
      const blob = await toBlob(frameRef.current, { pixelRatio: EXPORT_PIXEL_RATIO, cacheBust: true });
      const file = blob ? new File([blob], 'devlabs-wrapped.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My DevLabs Builder Wrapped', text: report.archetype });
      } else if (navigator.share) {
        await navigator.share({ title: 'My DevLabs Builder Wrapped', url: shareUrl });
      } else {
        await copyLink();
      }
      setExportState('idle');
    } catch {
      setExportState('idle');
    }
  };

  const renderCard = () => {
    const props = { report, index: activeIndex + 1, total } as const;
    switch (CARD_ORDER[activeIndex]) {
      case 'cover':
        return <CoverCard report={report} total={total} />;
      case 'time':
        return <TimeInvestedCard {...props} />;
      case 'stack':
        return <StackCard {...props} />;
      case 'buildSurface':
        return <BuildSurfaceCard {...props} />;
      case 'agents':
        return <MultiAgentCard {...props} />;
      case 'identity':
        return <IdentityCard {...props} />;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className="mb-2.5 flex gap-1.5">
        {CARD_ORDER.map((key, i) => (
          <div key={`${key}-${i}`} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
            {i < activeIndex ? (
              <div className="h-full w-full rounded-full bg-white" />
            ) : i === activeIndex ? (
              <div
                key={activeIndex}
                className="h-full rounded-full bg-white"
                style={{
                  animationName: 'devlabs-wrapped-progress',
                  animationDuration: `${DURATION_MS}ms`,
                  animationTimingFunction: 'linear',
                  animationFillMode: 'forwards',
                  animationPlayState: paused ? 'paused' : 'running',
                }}
                onAnimationEnd={() => goTo(activeIndex + 1)}
              />
            ) : null}
          </div>
        ))}
      </div>
      <style>{`@keyframes devlabs-wrapped-progress { from { width: 0%; } to { width: 100%; } }`}</style>

      <div
        className="relative select-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setPaused(false)}
      >
        <div ref={frameRef}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {renderCard()}
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          aria-label="Previous card"
          onClick={(e) => {
            e.stopPropagation();
            goTo(activeIndex - 1);
          }}
          className="absolute left-1.5 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white/80 backdrop-blur-sm hover:bg-black/50 sm:-left-11 sm:block"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Next card"
          onClick={(e) => {
            e.stopPropagation();
            goTo(activeIndex + 1);
          }}
          className="absolute right-1.5 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white/80 backdrop-blur-sm hover:bg-black/50 sm:-right-11 sm:block"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={downloadCard}
          disabled={exportState === 'working'}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#fa7d22] px-4 text-sm font-bold text-black transition hover:bg-[#ff9b4e] disabled:opacity-60"
        >
          {exportState === 'working' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : exportState === 'done' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exportState === 'done' ? 'Saved' : 'Download card'}
        </button>
        <button
          type="button"
          onClick={shareCard}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-bold text-white transition hover:bg-white/10"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-bold text-white transition hover:bg-white/10"
        >
          <Clipboard className="h-4 w-4" />
          {copied ? 'Copied' : 'Link'}
        </button>
      </div>
    </div>
  );
};

export default WrappedStoryPlayer;
