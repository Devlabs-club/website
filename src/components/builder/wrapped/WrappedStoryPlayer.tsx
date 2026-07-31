import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toBlob, toPng } from 'html-to-image';
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Share2 } from 'lucide-react';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { buildShareUrl } from '@/lib/agentWrapped/buildprintAttribution';
import { resolveDisplayTimeInvested } from '@/lib/agentWrapped/displayTimeInvested';
import { trackBuildprintEvent } from '@/lib/analytics/buildprintFunnel';
import { CARD_ORDER, OWNER_CARD_ORDER, type WrappedCardKey } from './theme';
import CoverCard from './cards/CoverCard';
import TimeInvestedCard from './cards/TimeInvestedCard';
import TokensCard from './cards/TokensCard';
import ModelsCard from './cards/ModelsCard';
import RhythmCard from './cards/RhythmCard';
import MultiAgentCard from './cards/MultiAgentCard';
import BuildprintConversionCard from './cards/BuildprintConversionCard';
import {
  formatPeakHour,
  formatTokenCount,
  getReportUsage,
  getWrappedShareHeadline,
  getWrappedShareLine,
  hasModelsFact,
  hasRhythmFact,
  hasTokensFact,
} from '@/lib/agentWrapped/usageDisplay';

const DURATION_MS = 6500;
const HOLD_THRESHOLD_MS = 250;
const EXPORT_PIXEL_RATIO = 2.8;

/** Avoid html-to-image reading cross-origin Google Fonts cssRules (SecurityError). */
let cachedGatwickFontEmbedCSS: Promise<string> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function getGatwickFontEmbedCSS() {
  if (!cachedGatwickFontEmbedCSS) {
    cachedGatwickFontEmbedCSS = (async () => {
      const faces = [
        { weight: '100 350', path: '/fonts/PPGatwick-Ultralight.otf' },
        { weight: '351 900', path: '/fonts/PPGatwick-Bold.otf' },
      ] as const;
      try {
        const rules = await Promise.all(
          faces.map(async ({ weight, path }) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`font fetch failed: ${path}`);
            const b64 = arrayBufferToBase64(await res.arrayBuffer());
            return `@font-face{font-family:'PP Gatwick';font-weight:${weight};font-style:normal;src:url(data:font/opentype;base64,${b64}) format('opentype');}`;
          })
        );
        return rules.join('\n');
      } catch {
        // Still skip remote fonts so export doesn't hit Google Fonts SecurityError.
        return '';
      }
    })();
  }
  return cachedGatwickFontEmbedCSS;
}

async function getCardExportOptions() {
  const fontEmbedCSS = await getGatwickFontEmbedCSS();
  return {
    pixelRatio: EXPORT_PIXEL_RATIO,
    cacheBust: true,
    // Non-null fontEmbedCSS skips document.styleSheets walks (avoids Google Fonts SecurityError).
    fontEmbedCSS: fontEmbedCSS || ' ',
  };
}
const CARD_GLOWS = [
  'radial-gradient(ellipse at center, rgba(124,58,237,0.42) 0%, rgba(147,51,234,0.3) 30%, rgba(88,28,135,0.16) 50%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(239,68,68,0.42) 0%, rgba(220,38,38,0.29) 30%, rgba(127,29,29,0.16) 52%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(16,185,129,0.4) 0%, rgba(5,150,105,0.27) 30%, rgba(6,78,59,0.15) 52%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(249,115,22,0.42) 0%, rgba(234,88,12,0.28) 30%, rgba(124,45,18,0.15) 52%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(37,99,235,0.4) 0%, rgba(29,78,216,0.27) 30%, rgba(30,58,138,0.15) 52%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(168,85,247,0.42) 0%, rgba(126,34,206,0.28) 30%, rgba(88,28,135,0.15) 52%, transparent 72%)',
  'radial-gradient(ellipse at center, rgba(250,125,34,0.35) 0%, rgba(250,125,34,0.2) 35%, transparent 70%)',
];

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function LinkedInLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export type StoryViewerRole = 'signed_out' | 'builder' | 'founder' | 'owner';

