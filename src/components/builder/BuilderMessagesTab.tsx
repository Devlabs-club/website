import React from 'react';
import { BlurFade } from '@/components/ui/blur-fade';
import MessagesPanel from '@/components/talent/MessagesPanel';
import { OsPageHeader } from '@/components/os';
import type { BuilderDashboardContext } from './types';

export default function BuilderMessagesTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const { messagesThreadId, messagesIntroId, loadDashboard } = ctx;

  return (
    <BlurFade className="space-y-6">
      <OsPageHeader title="Messages" subtitle="Chat with founders about roles and intros." />
      <MessagesPanel
        viewer="builder"
        initialThreadId={messagesThreadId}
        initialIntroRequestId={messagesIntroId}
        onIntroResponded={() => loadDashboard({ silent: true })}
      />
    </BlurFade>
  );
}
