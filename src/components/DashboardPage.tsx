import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth_manager';
import { AmbientBackground } from './ui/AmbientBackground';
import { resolvePostAuthDestination } from '@/lib/authDestination';

function clearStaticLoader() {
  document.getElementById('dashboard-static-loader')?.remove();
}

function WorkspaceLoader({ text }: { text: string }) {
  useEffect(() => {
    clearStaticLoader();
  }, []);

  return (
    <div className="relative min-h-screen text-white flex flex-col items-center justify-center gap-3 p-10">
      <AmbientBackground />
      <div
        className="relative z-10 h-8 w-8 rounded-full border-2 border-white/20 border-t-[#fa7d22] animate-spin"
        aria-hidden="true"
      />
      <p className="relative z-10 text-sm text-white/60">{text}</p>
    </div>
  );
}

function RoleRedirect({
  role,
  accountType,
}: {
  role: string;
  accountType?: 'founder' | 'builder' | null;
}) {
  useEffect(() => {
    window.location.replace(resolvePostAuthDestination({ role, accountType }, null));
  }, [role, accountType]);

  return <WorkspaceLoader text="Opening workspace" />;
}

function DashboardContent() {
  const { user, loading, authError, refreshAuth } = useAuth();

  useEffect(() => {
    if (loading || user) return;
    const id = window.setTimeout(() => {
      window.location.href = '/auth/login?redirect=/dashboard';
    }, 400);
    return () => window.clearTimeout(id);
  }, [loading, user]);

  if (loading) {
    return <WorkspaceLoader text="Checking session…" />;
  }

  if (authError) {
    return (
      <div className="relative min-h-screen text-white flex flex-col items-center justify-center gap-4 p-10 text-center">
        <AmbientBackground />
        <p className="relative z-10 text-amber-200 max-w-md">{authError}</p>
        <div className="relative z-10 flex gap-3">
          <button type="button" onClick={() => refreshAuth()} className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold">
            Retry
          </button>
          <a href="/auth/login?redirect=/dashboard" className="px-4 py-2 rounded-xl border border-white/20 text-sm">
            Sign in again
          </a>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen text-white flex items-center justify-center p-10">
        <AmbientBackground />
        <p className="relative z-10">Redirecting to sign in…</p>
      </div>
    );
  }

  return <RoleRedirect role={user.role} accountType={user.accountType} />;
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
