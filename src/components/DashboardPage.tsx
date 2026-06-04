import React, { useEffect, useState, type ComponentType } from 'react';
import { AuthProvider, useAuth } from './auth_manager';
import { AmbientBackground } from './ui/AmbientBackground';

const CHUNK_RELOAD_KEY = 'devlabs:chunk-reload';

type DashboardModule = { default: ComponentType<unknown> };

const dashboardLoaders: Record<string, () => Promise<DashboardModule>> = {
  admin: () => import('./AdminDashboard'),
  founder: () => import('./founder/FounderOSDashboard'),
  builder: () => import('./builder/BuilderOSDashboard'),
};

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

function loadDashboardModule(role: string): Promise<DashboardModule> {
  const key = role === 'admin' ? 'admin' : role === 'founder' ? 'founder' : 'builder';
  return dashboardLoaders[key]();
}

function RoleDashboard({ role }: { role: string }) {
  const [Module, setModule] = useState<ComponentType<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let loaded = false;
    const timeoutId = window.setTimeout(() => {
      if (!active || loaded) return;
      if (import.meta.env.DEV && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
        return;
      }
      setError('Workspace took too long to load. Try a hard refresh.');
    }, 25_000);

    loadDashboardModule(role)
      .then((mod) => {
        if (!active) return;
        loaded = true;
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        setModule(() => mod.default);
      })
      .catch((err) => {
        if (!active) return;
        if (import.meta.env.DEV && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
          return;
        }
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        setError(err instanceof Error ? err.message : 'Failed to load workspace');
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [role]);

  if (error) {
    return (
      <div className="relative min-h-screen text-white flex flex-col items-center justify-center gap-4 p-10 text-center">
        <AmbientBackground />
        <p className="relative z-10 text-amber-200 max-w-md">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="relative z-10 px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold"
        >
          Reload
        </button>
      </div>
    );
  }

  if (!Module) {
    return <WorkspaceLoader text="Loading workspace" />;
  }

  const Dashboard = Module;
  return <Dashboard />;
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

  return <RoleDashboard role={user.role} />;
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
