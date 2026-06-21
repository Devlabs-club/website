import React, { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { BuilderProfilePreview, type BuilderProfileView } from "./BuilderProfilePreview";
import { Loader2 } from "lucide-react";

export const BuilderOwnProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<BuilderProfileView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/builder/profile", { credentials: "include" });
      const data = await res.json();
      if (data.success) setProfile(data.profile);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar right={<a href="/builder/onboarding/refine" className="text-sm text-muted-foreground hover:text-foreground">Refine</a>} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight">Your builder profile</h1>
        {loading ? (
          <div className="flex h-60 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : profile ? (
          <BuilderProfilePreview profile={profile} />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No profile yet. <a href="/builder/onboarding/profile" className="text-foreground underline">Create one</a>.
          </div>
        )}
      </main>
    </div>
  );
};

export default BuilderOwnProfilePage;
