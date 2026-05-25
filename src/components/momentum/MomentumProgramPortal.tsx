import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "../auth_manager";
import MomentumApplicationWizard from "./MomentumApplicationWizard";
import MomentumUserDashboard from "./MomentumUserDashboard";
import MomentumAdminDashboard from "./MomentumAdminDashboard";
import type { MomentumApplicationRecord, PortalUser } from "./types";

interface PortalPayload {
  success: boolean;
  message?: string;
  user?: PortalUser;
  application?: MomentumApplicationRecord | null;
}

function splitName(full: string): { first: string; last: string } {
  const p = full.trim().split(/\s+/);
  if (p.length === 0) return { first: "", last: "" };
  if (p.length === 1) return { first: p[0], last: "" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

function PortalInner() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [bootLoading, setBootLoading] = useState(false);

  const fetchPortal = useCallback(async () => {
    if (!authUser) {
      setPayload(null);
      return;
    }
    setBootLoading(true);
    try {
      const res = await fetch("/api/momentum/portal", { credentials: "include" });
      const data = (await res.json()) as PortalPayload;
      setPayload(data);
    } catch {
      setPayload({ success: false, message: "Could not load portal." });
    } finally {
      setBootLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (!authLoading && authUser) {
      void fetchPortal();
    }
    if (!authLoading && !authUser) {
      setPayload(null);
    }
  }, [authLoading, authUser, fetchPortal]);

  useEffect(() => {
    if (!authLoading && !authUser) {
      window.location.href = "/login?redirect=/momentum/apply";
    }
  }, [authLoading, authUser]);

  if (authLoading || (authUser && bootLoading && !payload)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-orange-400" />
        <p className="text-sm text-white/45">Loading…</p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-orange-400" />
        <p className="text-sm text-white/45">Redirecting to login…</p>
      </div>
    );
  }

  if (!payload?.success || !payload.user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-200">
        {payload?.message || "Something went wrong."}
        <button
          type="button"
          onClick={() => void fetchPortal()}
          className="mt-4 block w-full rounded-full border border-white/20 py-2 text-white/80 hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }

  const portalUser = payload.user;
  const application = payload.application ?? null;

  if (portalUser.role === "admin") {
    return <MomentumAdminDashboard />;
  }

  if (application) {
    return <MomentumUserDashboard application={application} />;
  }

  const { first, last } = splitName(authUser.name);

  return (
    <MomentumApplicationWizard
      user={{
        ...portalUser,
        email: portalUser.email || authUser.email,
      }}
      defaultFirstName={first}
      defaultLastName={last}
      onSuccess={() => void fetchPortal()}
    />
  );
}

export default function MomentumProgramPortal() {
  return (
    <AuthProvider>
      <PortalInner />
    </AuthProvider>
  );
}
