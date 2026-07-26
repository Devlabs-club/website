import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Loader2, ShieldCheck } from 'lucide-react';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import {
  getPublicIdentity,
  isLegacyWrappedReport,
} from '@/lib/agentWrapped/legacyWrappedAdapter';
import {
  getWrappedShareHeadline,
  getWrappedShareLine,
  hasUsageFacts,
} from '@/lib/agentWrapped/usageDisplay';
import {
  getBuildprintCtaHref,
  getBuildprintSignupHref,
  loadBuildprintAttr,
  persistBuildprintAttr,
  readBuildprintAttrFromSearch,
} from '@/lib/agentWrapped/buildprintAttribution';
import { trackBuildprintEvent } from '@/lib/analytics/buildprintFunnel';
import { AuthProvider, useAuth } from '@/components/auth_manager';
import { WrappedStoryPlayer, type StoryViewerRole } from './wrapped/WrappedStoryPlayer';
import BuildprintDiscoverabilityPrompt from './buildprint/BuildprintDiscoverabilityPrompt';

type WrappedResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  report?: AgentWrappedReport;
  source?: AgentWrappedReport['source'];
};

const AgentWrappedPageInner: React.FC<{ builderId: string }> = ({ builderId }) => {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [report, setReport] = useState<AgentWrappedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ownBuilderId, setOwnBuilderId] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [showDiscoverability, setShowDiscoverability] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromUrl = readBuildprintAttrFromSearch(window.location.search);
    persistBuildprintAttr({
      ...loadBuildprintAttr(),
      ...fromUrl,
      sourceBuilderId: fromUrl.sourceBuilderId || builderId,
    });
  }, [builderId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/builder/wrapped/${encodeURIComponent(builderId)}`);
        const data: WrappedResponse = await res.json();
        if (!res.ok || !data.ok || !data.report) {
          throw new Error(
            data.message ||
              data.error ||
              'AI Wrapped is only available after you run the local command and approve the upload.'
          );
        }
        setReport(data.report);
        const identity = getPublicIdentity(data.report);
        setSelectedIdentityId(
          data.report.buildprint?.selectedPublicIdentityId ||
            data.report.buildprint?.primaryIdentityId ||
            identity?.id ||
            null
        );
        setCaption(
          `${getWrappedShareHeadline(data.report)}. ${getWrappedShareLine(data.report)}\n${typeof window !== 'undefined' ? window.location.href.split('?')[0] : data.report.share.publicUrl}`
        );
        trackBuildprintEvent('buildprint_public_viewed', {
          builderId,
          sourceBuilderId: builderId,
          referringBuildprintId: data.report.reportId,
          methodologyVersion: data.report.buildprint?.methodologyVersion,
        });
        if (data.report.buildprint) {
          trackBuildprintEvent('buildprint_generated', {
            builderId,
            methodologyVersion: data.report.buildprint.methodologyVersion,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load AI Wrapped.');
      } finally {
        setLoading(false);
      }
    })();
  }, [builderId]);

  useEffect(() => {
    if (!isAuthenticated || user?.accountType !== 'builder') {
      setOwnBuilderId(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/builder/profile', { credentials: 'include' });
        const data = await res.json();
        const id = data?.profile?._id || data?.profile?.id || data?.builderId;
        if (id) setOwnBuilderId(String(id));
      } catch {
        setOwnBuilderId(null);
      }
    })();
  }, [isAuthenticated, user?.accountType]);

  const viewer: StoryViewerRole = useMemo(() => {
    if (ownBuilderId && ownBuilderId === builderId) return 'owner';
    if (user?.accountType === 'founder') return 'founder';
    if (user?.accountType === 'builder') return 'builder';
    return 'signed_out';
  }, [ownBuilderId, builderId, user?.accountType]);

  const goGetBuildprint = (placement: string) => {
    trackBuildprintEvent('buildprint_cta_clicked', {
      builderId,
      ctaPlacement: placement,
      sourceBuilderId: builderId,
    });
    persistBuildprintAttr({
      ...loadBuildprintAttr(),
      sourceBuilderId: builderId,
      referringBuildprintId: report?.reportId,
      ctaPlacement: placement,
      campaign: 'buildprint',
      methodologyVersion: report?.buildprint?.methodologyVersion,
      ts: Date.now(),
    });
    window.location.href = getBuildprintCtaHref(viewer === 'owner' ? 'builder' : viewer);
  };

  const goFounder = () => {
    window.location.href = '/founder/home';
  };

  const saveIdentity = async (identityId: string) => {
    setSavingIdentity(true);
    try {
      const res = await fetch('/api/builder/wrapped/public-identity', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not update identity');
      setSelectedIdentityId(identityId);
      setReport((prev) => {
        if (!prev?.buildprint) return prev;
        const identity = prev.buildprint.earnedIdentities.find((item) => item.id === identityId);
        return {
          ...prev,
          archetype: identity?.label || prev.archetype,
          buildprint: {
            ...prev.buildprint,
            selectedPublicIdentityId: identityId,
            publicCardLine: identity?.cardLine || prev.buildprint.publicCardLine,
          },
        };
      });
    } catch {
      // keep previous selection
    } finally {
      setSavingIdentity(false);
    }
  };

  if (loading || authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] text-[#14110f]">
        <Loader2 className="h-6 w-6 animate-spin text-[#fa7d22]" />
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-4 text-[#14110f]">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white p-6 text-center shadow-[0_18px_50px_rgba(33,24,16,0.08)]">
          <AlertCircle className="mx-auto h-8 w-8 text-[#fa7d22]" />
          <h1 className="mt-4 text-xl font-bold">No AI Wrapped yet</h1>
          <p className="mt-2 text-sm text-black/55">
            {error ||
              'This builder has not uploaded local agent traces. AI Wrapped cards only appear after the terminal command is run and approved.'}
          </p>
          <a
            href={getBuildprintSignupHref()}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[#fa7d22] px-4 text-xs font-extrabold uppercase tracking-[0.08em] text-white"
          >
            Get my AI Wrapped
          </a>
        </div>
      </main>
    );
  }

  const earned = report.buildprint?.earnedIdentities || [];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fbfaf7] px-3 py-6 text-[#14110f] sm:px-6 sm:py-8 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-noise opacity-[0.06]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col items-center">
        <div className="mb-7 flex w-full max-w-5xl items-center justify-between gap-4 sm:mb-9">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-black text-[#14110f]">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
            DevLabs
          </a>
          <div className="flex items-center gap-3">
            <div className="hidden text-xs font-black uppercase tracking-[0.2em] text-black/40 sm:block">
              AI Wrapped
            </div>
            {viewer !== 'owner' ? (
              <button
                type="button"
                onClick={() => {
                  trackBuildprintEvent('buildprint_cta_viewed', {
                    builderId,
                    ctaPlacement: 'header',
                  });
                  goGetBuildprint('header');
                }}
                className="inline-flex h-9 items-center justify-center rounded-full bg-[#fa7d22] px-3 text-xs font-extrabold text-white"
              >
                Get your AI Wrapped
              </button>
            ) : null}
          </div>
        </div>

        {isLegacyWrappedReport(report) ? (
          <div className="mb-5 w-full max-w-5xl rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Generated with earlier methodology — re-run analysis for AI Wrapped.
          </div>
        ) : null}

        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-white px-4 py-2 text-xs font-bold text-emerald-700 shadow-[0_10px_24px_rgba(33,24,16,0.06)] sm:mb-8">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified by approved local agent analysis
        </div>

        <WrappedStoryPlayer
          report={report}
          viewer={viewer}
          captionDraft={caption}
          onCta={(placement, action) => {
            if (placement === 'share') {
              if (viewer === 'owner') setShowDiscoverability(true);
              return;
            }
            // Conversion card: founders get "Find builders" as primary button (action secondary mapping in player).
            if (viewer === 'founder') {
              if (placement === 'final' && action === 'secondary') {
                goFounder();
                return;
              }
              if (placement === 'final' && action === 'primary') {
                goGetBuildprint('final');
                return;
              }
            }
            if (action === 'secondary') {
              goFounder();
              return;
            }
            goGetBuildprint(placement);
          }}
        />

        {viewer === 'owner' && hasUsageFacts(report) ? (
          <div className="mt-6 w-full max-w-[min(577px,calc(100vw-22px))] rounded-2xl border border-black/10 bg-white p-4">
            <label className="block text-xs font-bold text-black/45">Share caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-xl border border-black/10 bg-[#fbf6f3] px-3 py-2 text-sm"
            />
          </div>
        ) : null}

        {viewer === 'owner' && !hasUsageFacts(report) && earned.length > 0 ? (
          <div className="mt-6 w-full max-w-[min(577px,calc(100vw-22px))] rounded-2xl border border-black/10 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-black/40">Public identity</p>
            <div className="mt-3 space-y-2">
              {earned.map((identity) => (
                <label
                  key={identity.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/8 px-3 py-2.5 hover:border-[#fa7d22]/40"
                >
                  <input
                    type="radio"
                    name="public-identity"
                    checked={selectedIdentityId === identity.id}
                    disabled={savingIdentity}
                    onChange={() => saveIdentity(identity.id)}
                  />
                  <span>
                    <span className="block text-sm font-bold">{identity.label}</span>
                    <span className="mt-0.5 block text-xs text-black/50">{identity.cardLine}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-4 block text-xs font-bold text-black/45">Share caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-xl border border-black/10 bg-[#fbf6f3] px-3 py-2 text-sm"
            />
            {report.buildprint?.nextUnlock ? (
              <div className="mt-4 rounded-xl border border-black/8 bg-[#fbf6f3] p-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-black/40">Next unlock</p>
                <p className="mt-1 text-sm font-bold">{report.buildprint.nextUnlock.label}</p>
                <p className="mt-1 text-xs text-black/55">{report.buildprint.nextUnlock.explanation}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-10 w-full max-w-[min(577px,calc(100vw-22px))] pb-10">
          <button
            type="button"
            onClick={() => setFaqOpen((v) => !v)}
            className="flex w-full items-center justify-between px-1 py-2 text-left text-sm font-semibold text-black/45 transition hover:text-black/70"
          >
            What is AI Wrapped?
            <ChevronDown className={`h-4 w-4 transition ${faqOpen ? 'rotate-180' : ''}`} />
          </button>
          {faqOpen ? (
            <p className="mt-1 px-1 pb-2 text-sm leading-relaxed text-black/55">
              DevLabs analyzes real agent-assisted building sessions to show how someone plans, ships,
              verifies, and fixes their work. It is built from proof—not a résumé or self-assessment.
            </p>
          ) : null}
        </div>
      </div>

      <BuildprintDiscoverabilityPrompt
        open={showDiscoverability && viewer === 'owner'}
        onDone={() => setShowDiscoverability(false)}
      />
    </main>
  );
};

export const AgentWrappedPage: React.FC<{ builderId: string }> = ({ builderId }) => (
  <AuthProvider>
    <AgentWrappedPageInner builderId={builderId} />
  </AuthProvider>
);

export default AgentWrappedPage;
