import React from 'react';
import { BlurFade } from '@/components/ui/blur-fade';
import BuilderCallPanel from '@/components/builder/BuilderCallPanel';
import { OsPageHeader } from '@/components/os';
import type { BuilderDashboardContext } from './types';

export default function BuilderCallsTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const { upcomingCalls, loadDashboard } = ctx;

  return (
    <BlurFade className="space-y-6">
      <OsPageHeader title="Intro calls" subtitle="Confirm or reschedule proposed meeting times." />
      <BuilderCallPanel calls={upcomingCalls} onUpdated={() => loadDashboard({ silent: true })} />
    </BlurFade>
  );
}
