import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AppTopBar } from '@/components/app/AppTopBar';
import { BuilderProfilePreview, type BuilderProfileView } from './BuilderProfilePreview';
import BuilderPhoneVerify from './BuilderPhoneVerify';
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
 * Builder home. The dashboard is now a single surface: the builder's profile —
 * "what founders see" — gated behind phone verification. On first visit the
 * builder verifies their number, which hands them off to the DevLabs iMessage
 * agent; everything else happens in Messages.
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

  const profile: BuilderProfileView | null = data?.profile
    ? {
        ...data.profile,
        name: data.profile.name || data.basics?.name,
        avatarUrl: data.profile.avatarUrl || data.basics?.avatarUrl || null,
      }
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar
        right={
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Log out
          </button>
        }
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex h-60 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !data?.success ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {data?.error || 'Could not load your profile.'}
          </div>
        ) : !verified ? (
          <div className="py-6">
            <BuilderPhoneVerify
              defaultPhone={data.phone}
              phoneVerificationPending={Boolean(data.phoneVerificationPending)}
              onVerified={loadProfile}
            />
          </div>
        ) : data.agentWrapped && !traceUploaded ? (
          <div className="py-6">
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
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            DevLabs texted you in Messages. Reply there and your profile will appear here as the
            agent builds it.
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight">Your builder profile</h1>
            <p className="mb-5 text-sm text-muted-foreground">
              This is what founders see. To update it, just text the DevLabs agent in Messages.
            </p>
            <BuilderProfilePreview profile={profile} />
          </>
        )}
      </main>
    </div>
  );
};

export default BuilderHome;