type Props = {
  report: AgentWrappedReport;
  viewer?: StoryViewerRole;
  onCta?: (placement: 'post_identity' | 'final' | 'share', action: 'primary' | 'secondary') => void;
  captionDraft?: string;
};

export const WrappedStoryPlayer: React.FC<Props> = ({
  report,
  viewer = 'signed_out',
  onCta,
  captionDraft,
}) => {
  const order = useMemo<WrappedCardKey[]>(() => {
    const base = viewer === 'owner' ? OWNER_CARD_ORDER : CARD_ORDER;
    const usage = getReportUsage(report);
    return base.filter((key) => {
      if (key === 'tokens') return hasTokensFact(usage);
      if (key === 'models') return hasModelsFact(usage);
      if (key === 'rhythm') return hasRhythmFact(usage);
      return true;
    });
  }, [report, viewer]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done'>('idle');
  const pointerDownAt = useRef(0);
  const holdingRef = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const total = order.length;
  const reduceMotion = useReducedMotion();

  const goTo = useCallback(
    (next: number) => {
      setActiveIndex(Math.max(0, Math.min(total - 1, next)));
    },
    [total]
  );

  useEffect(() => {
    if (activeIndex === total - 1) {
      trackBuildprintEvent('buildprint_story_completed', {
        builderId: report.builderId,
        methodologyVersion: report.buildprint?.methodologyVersion,
      });
      if (order[activeIndex] === 'convert') {
        trackBuildprintEvent('buildprint_cta_viewed', {
          builderId: report.builderId,
          ctaPlacement: 'final',
        });
      }
    }
  }, [activeIndex, order, report.builderId, report.buildprint?.methodologyVersion, total]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') goTo(activeIndex + 1);
      if (event.key === 'ArrowLeft') goTo(activeIndex - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, goTo]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Ignore non-primary mouse buttons; allow touch + pen + primary click.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerDownAt.current = Date.now();
    holdingRef.current = true;
    setPaused(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers reject capture mid-gesture; hold still works via state.
    }
  };

  const endHold = (event?: React.PointerEvent<HTMLDivElement>) => {
    holdingRef.current = false;
    setPaused(false);
    if (event) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // no-op
      }
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const heldMs = Date.now() - pointerDownAt.current;
    endHold(event);
    // Press-and-hold: stay on this slide (already paused during hold).
    if (heldMs >= HOLD_THRESHOLD_MS) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / Math.max(1, rect.width);
    if (relativeX < 0.32) goTo(activeIndex - 1);
    else goTo(activeIndex + 1);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    endHold(event);
  };

  const activeCard = order[activeIndex];

  const basePublicUrl = useMemo(() => {
    if (typeof window === 'undefined') return report.share.publicUrl;
    return report.share.publicUrl.startsWith('http')
      ? report.share.publicUrl
      : `${window.location.origin}${report.share.publicUrl}`;
  }, [report.share.publicUrl]);

  const shareUrl = useMemo(
    () =>
      buildShareUrl(basePublicUrl, {
        card: activeCard,
        channel: 'link',
      }),
    [activeCard, basePublicUrl]
  );

  const usage = useMemo(() => getReportUsage(report), [report]);

  const shareText = useMemo(() => {
    if (captionDraft) return captionDraft;
    if (activeCard === 'time') {
      const time = resolveDisplayTimeInvested(report);
      const hours =
        time.method === 'active_gap' && time.last30Hours && time.last30Hours > 0
          ? time.last30Hours
          : time.totalHours;
      if (time.insufficient || hours <= 0) {
        return `${getWrappedShareHeadline(report)} — my DevLabs AI Wrapped.`;
      }
      return `I built for ${Math.round(hours).toLocaleString('en-US')} hours with agents — my DevLabs AI Wrapped.`;
    }
    if (activeCard === 'tokens' && usage?.tokens?.total) {
      return `I burned ${formatTokenCount(usage.tokens.total)} tokens with agents — my DevLabs AI Wrapped.`;
    }
    if (activeCard === 'models' && usage?.models?.[0]) {
      const top = usage.models[0];
      return `My top model was ${top.id} (${top.percent}%) — my DevLabs AI Wrapped.`;
    }
    if (activeCard === 'rhythm' && usage?.rhythm) {
      return `I code hardest at ${formatPeakHour(usage.rhythm.peakHour).replace(':00 ', '')} — my DevLabs AI Wrapped.`;
    }
    return `${getWrappedShareHeadline(report)}. ${getWrappedShareLine(report)} — my DevLabs AI Wrapped.`;
  }, [activeCard, captionDraft, report, usage]);

  const channelShareUrl = useCallback(
    (channel: 'x' | 'linkedin') =>
      buildShareUrl(basePublicUrl, {
        card: activeCard,
        channel,
      }),
    [activeCard, basePublicUrl]
  );

  const exportCardBlob = async () => {
    if (!frameRef.current) return null;
    try {
      return await toBlob(frameRef.current, await getCardExportOptions());
    } catch {
      return null;
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const copyLink = async () => {
    trackBuildprintEvent('buildprint_share_started', {
      builderId: report.builderId,
      channel: 'link',
      card: 'identity',
    });
    await navigator.clipboard.writeText(shareUrl);
    trackBuildprintEvent('buildprint_share_completed', {
      builderId: report.builderId,
      channel: 'link',
      card: 'identity',
    });
  };

  const downloadCard = async () => {
    if (!frameRef.current) return;
    setExportState('working');
    trackBuildprintEvent('buildprint_share_started', {
      builderId: report.builderId,
      channel: 'download',
      card: order[activeIndex],
    });
    try {
      const dataUrl = await toPng(frameRef.current, await getCardExportOptions());
      const link = document.createElement('a');
      link.download = `devlabs-ai-wrapped-${order[activeIndex]}.png`;
      link.href = dataUrl;
      link.click();
      setExportState('done');
      trackBuildprintEvent('buildprint_share_completed', {
        builderId: report.builderId,
        channel: 'download',
        card: order[activeIndex],
      });
      window.setTimeout(() => setExportState('idle'), 1600);
    } catch {
      setExportState('idle');
    }
  };

  const shareCard = async () => {
    if (!frameRef.current) return;
    setExportState('working');
    trackBuildprintEvent('buildprint_share_started', {
      builderId: report.builderId,
      channel: 'native',
      card: order[activeIndex],
    });
    try {
      const blob = await exportCardBlob();
      const file = blob ? new File([blob], 'devlabs-ai-wrapped.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My DevLabs AI Wrapped',
          text: shareText,
        });
      } else if (navigator.share) {
        await navigator.share({ title: 'My DevLabs AI Wrapped', text: shareText, url: shareUrl });
      } else {
        await copyLink();
      }
      trackBuildprintEvent('buildprint_share_completed', {
        builderId: report.builderId,
        channel: 'native',
        card: order[activeIndex],
      });
      setExportState('idle');
      onCta?.('share', 'primary');
    } catch {
      setExportState('idle');
    }
  };

  const openExternalShare = (href: string) => {
    // Must run synchronously in the click handler — await before this gets popup-blocked.
    const opened = window.open(href, '_blank', 'noopener,noreferrer');
    if (opened) return;
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const shareToX = async () => {
    setExportState('working');
    const url = channelShareUrl('x');
    const caption = `${shareText}\n\n${url}`;
    // Always open X intent — do not gate on Web Share (macOS canShare(files) is true but isn't X).
    const intentHref = `https://x.com/intent/tweet?text=${encodeURIComponent(`${shareText}\n${url}`)}`;
    openExternalShare(intentHref);
    trackBuildprintEvent('buildprint_share_started', {
      builderId: report.builderId,
      channel: 'x',
      card: order[activeIndex],
    });

    try {
      try {
        await navigator.clipboard.writeText(caption);
      } catch {
        // ignore clipboard failures
      }
      const blob = await exportCardBlob();
      if (blob) downloadBlob(blob, 'devlabs-ai-wrapped.png');
      trackBuildprintEvent('buildprint_share_completed', {
        builderId: report.builderId,
        channel: 'x',
        card: order[activeIndex],
      });
    } catch {
      // intent already opened
    } finally {
      setExportState('idle');
    }
  };

  const shareToLinkedIn = async () => {
    setExportState('working');
    const url = channelShareUrl('linkedin');
    const caption = `${shareText}\n\n${url}`;
    // LinkedIn web share only accepts a URL; caption is copied for paste.
    const intentHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    openExternalShare(intentHref);
    trackBuildprintEvent('buildprint_share_started', {
      builderId: report.builderId,
      channel: 'linkedin',
      card: order[activeIndex],
    });

    try {
      try {
        await navigator.clipboard.writeText(caption);
      } catch {
        // ignore
      }
      const blob = await exportCardBlob();
      if (blob) downloadBlob(blob, 'devlabs-ai-wrapped.png');
      trackBuildprintEvent('buildprint_share_completed', {
        builderId: report.builderId,
        channel: 'linkedin',
        card: order[activeIndex],
      });
    } catch {
      // intent already opened
    } finally {
      setExportState('idle');
    }
  };

  const renderCard = () => {
    const props = { report, index: activeIndex + 1, total } as const;
    switch (order[activeIndex]) {
      case 'cover':
        return <CoverCard report={report} total={total} />;
      case 'time':
        return <TimeInvestedCard {...props} />;
      case 'tokens':
        return <TokensCard {...props} />;
      case 'models':
        return <ModelsCard {...props} />;
      case 'rhythm':
        return <RhythmCard {...props} />;
      case 'agents':
        return <MultiAgentCard {...props} />;
      case 'convert':
        return (
          <BuildprintConversionCard
            index={activeIndex + 1}
            total={total}
            builderName={report.builderName}
            viewer={viewer}
            onPrimary={() => {
              trackBuildprintEvent('buildprint_cta_clicked', {
                builderId: report.builderId,
                ctaPlacement: 'final',
              });
              onCta?.('final', viewer === 'founder' ? 'secondary' : 'primary');
            }}
            onSecondary={() => {
              trackBuildprintEvent('buildprint_cta_clicked', {
                builderId: report.builderId,
                ctaPlacement: 'final_secondary',
              });
              onCta?.('final', viewer === 'founder' ? 'primary' : 'secondary');
            }}
          />
        );
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
          style={{ background: CARD_GLOWS[activeIndex % CARD_GLOWS.length] }}
        />
      </AnimatePresence>
      <div className="relative z-10 mx-auto w-full max-w-[min(577px,calc(100vw-22px))]">
        <div className="mb-5 flex gap-1.5 px-1 sm:mb-6">
          {order.map((key, i) => (
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
          className="relative select-none touch-none [-webkit-touch-callout:none]"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(event) => event.preventDefault()}
          style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
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

        <div className="mt-6 flex items-center gap-2 px-0.5 sm:mt-7">
          <button
            type="button"
            onClick={downloadCard}
            disabled={exportState === 'working'}
            className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[#14110f] px-4 text-sm font-black text-white shadow-[0_10px_22px_rgba(20,17,15,0.14)] transition hover:-translate-y-0.5 hover:bg-black disabled:opacity-60"
          >
            {exportState === 'working' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : exportState === 'done' ? (
              <Check className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exportState === 'done' ? 'Saved' : 'Download'}
          </button>
          <button
            type="button"
            onClick={shareToLinkedIn}
            disabled={exportState === 'working'}
            aria-label="Share on LinkedIn"
            title="Share on LinkedIn"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A66C2] text-white transition hover:-translate-y-0.5 hover:bg-[#0857a4] disabled:opacity-60"
          >
            <LinkedInLogo className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={shareToX}
            disabled={exportState === 'working'}
            aria-label="Share on X"
            title="Share on X"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#14110f] text-white transition hover:-translate-y-0.5 hover:bg-black disabled:opacity-60"
          >
            <XLogo className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={shareCard}
            aria-label="Share"
            title="Share"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ead7c8] bg-white text-[#14110f] transition hover:-translate-y-0.5 hover:border-[#fa7d22]/45 hover:bg-[#fff8f2]"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
};

export default WrappedStoryPlayer;
