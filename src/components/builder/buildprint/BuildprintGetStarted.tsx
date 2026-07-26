import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { AuthProvider, useAuth } from '@/components/auth_manager';
import AgentTraceSetup from '@/components/builder/AgentTraceSetup';
import BuildprintDiscoverabilityPrompt from '@/components/builder/buildprint/BuildprintDiscoverabilityPrompt';
import {
  getBuildprintSignupHref,
  loadBuildprintAttr,
  persistBuildprintAttr,
  readBuildprintAttrFromSearch,
} from '@/lib/agentWrapped/buildprintAttribution';
import { trackBuildprintEvent } from '@/lib/analytics/buildprintFunnel';

type ProfilePayload = {
  ok?: boolean;
  success?: boolean;
  profile?: { _id?: string; id?: string; name?: string };
  agentWrapped?: {
    uploadToken?: string | null;
    command?: string | null;
    publicUrl?: string | null;
    uploaded?: boolean;
  };
};

const BuildprintGetStartedInner: React.FC = () => {
  const { user, loading, isAuthenticated } = useAuth();
  const [profileLoading, setProfileLoading] = useState(false);
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [error, setError] = useState('');
  const [showDiscoverability, setShowDiscoverability] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromUrl = readBuildprintAttrFromSearch(window.location.search);
    persistBuildprintAttr({ ...loadBuildprintAttr(), ...fromUrl, ts: Date.now() });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || user?.accountType !== 'builder') return;
    setProfileLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/builder/profile', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || data?.message || 'Could not load builder profile');
        setPayload(data);
        trackBuildprintEvent('buildprint_signup_completed', {
          builderId: String(data?.profile?._id || data?.profile?.id || ''),
          ...loadBuildprintAttr(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load builder profile');
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [isAuthenticated, user?.accountType]);

  if (loading || profileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbf6f3]">
        <Loader2 className="h-6 w-6 animate-spin text-[#fa7d22]" />
      </main>
    );
  }

  if (!isAuthenticated || user?.accountType !== 'builder') {
    const signupHref = getBuildprintSignupHref('/builder/buildprint/get?step=command');
    return (
      <main className="min-h-screen bg-[#fbf6f3] px-6 py-10 text-[#14110f]">
        <div className="mx-auto max-w-xl">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-black">
            <img src="/logo.png" alt="" className="h-7 w-7" />
            DevLabs
          </a>
          <h1 className="mt-10 font-gatwick text-4xl font-black tracking-[-0.04em]">Get your AI Wrapped</h1>
          <p className="mt-4 text-base font-medium text-black/60">
            See what your real building sessions reveal about how you work.
          </p>
          <ul className="mt-8 space-y-3 text-sm font-medium text-black/70">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-[#fa7d22]" /> Runs on your computer
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-[#fa7d22]" /> Removes sensitive information
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-[#fa7d22]" /> Shows you the result before anything is
              published
            </li>
          </ul>
          <a
            href={signupHref}
            onClick={() => trackBuildprintEvent('buildprint_signup_started', { ...loadBuildprintAttr() })}
            className="mt-10 inline-flex h-12 items-center justify-center rounded-xl bg-[#fa7d22] px-5 text-sm font-extrabold text-white"
          >
            Continue with Google or email
          </a>
          <p className="mt-3 text-xs text-black/45">
            Use Google or email to create a builder account. Then you’ll get a personalized local command.
          </p>
        </div>
      </main>
    );
  }

  const builderId = String(payload?.profile?._id || payload?.profile?.id || '');
  const token = payload?.agentWrapped?.uploadToken || '';
  const command = payload?.agentWrapped?.command || '';
  const publicUrl = payload?.agentWrapped?.publicUrl || (builderId ? `/builder/wrapped/${builderId}` : null);

  if (done && publicUrl) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#fbf6f3] px-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <h1 className="mt-4 font-gatwick text-3xl font-black">Your AI Wrapped is ready</h1>
        <p className="mt-2 max-w-md text-sm text-black/60">
          Review it, choose your public identity, and share when you’re ready.
        </p>
        <a
          href={publicUrl}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#fa7d22] px-5 text-sm font-extrabold text-white"
        >
          Open my AI Wrapped
        </a>
        <BuildprintDiscoverabilityPrompt open={showDiscoverability} onDone={() => setShowDiscoverability(false)} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fbf6f3] px-6 py-10 text-[#14110f]">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-black">
          <img src="/logo.png" alt="" className="h-7 w-7" />
          DevLabs
        </a>
        <h1 className="mt-8 font-gatwick text-3xl font-black tracking-[-0.04em]">Get your AI Wrapped</h1>
        <p className="mt-3 text-sm font-medium text-black/60">
          Copy the command, run it locally, preview the result, then approve the upload.
        </p>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {!token || !command ? (
          <div className="mt-8 rounded-2xl border border-black/10 bg-white p-5 text-sm text-black/60">
            Finish verifying your builder profile to unlock the analysis command, then return here.
            <a href="/builder/home" className="mt-4 block font-bold text-[#fa7d22]">
              Go to builder home →
            </a>
          </div>
        ) : (
          <div className="mt-8">
            <AgentTraceSetup
              builderId={builderId}
              uploadToken={token}
              command={command}
              publicUrl={publicUrl}
              autoCompleteOnUploaded={false}
              onComplete={async () => {
                setDone(true);
                setShowDiscoverability(true);
              }}
            />
          </div>
        )}
      </div>
      <BuildprintDiscoverabilityPrompt open={showDiscoverability} onDone={() => setShowDiscoverability(false)} />
    </main>
  );
};

export const BuildprintGetStarted: React.FC = () => (
  <AuthProvider>
    <BuildprintGetStartedInner />
  </AuthProvider>
);

export default BuildprintGetStarted;
