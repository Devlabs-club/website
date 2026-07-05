import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareText, ShieldCheck, Sparkles, TerminalSquare } from 'lucide-react';
import { AppTopBar } from '@/components/app/AppTopBar';
import { BuilderProfilePreview, type BuilderProfileView } from './BuilderProfilePreview';
import BuilderImessageHandoff from './BuilderImessageHandoff';
import AgentTraceSetup from './AgentTraceSetup';
import type { MessageDelivery } from './AgentTraceSetup';

type ProfileResponse = {
  success: boolean;
  error?: string;
  basics?: { name?: string; email?: string | null; avatarUrl?: string | null };
  phone?: string | null;
  phoneVerified?: boolean;
  phoneVerificationPending?: boolean;
  agentWrapped?: {
    builderId: string;
    uploadToken: string;
    command: string;
    publicUrl: string;
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

/**
 * Builder home — profile preview gated behind iMessage verification.
 * No OTP: builder opens Messages with a pre-filled "hi devlabs:TOKEN" text.
 */
export const BuilderHome: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [verified, setVerified] = useState(false);
  const [traceUploaded, setTraceUploaded] = useState(false);

  const loadProfile = async () => {
    try {
      const res = await fetch('/api/builder/profile', { credentials: 'include' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const json: ProfileResponse = await res.json();
      setData(json);
      setVerified(Boolean(json.phoneVerified));
      if (json.phoneVerified && json.agentWrapped?.builderId && json.agentWrapped?.uploadToken) {
        const params = new URLSearchParams({
          builderId: json.agentWrapped.builderId,
          token: json.agentWrapped.uploadToken,
        });
        const statusRes = await fetch(`/api/builder/wrapped/status?${params.toString()}`, { credentials: 'include' });
        const status = await statusRes.json().catch(() => ({}));
        setTraceUploaded(Boolean(status.ok && status.uploaded));
      } else {
        setTraceUploaded(false);
      }
    } catch {
      setData({ success: false, error: 'Could not load your profile.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const fetchHandoff = useCallback(async () => {
    const res = await fetch('/api/builder/imessage-handoff', { credentials: 'include' });
    return res.json();
  }, []);

  const profile: BuilderProfileView | null = data?.profile
    ? {
        ...data.profile,
        name: data.profile.name || data.basics?.name,
        avatarUrl: data.profile.avatarUrl || data.basics?.avatarUrl || null,
      }
    : null;

  return (
    <div className="dashboard-canvas min-h-screen text-[#14110f]">
      <AppTopBar
        right={
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-9 items-center rounded-xl border border-[#1a140f]/10 bg-white px-3 text-sm font-semibold text-[#5e554d] shadow-[0_8px_20px_rgba(33,24,16,0.06)] transition-colors hover:bg-[#fff7ef] hover:text-[#14110f]"
          >
            Log out
          </button>
        }
      />
      <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <aside className="dashboard-shell-card flex min-h-[calc(100vh-6.5rem)] flex-col rounded-[24px]">
          <div className="border-b border-[#1a140f]/10 px-5 py-4">
            <div className="flex items-center gap-3">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name || 'Builder'}
                  className="h-14 w-14 rounded-2xl border border-[#1a140f]/10 object-cover shadow-[0_12px_28px_rgba(33,24,16,0.10)]"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#fa7d22]/25 bg-[#fff7ef] text-lg font-extrabold text-[#fa7d22] shadow-[0_12px_28px_rgba(33,24,16,0.08)]">
                  {(profile?.name || data?.basics?.name || 'B').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#fa7d22]">Builder desk</p>
                <h1 className="mt-0.5 truncate text-xl font-extrabold tracking-tight">
                  {profile?.name || data?.basics?.name || 'Your profile'}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-between gap-6 p-5">
            <div className="space-y-5">
              <div>
                <p className="text-sm font-bold text-[#14110f]">Proof-of-work profile.</p>
                <p className="mt-2 max-w-[18rem] text-sm leading-6 text-[#6f665d]">
                  Verify your phone, connect your agent traces, and keep the founder-facing profile
                  current through Messages.
                </p>
              </div>

              <div className="space-y-3">
                <div className="dashboard-inset rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#14110f]">
                    <ShieldCheck className="h-4 w-4 text-[#fa7d22]" />
                    Phone verification
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#776e65]">
                    {verified ? 'Verified and ready for founder introductions.' : 'Confirm your number so DevLabs can reach you.'}
                  </p>
                </div>
                <div className="dashboard-inset rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#14110f]">
                    <TerminalSquare className="h-4 w-4 text-[#fa7d22]" />
                    Agent Wrapped
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#776e65]">
                    {traceUploaded ? 'Trace summary uploaded.' : 'Run the local trace command to unlock richer proof.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="dashboard-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9b9188]">
                <MessageSquareText className="h-3.5 w-3.5" />
                Profile status
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_10px_26px_rgba(33,24,16,0.06)]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fa7d22]/10 text-[#fa7d22]">
                  {profile ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </span>
                <p className="text-sm font-semibold text-[#332b25]">
                  {profile
                    ? 'Visible to founders'
                    : verified
                      ? 'Waiting for profile details'
                      : 'Verification needed'}
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="dashboard-panel min-h-[calc(100vh-6.5rem)] rounded-[24px] p-5 sm:p-7">
        {loading ? (
          <div className="flex h-full min-h-[24rem] items-center justify-center text-[#8b8178]">
            <Loader2 className="h-5 w-5 animate-spin text-[#fa7d22]" />
          </div>
        ) : !data?.success ? (
          <div className="dashboard-inset rounded-2xl p-6 text-sm font-medium text-[#746b62]">
            {data?.error || 'Could not load your profile.'}
          </div>
        ) : !verified ? (
          <div className="mx-auto max-w-xl py-6">
            <BuilderImessageHandoff
              fetchHandoff={fetchHandoff}
              title="Verify in Messages"
              subtitle="Open iMessage and send the pre-filled message. That verifies your number and starts your profile with the DevLabs agent — no codes."
              onVerified={loadProfile}
              pollVerified
            />
          </div>
        ) : data.agentWrapped && !traceUploaded ? (
          <div className="py-2">
            <AgentTraceSetup
              builderId={data.agentWrapped.builderId}
              uploadToken={data.agentWrapped.uploadToken}
              command={data.agentWrapped.command}
              publicUrl={data.agentWrapped.publicUrl}
              messageDelivery={data.agentWrapped.messageDelivery}
              onComplete={async () => {
                setTraceUploaded(true);
                await loadProfile();
              }}
            />
          </div>
        ) : !profile ? (
          <div className="dashboard-inset rounded-2xl p-6 text-sm font-medium leading-6 text-[#746b62]">
            DevLabs texted you in Messages. Reply there and your profile will appear here as the
            agent builds it.
          </div>
        ) : (
          <>
            <div className="mb-6 border-b border-[#1a140f]/10 pb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#fa7d22]">Founder preview</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Your builder profile</h2>
              <p className="mt-2 text-sm text-[#746b62]">
                This is what founders see. To update it, just text the DevLabs agent in Messages.
              </p>
            </div>
            <BuilderProfilePreview profile={profile} />
          </>
        )}
        </section>
      </main>
    </div>
  );
};

export default BuilderHome;
