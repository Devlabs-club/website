import React from 'react';
import { AlertCircle, LayoutGrid } from 'lucide-react';
import { BlurFade } from '@/components/ui/blur-fade';
import { MagicCard } from '@/components/ui/magic-card';
import { OsEmptyState, OsPageHeader, OsButton } from '@/components/os';
import { getProjectImageUrl } from './builderUi';
import type { BuilderDashboardContext } from './types';

export default function BuilderProjectsTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const { projects, setActiveTab, setAgentInput } = ctx;

  return (
    <BlurFade className="space-y-6">
      <OsPageHeader
        title={
          <>
            Proof of <span className="font-serif italic hero-underline">Work</span>
          </>
        }
        actions={<OsButton variant="glass" onClick={() => setActiveTab('agent')}>Ask Agent</OsButton>}
      />

      {projects.length ? (
        <div className="grid grid-cols-1 gap-4">
          {projects.map((project, i) => {
            const imageUrl = getProjectImageUrl(project);
            const verificationLabel =
              project.verificationStatus === 'builder_confirmed'
                ? 'Builder Claimed'
                : project.verificationStatus?.replace('_', ' ') || 'Self Claimed';

            return (
              <BlurFade key={project._id} delay={0.05 * i}>
                <MagicCard
                  className="rounded-2xl"
                  gradientFrom="#fa7d22"
                  gradientTo="#ffb580"
                  gradientColor="rgba(250,125,34,0.12)"
                  gradientOpacity={0.5}
                >
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/30 backdrop-blur-xl p-5">
                    <div className="flex flex-col md:flex-row gap-5">
                      {imageUrl ? (
                        <div className="w-full md:w-32 h-32 shrink-0 overflow-hidden rounded-xl border border-white/10">
                          <img src={imageUrl} alt={`${project.projectName} preview`} className="h-full w-full object-cover" loading="lazy" />
                        </div>
                      ) : null}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <h3 className="text-xl font-semibold text-white">{project.projectName}</h3>
                            <p className="text-sm text-white/70 mt-1">{project.description || 'No description yet.'}</p>
                          </div>
                          <span className="px-2.5 py-1 text-[10px] uppercase tracking-wider rounded-full bg-white/5 border border-white/10 text-white/70">
                            {verificationLabel}
                          </span>
                        </div>
                        {project.builderContribution ? (
                          <p className="mt-4 text-sm text-white/90 leading-relaxed p-3 rounded-xl bg-white/[0.02] border border-white/5">
                            {project.builderContribution}
                          </p>
                        ) : (
                          <div className="mt-4 flex items-center gap-2 text-amber-400/90 text-sm p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>Contribution missing.</span>
                            <button
                              type="button"
                              onClick={() => {
                                setAgentInput(`Add my contribution to ${project.projectName}`);
                                setActiveTab('agent');
                              }}
                              className="ml-auto text-xs underline"
                            >
                              Fix with Agent
                            </button>
                          </div>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {(project.techStack || []).slice(0, 6).map((tech) => (
                            <span key={tech} className="text-xs px-2 py-1 rounded-md bg-[#fa7d22]/10 border border-[#fa7d22]/20 text-[#fa7d22]">
                              {tech}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </MagicCard>
              </BlurFade>
            );
          })}
        </div>
      ) : (
        <OsEmptyState
          icon={<LayoutGrid className="w-8 h-8" />}
          title="No proof-of-work added yet"
          description="Projects help founders understand what you can actually build."
          animateTitle={false}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <OsButton variant="glass" onClick={() => { setAgentInput('I want to import a project from Devpost'); setActiveTab('agent'); }}>
                Import from Devpost
              </OsButton>
              <OsButton variant="shimmer" onClick={() => { setAgentInput('I want to add a project manually'); setActiveTab('agent'); }}>
                Add manually
              </OsButton>
            </div>
          }
        />
      )}
    </BlurFade>
  );
}
