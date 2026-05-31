import React, { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth_manager';
import { AmbientBackground } from './ui/AmbientBackground';
import { LoaderFour } from './ui/loader';

const AdminDashboard = lazy(() => import('./AdminDashboard'));
const FounderOSDashboard = lazy(() => import('./founder/FounderOSDashboard'));
const BuilderOSDashboard = lazy(() => import('./builder/BuilderOSDashboard'));

function RoleDashboardFallback() {
  return (
    <div className="relative min-h-screen text-white flex flex-col items-center justify-center gap-4 p-10">
      <AmbientBackground />
      <LoaderFour text="Loading workspace" />
    </div>
  );
}

function DashboardContent() {
  const { user, loading, authError, refreshAuth } = useAuth();

  useEffect(() => {
    if (loading || user) return;
    const id = window.setTimeout(() => {
      window.location.href = '/login?redirect=/dashboard';
    }, 400);
    return () => window.clearTimeout(id);
  }, [loading, user]);

  if (loading) {
    return (
      <div className="relative min-h-screen text-white flex flex-col items-center justify-center gap-4 p-10">
        <AmbientBackground />
        <LoaderFour text="Loading your workspace" />
      </div>
    );
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
          <a href="/login?redirect=/dashboard" className="px-4 py-2 rounded-xl border border-white/20 text-sm">
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

  if (user.role === 'admin') {
    return (
      <Suspense fallback={<RoleDashboardFallback />}>
        <AdminDashboard />
      </Suspense>
    );
  }

  if (user.role === 'founder') {
    return (
      <Suspense fallback={<RoleDashboardFallback />}>
        <FounderOSDashboard />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RoleDashboardFallback />}>
      <BuilderOSDashboard />
    </Suspense>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
