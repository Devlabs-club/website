import React, { useCallback } from 'react';
import { AppTopBar } from '@/components/app/AppTopBar';
import BuilderImessageHandoff from './BuilderImessageHandoff';

/** Email-invite claim flow — open iMessage to verify (no OTP). */
export const BuilderClaimHandoffPage: React.FC<{ token: string }> = ({ token }) => {
  const fetchHandoff = useCallback(async () => {
    const res = await fetch(`/api/builder/claim/${encodeURIComponent(token)}/handoff`);
    return res.json();
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl items-center px-4 py-10">
        <div className="w-full">
          <BuilderImessageHandoff
            fetchHandoff={fetchHandoff}
            title="Claim your builder profile"
            subtitle="Open Messages and send the pre-filled text. That verifies you and kicks off your profile with the DevLabs agent — no codes, no forms."
            pollVerified={false}
          />
        </div>
      </main>
    </div>
  );
};

export default BuilderClaimHandoffPage;
