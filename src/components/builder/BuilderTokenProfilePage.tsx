import React, { useEffect, useState } from 'react';
import { AppTopBar } from '@/components/app/AppTopBar';
import { BuilderProfilePreview, type BuilderProfileView } from './BuilderProfilePreview';
import { Loader2 } from 'lucide-react';

/**
 * Read-only builder profile, opened from the PRIVATE link the iMessage agent
 * texts the builder. Gated by the claim's view token — only that builder can
 * see it. Reuses BuilderProfilePreview (the same component the dashboard renders).
 */
export const BuilderTokenProfilePage: React.FC<{ token: string }> = ({ token }) => {
  const [profile, setProfile] = useState<BuilderProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/builder/claim/${encodeURIComponent(token)}/profile`);
        const data = await res.json();
        if (data.success) setProfile(data.profile);
        else setError(data.error || 'Profile not found.');
      } catch {
        setError('Could not load this profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Your builder profile</h1>
        <p className="mb-5 text-sm text-muted-foreground">This is what founders see. Only you can open this link.</p>
        {loading ? (
          <div className="flex h-60 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : profile ? (
          <BuilderProfilePreview profile={profile} />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {error || 'This profile link is invalid or expired. Text us and we’ll send a fresh one.'}
          </div>
        )}
      </main>
    </div>
  );
};

export default BuilderTokenProfilePage;
