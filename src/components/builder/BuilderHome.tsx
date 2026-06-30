import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AppTopBar } from '@/components/app/AppTopBar';
import { BuilderProfilePreview, type BuilderProfileView } from './BuilderProfilePreview';
import BuilderPhoneVerify from './BuilderPhoneVerify';

type ProfileResponse = {
  success: boolean;
  error?: string;
  basics?: { name?: string; email?: string | null; avatarUrl?: string | null };
  phone?: string | null;
  phoneVerified?: boolean;
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/builder/profile', { credentials: 'include' });
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const json: ProfileResponse = await res.json();
        setData(json);
        setVerified(Boolean(json.phoneVerified));
      } catch {
        setData({ success: false, error: 'Could not load your profile.' });
      } finally {
        setLoading(false);
      }
    })();
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
        ) : !data?.success || !profile ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {data?.error || 'No builder profile is linked to this account yet.'}
          </div>
        ) : !verified ? (
          <div className="py-6">
            <BuilderPhoneVerify defaultPhone={data.phone} onVerified={() => setVerified(true)} />
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
