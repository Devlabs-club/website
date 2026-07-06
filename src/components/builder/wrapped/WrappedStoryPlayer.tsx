import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
const CARD_GLOWS = [
  'radial-gradient(ellipse at center, rgba(124,58,237,0.42) 0%, rgba(147,51,234,0.3) 30%, rgba(88,28,135,0.16) 50%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(239,68,68,0.42) 0%, rgba(220,38,38,0.29) 30%, rgba(127,29,29,0.16) 52%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(16,185,129,0.4) 0%, rgba(5,150,105,0.27) 30%, rgba(6,78,59,0.15) 52%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(249,115,22,0.42) 0%, rgba(234,88,12,0.28) 30%, rgba(124,45,18,0.15) 52%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(37,99,235,0.4) 0%, rgba(29,78,216,0.27) 30%, rgba(30,58,138,0.15) 52%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(168,85,247,0.42) 0%, rgba(126,34,206,0.28) 30%, rgba(88,28,135,0.15) 52%, transparent 72%)',
];

export const WrappedStoryPlayer: React.FC<{ report: AgentWrappedReport }> = ({ report }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done'>('idle');
  const [copied, setCopied] = useState(false);
  const pointerDownAt = useRef(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const total = CARD_ORDER.length;
  const reduceMotion = useReducedMotion();

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
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={`wrapped-glow-${activeIndex}`}
          initial={reduceMotion ? false : { opacity: 0, scaleX: 0.78, scaleY: 0.58, y: 90 }}
          animate={
            reduceMotion
              ? undefined
              : {
                  opacity: [0, 0.96, 0.86],
                  scaleX: [0.78, 1.08, 1.02],
                  scaleY: [0.58, 1.18, 1.04],
                  y: [90, -18, 0],
                }
          }
          exit={reduceMotion ? undefined : { opacity: 0, scaleX: 0.9, scaleY: 0.72, y: 40 }}
          transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none fixed bottom-[-52rem] left-1/2 z-0 h-[78rem] w-[154vw] min-w-[98rem] -translate-x-1/2 rounded-[100%] blur-2xl"
          style={{ background: CARD_GLOWS[activeIndex] }}
        />
      </AnimatePresence>
      <div className="relative z-10 mx-auto w-full max-w-[min(577px,calc(100vw-22px))]">
      <div className="mb-3 flex gap-1.5 px-1">
        {CARD_ORDER.map((key, i) => (
          <div key={`${key}-${i}`} className="h-[4px] flex-1 overflow-hidden rounded-full bg-black/15">
            {i < activeIndex ? (
              <div className="h-full w-full rounded-full bg-[#fa7d22]" />
            ) : i === activeIndex ? (
              <div
                key={activeIndex}
                className="h-full rounded-full bg-[#14110f]"
                style={{
                  animationName: 'devlabs-wrapped-progress',
                  animationDuration: reduceMotion ? '1ms' : `${DURATION_MS}ms`,
                  animationTimingFunction: 'linear',
                  animationFillMode: 'forwards',
                  animationPlayState: paused ? 'paused' : 'running',
                }}
                onAnimationEnd={() => {
                  if (!reduceMotion) goTo(activeIndex + 1);
                }}
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
        <AnimatePresence mode="wait">
          <motion.div
            ref={frameRef}
            key={activeIndex}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.985, y: 12, rotate: -0.8 }}
            animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0, rotate: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.99, y: -10, rotate: 0.8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            {renderCard()}
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          aria-label="Previous card"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            goTo(activeIndex - 1);
          }}
          className="absolute left-1.5 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-black/10 bg-white p-2 text-[#14110f] shadow-[0_12px_30px_rgba(33,24,16,0.14)] hover:bg-[#fff7ef] sm:-left-14 sm:block"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Next card"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            goTo(activeIndex + 1);
          }}
          className="absolute right-1.5 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-black/10 bg-white p-2 text-[#14110f] shadow-[0_12px_30px_rgba(33,24,16,0.14)] hover:bg-[#fff7ef] sm:-right-14 sm:block"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 rounded-[1.65rem] border border-[#f1dfcf] bg-white/82 p-1.5 shadow-[0_24px_70px_rgba(34,18,9,0.12)] backdrop-blur sm:flex sm:gap-1.5">
        <button
          type="button"
          onClick={downloadCard}
          disabled={exportState === 'working'}
          className="inline-flex h-11 w-full flex-1 items-center justify-center gap-2 rounded-full bg-[#14110f] px-4 text-sm font-black text-white shadow-[0_10px_22px_rgba(20,17,15,0.18)] transition hover:-translate-y-0.5 hover:bg-black disabled:opacity-60 sm:w-auto"
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
          className="mt-1.5 inline-flex h-11 w-full flex-1 items-center justify-center gap-2 rounded-full border border-[#f0d8c4] bg-[#fff8f2] px-4 text-sm font-black text-[#14110f] transition hover:-translate-y-0.5 hover:border-[#fa7d22]/45 hover:bg-white sm:mt-0 sm:w-auto"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="mt-1.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#f0d8c4] bg-white px-4 text-sm font-black text-[#14110f] transition hover:-translate-y-0.5 hover:border-[#fa7d22]/45 hover:bg-[#fff8f2] sm:mt-0 sm:w-auto"
        >
          <Clipboard className="h-4 w-4" />
          {copied ? 'Copied' : 'Link'}
        </button>
      </div>
      </div>
    </>
  );
};

export default WrappedStoryPlayer;
