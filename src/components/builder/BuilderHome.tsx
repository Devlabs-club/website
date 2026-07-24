import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import BuilderProfileEnrichmentOverlay from './BuilderProfileEnrichmentOverlay';
import type { EnrichmentVisualStage } from './BuilderEnrichmentAsciiVisual';
import { BuilderProfilePreview, type BuilderProfileView } from './BuilderProfilePreview';
import BuilderImessageHandoff from './BuilderImessageHandoff';
import BuilderProfileIntakeForm from './BuilderProfileIntakeForm';
import BuilderProfileEditor from './BuilderProfileEditor';
import AgentTraceSetup from './AgentTraceSetup';
import BuilderShell, { builderNavIcons, type BuilderSection } from './BuilderShell';
import type { MessageDelivery } from './AgentTraceSetup';

type ProfileResponse = {
  success: boolean;
  error?: string;
  basics?: { name?: string; email?: string | null; avatarUrl?: string | null };
  phone?: string | null;
  phoneVerified?: boolean;
  imessageEnabled?: boolean;
  imessagePhoneVerified?: boolean;
  phoneVerificationPending?: boolean;
  agentWrapped?: {
    builderId: string;
    uploadToken: string;
    command: string;
    publicUrl?: string | null;
    uploaded?: boolean;
    reportId?: string | null;
    archetype?: string | null;
    score?: number | null;
    agents?: string[];
    messageDelivery?: MessageDelivery | null;
  } | null;
  profile?: BuilderProfileView | null;
};

async function logout() {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    window.location.href = data.logoutUrl && data.logoutUrl !== '/login' ? data.logoutUrl : '/login';
  } catch {
    window.location.href = '/login';
  }
}

function defaultSection(verified: boolean, traceUploaded: boolean, hasProfile: boolean, imessageEnabled: boolean): BuilderSection {
  if (!imessageEnabled && !hasProfile) return 'overview';
  if (!verified) return 'messages';
  if (!traceUploaded) return 'wrapped';
  if (hasProfile) return 'overview';
  return 'overview';
}

type SetupStep = {
  key: 'verify' | 'wrapped' | 'profile';
  label: string;
  done: boolean;
};

type NextAction = {
  section: BuilderSection;
  stepLabel: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ReactNode;
};

function getSetupSteps(verified: boolean, traceUploaded: boolean, profileVisible: boolean, imessageEnabled: boolean): SetupStep[] {
  return [
    { key: 'verify', label: imessageEnabled ? 'Verify' : 'Required links', done: imessageEnabled ? verified : profileVisible },
    { key: 'wrapped', label: 'Agent Wrapped', done: traceUploaded },
    { key: 'profile', label: imessageEnabled ? 'Profile' : 'Review', done: profileVisible },
  ];
}

function getNextAction(
  verified: boolean,
  traceUploaded: boolean,
  profileVisible: boolean,
  hasProfile: boolean,
  imessageEnabled: boolean,
): NextAction | null {
  if (imessageEnabled && !verified) {
    return {
      section: 'messages',
      stepLabel: 'Step 1 of 3',
      title: 'Verify your phone',
      description: 'Open iMessage and send the pre-filled text. No codes — takes about 30 seconds.',
      cta: 'Verify in Messages',
      icon: <ShieldCheck className="h-5 w-5" />,
    };
  }
  if (!hasProfile) {
    return {
      section: 'messages',
      stepLabel: 'Step 1 of 3',
      title: 'Complete your builder profile',
      description: 'Add LinkedIn, GitHub, Devpost, portfolio, and resume before the rest of the dashboard unlocks.',
      cta: 'Add required fields',
      icon: <ShieldCheck className="h-5 w-5" />,
    };
  }
  if (!traceUploaded) {
    return {
      section: 'wrapped',
      stepLabel: 'Step 2 of 3',
      title: 'Set up Agent Wrapped',
      description: 'Run one terminal command locally. It uploads proof of how you ship with AI — founders see the summary, not your raw prompts.',
      cta: 'Continue setup',
      icon: <TerminalSquare className="h-5 w-5" />,
    };
  }
  if (!profileVisible) {
    return {
      section: hasProfile ? 'profile' : 'messages',
      stepLabel: 'Step 3 of 3',
      title: hasProfile ? 'Finish your profile' : 'Build your profile',
      description: hasProfile
        ? imessageEnabled
          ? 'Your profile is taking shape. Review it and keep chatting with the DevLabs agent in Messages.'
          : 'Your profile is taking shape. Review the enriched fields and edit any job descriptions that need cleanup.'
        : 'Complete the profile form so your proof-of-work profile can be enriched.',
      cta: hasProfile ? 'View profile' : 'Open form',
      icon: <ShieldCheck className="h-5 w-5" />,
    };
  }
  return null;
}

