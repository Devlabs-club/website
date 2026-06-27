import React from 'react';
import { BlurFade } from '@/components/ui/blur-fade';
import BuilderTrialPanel from '@/components/builder/BuilderTrialPanel';
import { OsPageHeader } from '@/components/os';
import type { BuilderDashboardContext } from './types';

export default function BuilderTrialsTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const { activeTrials, loadDashboard } = ctx;

  return (
    <BlurFade className="space-y-6">
      <OsPageHeader title="Work trials" subtitle="Build and submit trial projects from founders." />
      <BuilderTrialPanel trials={activeTrials} onSubmitted={() => loadDashboard({ silent: true })} />
    </BlurFade>
  );
}
