import React from 'react';
import { AlertCircle, Check, Users } from 'lucide-react';
import { BlurFade } from '@/components/ui/blur-fade';
import { MagicCard } from '@/components/ui/magic-card';
import { OsBadge, OsButton, OsEmptyState, OsPageHeader } from '@/components/os';
import { formatWorkType } from './builderUi';
import type { BuilderDashboardContext } from './types';

export default function BuilderMatchesTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const {
    matches,
    projects,
    matchScore,
    introInbox,
    setActiveTab,
    setAgentInput,
    setMessagesThreadId,
    setMessagesIntroId,
  } = ctx;

  return (
    <BlurFade className="space-y-6">
      <OsPageHeader
        title={
          <>
            Opportunity <span className="font-serif italic hero-underline">Matches</span>
          </>
        }
        actions={<OsButton variant="glass" onClick={() => setActiveTab('profile')}>Update Profile</OsButton>}
      />

      {matches.length ? (
        <div className="grid grid-cols-1 gap-6">
          {matches.map((match, i) => (
            <BlurFade key={match._id} delay={0.05 * i}>
              <MagicCard className="rounded-3xl" gradientFrom="#fa7d22" gradientTo="#ffb580" gradientColor="rgba(250,125,34,0.1)" gradientOpacity={0.4}>
                <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-xl font-semibold">{match.roleTitle || 'Founder Opportunity'}</h3>
                      <p className="text-sm text-white/70 mt-1">{match.company || 'Confidential Startup'}</p>
                    </div>
                    <OsBadge variant="score" score={match.matchScore}>
                      {match.matchLabel?.replace('_', ' ') || 'Match'} · {match.matchScore}%
                    </OsBadge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 text-sm">
                    <div>
                      <p className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Work Type</p>
                      <p className="capitalize">{formatWorkType(match.workType)}</p>
                    </div>
                    <div>
                      <p className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Compensation</p>
                      <p>{match.compensation || 'TBD'}</p>
                    </div>
                    <div>
                      <p className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Timeline</p>
                      <p>{match.timeline || 'Immediate'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/[0.02] rounded-2xl p-5 border border-white/5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80 mb-3 flex items-center gap-2">
                        <Check className="w-4 h-4" /> Why you match
                      </p>
                      <p className="text-sm text-white/80 leading-relaxed">{match.reasoning || "Your skills align with the founder's requirements."}</p>
                    </div>
                    {match.missingProof?.length ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-400/80 mb-3 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> Missing proof
                        </p>
                        <ul className="text-sm text-white/70 space-y-2 list-disc list-inside">
                          {match.missingProof.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-6 flex flex-wrap justify-end gap-3 pt-4 border-t border-white/10">
                    {match.status === 'intro_requested' ||
                    introInbox.some((i) => i.roleTitle === match.roleTitle && i.company === match.company) ? (
                      <OsButton
                        variant="white"
                        onClick={() => {
                          const intro = introInbox.find((i) => i.roleTitle === match.roleTitle && i.company === match.company);
                          if (intro?.threadId) setMessagesThreadId(intro.threadId);
                          if (intro?._id) setMessagesIntroId(intro._id);
                          setActiveTab('messages');
                        }}
                      >
                        View intro request
                      </OsButton>
                    ) : match.status === 'trial' ? (
                      <OsButton variant="white" onClick={() => setActiveTab('trials')}>
                        Open trial
                      </OsButton>
                    ) : match.status !== 'hired' ? (
                      <OsButton
                        variant="shimmer"
                        onClick={() => {
                          setAgentInput(`I'm interested in the ${match.company || 'startup'} role`);
                          setActiveTab('agent');
                        }}
                      >
                        Express interest
                      </OsButton>
                    ) : null}
                  </div>
                </div>
              </MagicCard>
            </BlurFade>
          ))}
        </div>
      ) : (
        <OsEmptyState
          icon={<Users className="w-8 h-8" />}
          title="No matches yet"
          description={
            projects.length === 0
              ? 'Add at least one proof-of-work project before we can match you with founders.'
              : matchScore >= 80
                ? 'Your profile is match-ready. Opportunities will appear here when they match your skills.'
                : 'Complete your profile to become eligible for matches.'
          }
          animateTitle={false}
          action={
            <OsButton
              variant={projects.length === 0 ? 'white' : 'shimmer'}
              onClick={() => setActiveTab(projects.length === 0 ? 'projects' : matchScore >= 80 ? 'agent' : 'profile')}
            >
              {projects.length === 0 ? 'Add proof-of-work' : matchScore >= 80 ? 'Ask Agent to find matches' : 'Keep profile updated'}
            </OsButton>
          }
        />
      )}
    </BlurFade>
  );
}