function SetupProgress({ steps }: { steps: SetupStep[] }) {
  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <ol className="flex items-start gap-0">
      {steps.map((step, index) => {
        const isNext = nextIndex === index;
        const isDone = step.done;
        return (
          <li key={step.key} className="flex min-w-0 flex-1 items-start">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span
                className={
                  isDone
                    ? 'flex h-9 w-9 shrink-0 items-center justify-center border-2 border-[#ff7417] bg-[#fff5ef] text-[#ff7417]'
                    : isNext
                      ? 'flex h-9 w-9 shrink-0 items-center justify-center border-2 border-[#ff7417] bg-[#ff7417] text-white shadow-[0_0_0_4px_rgb(255_116_23_/_0.15)]'
                      : 'flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black/12 bg-white text-black/30'
                }
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-extrabold">{index + 1}</span>}
              </span>
              <span
                className={
                  isNext
                    ? 'text-center text-xs font-extrabold text-[#050505]'
                    : isDone
                      ? 'text-center text-xs font-semibold text-black/45'
                      : 'text-center text-xs font-semibold text-black/30'
                }
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <div className={`mt-[1.125rem] h-0.5 min-w-[1.5rem] flex-1 ${steps[index + 1]?.done || isDone ? 'bg-[#ff7417]/35' : 'bg-black/10'}`} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function BuilderOverview({
  verified,
  traceUploaded,
  profileVisible,
  hasProfile,
  profile,
  wrappedPublicUrl,
  imessageEnabled,
  onNavigate,
}: {
  verified: boolean;
  traceUploaded: boolean;
  profileVisible: boolean;
  hasProfile: boolean;
  profile: BuilderProfileView | null;
  wrappedPublicUrl?: string;
  imessageEnabled: boolean;
  onNavigate: (section: BuilderSection) => void;
}) {
  const steps = getSetupSteps(verified, traceUploaded, profileVisible, imessageEnabled);
  const next = getNextAction(verified, traceUploaded, profileVisible, hasProfile, imessageEnabled);
  const allDone = !next;
  const completedCount = steps.filter((s) => s.done).length;
  const requiredFields = [
    'LinkedIn profile',
    'GitHub profile',
    'Devpost profile',
    'Portfolio website',
    'Resume PDF',
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={
          allDone
        ? 'All setup steps are complete. Founders can see your profile and Agent Wrapped summary.'
        : 'Track your builder setup and finish the remaining steps so founders can discover and reach you.'
        }
        actions={
          allDone ? (
            <span className="inline-flex items-center gap-1.5 border border-[#ff7417]/30 bg-[#fff5ef] px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-[#bf4f08]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              All complete
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 border border-[#ff7417]/30 bg-[#fff5ef] px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-[#bf4f08]">
              {completedCount} of {steps.length} complete
            </span>
          )
        }
      />

      <div className="font-manrope mx-auto w-full max-w-2xl px-5 py-8 sm:px-7 sm:py-10">
      <div>
        <SetupProgress steps={steps} />
      </div>

      {next ? (
        <div className="mt-10 border border-[#ff7417]/25 bg-[#fffaf7] p-6 sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#bf4f08]">{next.stepLabel}</p>
          <div className="mt-4 flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#ff7417] text-white">{next.icon}</span>
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold tracking-[-0.02em] text-[#050505]">{next.title}</h2>
              <p className="mt-2 text-sm leading-6 text-black/55">{next.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(next.section)}
            className="builder-outline-button mt-6 inline-flex h-12 w-full items-center justify-center gap-2 text-sm font-semibold sm:w-auto sm:min-w-[14rem] sm:px-8"
          >
            {next.cta}
            <ArrowUpRight className="h-4 w-4" />
          </button>
          {!hasProfile ? (
            <div className="mt-6 border-t border-[#ff7417]/20 pt-5">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#bf4f08]">Required to continue</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {requiredFields.map((field) => (
                  <div key={field} className="flex items-center gap-2 border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black/60">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fff5ef] text-[0.62rem] font-extrabold text-[#bf4f08]">!</span>
                    {field}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="builder-primary-button inline-flex h-11 flex-1 items-center justify-center text-sm font-semibold"
          >
            View profile
          </button>
          {wrappedPublicUrl && traceUploaded ? (
            <a
              href={wrappedPublicUrl}
              target="_blank"
              rel="noreferrer"
              className="builder-outline-button inline-flex h-11 flex-1 items-center justify-center gap-1.5 text-sm font-semibold"
            >
              View Agent Wrapped
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      )}

      <ul className="mt-8 divide-y divide-black/10 border-t border-black/10">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center justify-between gap-4 py-3.5 text-sm">
            <span className={step.done ? 'font-semibold text-black/45' : 'font-extrabold text-[#050505]'}>{step.label}</span>
            <span
              className={
                step.done
                  ? 'inline-flex items-center gap-1.5 text-xs font-semibold text-[#bf4f08]'
                  : 'text-xs font-semibold text-black/35'
              }
            >
              {step.done ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Done
                </>
              ) : (
                'Pending'
              )}
            </span>
          </li>
        ))}
      </ul>
      </div>
    </>
  );
}

function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="font-manrope flex flex-col gap-4 border-b border-black/10 px-5 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-7 sm:py-7">
      <div>
        <h1 className="text-[clamp(1.6rem,3vw,2rem)] font-extrabold tracking-[-0.02em] text-[#050505]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">{subtitle}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export const BuilderHome: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [verified, setVerified] = useState(false);
  const [traceUploaded, setTraceUploaded] = useState(false);
  const [activeSection, setActiveSection] = useState<BuilderSection>('overview');
  const [profileEnriching, setProfileEnriching] = useState(false);
  const [enrichmentStage, setEnrichmentStage] = useState<EnrichmentVisualStage>('linkedin');
  const [enrichmentLabel, setEnrichmentLabel] = useState<string | null>(null);
  const [enrichmentDetail, setEnrichmentDetail] = useState<string | null>(null);
  const sectionInitializedRef = useRef(false);
  const inviteLinkAttemptedRef = useRef(false);

  useEffect(() => {
    if (!profileEnriching) {
      setEnrichmentStage('linkedin');
      setEnrichmentLabel(null);
      setEnrichmentDetail(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/builder/profile/enrichment-progress', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (json.stage && ['linkedin', 'github', 'research'].includes(json.stage)) {
          setEnrichmentStage(json.stage as EnrichmentVisualStage);
          setEnrichmentLabel(typeof json.label === 'string' ? json.label : null);
          setEnrichmentDetail(typeof json.detail === 'string' ? json.detail : null);
        }
      } catch {
        // Keep showing the last known stage while enrichment runs.
      }
    };

    poll();
    const intervalId = window.setInterval(poll, 500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [profileEnriching]);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/builder/profile', { credentials: 'include' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const json: ProfileResponse = await res.json();
      setData(json);
      const isVerified = Boolean(json.phoneVerified);
      const imessageEnabled = json.imessageEnabled !== false;
      setVerified(isVerified);
      let uploaded = false;
      if (isVerified && json.agentWrapped?.builderId) {
        uploaded = Boolean(json.agentWrapped.uploaded);
        if (!uploaded && json.agentWrapped.uploadToken) {
          const params = new URLSearchParams({
            builderId: json.agentWrapped.builderId,
            token: json.agentWrapped.uploadToken,
          });
          const statusRes = await fetch(`/api/builder/wrapped/status?${params.toString()}`, { credentials: 'include' });
          const status = await statusRes.json().catch(() => ({}));
          uploaded = Boolean(status.ok && status.uploaded);
        }
        setTraceUploaded(uploaded);
      } else {
        setTraceUploaded(false);
      }

      if (!sectionInitializedRef.current) {
        sectionInitializedRef.current = true;
        setActiveSection(defaultSection(isVerified, uploaded, Boolean(json.profile), imessageEnabled));
      }
    } catch {
      setData({ success: false, error: 'Could not load your profile.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // Reconcile an email-invited builder with this logged-in account, once, if an
  // invite identity was persisted on the welcome page (localStorage or cookie).
  useEffect(() => {
    if (inviteLinkAttemptedRef.current) return;

    let inviteToken: string | undefined;
    let hasInvite = false;
    try {
      const raw = localStorage.getItem('devlabs_invite');
      if (raw) {
        hasInvite = true;
        inviteToken = JSON.parse(raw)?.token;
      }
    } catch {
      /* localStorage unavailable */
    }
    if (!hasInvite && typeof document !== 'undefined') {
      hasInvite = /(?:^|;\s*)devlabs_invite=/.test(document.cookie);
    }
    if (!hasInvite) return;

    inviteLinkAttemptedRef.current = true;
    void (async () => {
      try {
        await fetch('/api/builder/claim/link', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inviteToken ? { token: inviteToken } : {}),
        });
        await loadProfile();
      } catch {
        /* non-fatal — the profile form still works without linking */
      }
    })();
  }, [loadProfile]);

  const fetchHandoff = useCallback(async () => {
    const res = await fetch('/api/builder/imessage-handoff', { credentials: 'include' });
    return res.json();
  }, []);

  const profile: BuilderProfileView | null = data?.profile
    ? {
        ...data.profile,
        name: data.profile.name || data.basics?.name,
        avatarUrl: data.profile.avatarUrl || data.basics?.avatarUrl || null,
        founderHighlights:
          data.profile.founderHighlights ??
          (data.profile as { enrichmentInsights?: { founderHighlights?: BuilderProfileView['founderHighlights'] } })
            .enrichmentInsights?.founderHighlights,
        githubShowcase:
          data.profile.githubShowcase ??
          (data.profile as { enrichmentInsights?: { githubShowcase?: BuilderProfileView['githubShowcase'] } })
            .enrichmentInsights?.githubShowcase,
      }
    : null;

  const builderName = profile?.name || data?.basics?.name || 'Your profile';
  const avatarInitial = (builderName || 'B').slice(0, 1).toUpperCase();
  const hasProfile = Boolean(profile);
  const profileVisible = hasProfile && verified;
  const imessageEnabled = data?.imessageEnabled !== false;

  const navGroups = useMemo(
    () => [
      {
        title: 'Workspace',
        items: [
          { key: 'overview' as const, label: 'Overview', icon: builderNavIcons.overview },
          {
            key: 'profile' as const,
            label: 'Profile',
            icon: builderNavIcons.profile,
            disabled: !hasProfile,
            badge: profileVisible ? 'Live' : undefined,
          },
          {
            key: 'wrapped' as const,
            label: 'Agent Wrapped',
            icon: builderNavIcons.wrapped,
            disabled: !verified || !hasProfile,
            badge: traceUploaded ? 'Done' : verified ? 'Setup' : undefined,
          },
        ],
      },
    ],
    [hasProfile, profileVisible, traceUploaded, verified],
  );

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex min-h-[24rem] items-center justify-center text-black/40">
          <Loader2 className="h-5 w-5 animate-spin text-[#ff7417]" />
        </div>
      );
    }

    if (!data?.success) {
      return (
        <div className="p-5 sm:p-7">
          <div className="builder-content-panel rounded-none p-6 text-sm font-medium text-black/55">
            {data?.error || 'Could not load your profile.'}
          </div>
        </div>
      );
    }

    switch (activeSection) {
      case 'overview':
        return (
          <BuilderOverview
            verified={verified}
            traceUploaded={traceUploaded}
            profileVisible={profileVisible}
            hasProfile={hasProfile}
            profile={profile}
            wrappedPublicUrl={data.agentWrapped?.publicUrl}
            imessageEnabled={imessageEnabled}
            onNavigate={setActiveSection}
          />
        );

      case 'messages':
        if (!imessageEnabled) {
          return (
            <>
              <PageHeader
                title="Builder profile setup"
                subtitle="Add your profile links and upload a resume. DevLabs will auto-fill the profile from those sources."
              />
              <BuilderProfileIntakeForm
                profile={profile}
                onEnrichmentStateChange={setProfileEnriching}
                onSaved={async () => {
                  await loadProfile();
                  setActiveSection('profile');
                }}
              />
            </>
          );
        }
        return (
          <div className="builder-messages-stage relative flex min-h-[calc(100vh-3.5rem)] flex-col">
            <div className="relative z-10 flex flex-1 items-center px-5 py-10 sm:px-7 sm:py-14">
              <BuilderImessageHandoff
                fetchHandoff={fetchHandoff}
                title="Verify in Messages"
                subtitle="Open iMessage and send the pre-filled message. That verifies your number and starts your profile with the DevLabs agent — no codes."
                onVerified={loadProfile}
                pollVerified
              />
            </div>
          </div>
        );

      case 'wrapped':
        return (
          <>
            <PageHeader
              title="Agent Wrapped"
              subtitle="Connect your local agent traces. Run the terminal command, approve the preview, and founders will see how you ship with AI."
              actions={
                data.agentWrapped?.publicUrl && traceUploaded ? (
                  <a
                    href={data.agentWrapped.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="builder-outline-button inline-flex h-9 items-center gap-1.5 px-3 text-xs font-bold uppercase tracking-[0.08em]"
                  >
                    Public link
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null
              }
            />
            <div className="px-5 py-8 sm:px-7 sm:py-10">
              {!verified ? (
                <div className="font-manrope mx-auto max-w-3xl text-sm leading-6 text-black/55">
                  <p>Verify your phone first to unlock the Agent Wrapped terminal command.</p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('messages')}
                    className="builder-primary-button mt-5 inline-flex h-9 items-center px-4 text-xs font-extrabold uppercase tracking-[0.08em]"
                  >
                    Go to Messages
                  </button>
                </div>
              ) : data.agentWrapped ? (
                <AgentTraceSetup
                  builderId={data.agentWrapped.builderId}
                  uploadToken={data.agentWrapped.uploadToken}
                  command={data.agentWrapped.command}
                  publicUrl={data.agentWrapped.publicUrl}
                  messageDelivery={data.agentWrapped.messageDelivery}
                  autoCompleteOnUploaded={!traceUploaded}
                  onComplete={async () => {
                    setTraceUploaded(true);
                    await loadProfile();
                  }}
                />
              ) : (
                <p className="font-manrope mx-auto max-w-3xl text-sm text-black/55">
                  Agent Wrapped command is being prepared. Check back shortly.
                </p>
              )}
            </div>
          </>
        );

      case 'profile':
        return (
          <>
            <PageHeader
              title="Profile"
              subtitle={
                imessageEnabled
                  ? 'This is what founders see when they browse builders on DevLabs. To update it, text the DevLabs agent in Messages.'
                  : 'View and edit the generated founder-facing fields directly here.'
              }
              actions={
                hasProfile ? (
                  <span className="inline-flex items-center gap-1.5 border border-[#ff7417]/30 bg-[#fff5ef] px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-[#bf4f08]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Founder preview
                  </span>
                ) : null
              }
            />
            <div className="px-4 py-6 sm:px-6 sm:py-8 lg:overflow-hidden lg:px-8 lg:py-6">
              {!hasProfile ? (
                <div className="font-manrope mx-auto max-w-3xl">
                  <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#ff7417]">Not live yet</p>
                  <h2 className="mt-3 text-lg font-extrabold tracking-[-0.02em] text-[#050505]">No profile yet</h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-black/50">
                    {verified
                      ? 'DevLabs texted you in Messages. Reply there and your profile will appear here as the agent builds it.'
                      : imessageEnabled
                        ? 'Verify your phone first, then chat with the DevLabs agent to build your proof-of-work profile.'
                        : 'Complete the profile setup form to build your proof-of-work profile.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('messages')}
                    className="builder-primary-button mt-6 inline-flex h-9 items-center px-4 text-xs font-extrabold  tracking-[0.08em]"
                  >
                    {imessageEnabled ? (verified ? 'Open Messages' : 'Verify phone') : 'Open form'}
                  </button>
                </div>
              ) : (
                imessageEnabled ? (
                  <BuilderProfilePreview profile={profile!} />
                ) : (
                  <BuilderProfileEditor profile={profile!} basics={data.basics} onSaved={loadProfile} />
                )
              )}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <BuilderShell
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      builderName={builderName}
      avatarUrl={profile?.avatarUrl || data?.basics?.avatarUrl}
      avatarInitial={avatarInitial}
      onLogout={logout}
      navGroups={navGroups}
      contentOverlay={
        profileEnriching ? (
          <BuilderProfileEnrichmentOverlay
            stage={enrichmentStage}
            label={enrichmentLabel}
            detail={enrichmentDetail}
          />
        ) : null
      }
    >
      {renderContent()}
    </BuilderShell>
  );
};

export default BuilderHome;
