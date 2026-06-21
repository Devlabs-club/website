import React, { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { CheckCircle2, Clock3, Loader2 } from "lucide-react";

type StatusProfile = {
  name?: string;
  verificationStatus?: string;
  profileCompletion?: { score?: number };
};

export const BuilderVerificationStatusPage: React.FC = () => {
  const [profile, setProfile] = useState<StatusProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/builder/profile", { credentials: "include" });
      const data = await res.json();
      if (data.success) setProfile(data.profile);
      setLoading(false);
    })();
  }, []);

  const approved = ["admin_verified", "founder_verified", "peer_confirmed"].includes(profile?.verificationStatus || "");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar right={<a href="/builder/profile" className="text-sm text-muted-foreground hover:text-foreground">Profile</a>} />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-2xl items-center px-4 py-10">
        {loading ? (
          <div className="flex w-full justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <section className="w-full rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              {approved ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <Clock3 className="h-6 w-6 text-[#fa7d22]" />}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {approved ? "You're approved" : "Your profile is in review"}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              {approved
                ? "Founders can discover your proof-of-work profile and request intros."
                : "DevLabs is reviewing your profile. You can keep refining it while verification is pending."}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <a href="/builder/profile" className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">
                View profile
              </a>
              <a href="/builder/onboarding/refine" className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
                Refine
              </a>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default BuilderVerificationStatusPage;
