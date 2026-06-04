/**
 * FounderOnboardingChat — shown when a founder has zero active roles.
 * Powered by the same agentic founder_chat tool-calling loop.
 * No predefined steps, no hardcoded responses, no fake timeouts.
 */
import FounderRoleIntakeChat from './FounderRoleIntakeChat';
import React from 'react';

interface FounderOnboardingChatProps {
  onCompleted: (startupData: { company: string; startupSummary: string; logoUrl?: string }) => void;
}

// Bridge: the old onCompleted signature is no longer needed — the intake chat
// calls onSearchCompleted(opportunityId) which the dashboard handles directly.
// This component exists only for backwards-compat if anything still imports it.
export default function FounderOnboardingChat({ onCompleted }: FounderOnboardingChatProps) {
  return (
    <FounderRoleIntakeChat
      opportunityId={null}
      onClose={() => {}}
      onSearchCompleted={() => onCompleted({ company: '', startupSummary: '' })}
    />
  );
}
