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
    <div className="builder-dashboard font-manrope min-h-screen text-[#050505]">
      <AppTopBar />
      <main className="builder-messages-stage relative flex min-h-[calc(100vh-3.5rem)] w-full items-center justify-center px-4 py-10">
        <div className="relative z-10 w-full max-w-lg">
          <BuilderImessageHandoff
            fetchHandoff={fetchHandoff}
            title="Claim your builder profile"
            subtitle="Open Messages and send the pre-filled text. That verifies you and kicks off your profile with the DevLabs agent — no codes, no forms."
            stepLabel="01 · Claim"
            pollVerified={false}
          />
        </div>
      </main>
    </div>
  );
};

export default BuilderClaimHandoffPage;
