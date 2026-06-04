import React from 'react';
import { Inbox } from 'lucide-react';
import { BlurFade } from '@/components/ui/blur-fade';
import { OsEmptyState, OsPageHeader } from '@/components/os';
import BuilderIntroInbox from './BuilderIntroInbox';
import type { BuilderDashboardContext } from './types';

export default function BuilderIntrosTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const { introInbox, loadDashboard } = ctx;

  const pending = introInbox.filter((i) => i.status === 'requested' || !i.viewedAt);

  return (
    <BlurFade className="space-y-6">
      <OsPageHeader
        title={
          <>
            Intro <span className="font-serif italic hero-underline">Requests</span>
          </>
        }
        subtitle="Founder intro requests and their current status."
      />

      {introInbox.length === 0 ? (
        <OsEmptyState
          icon={<Inbox className="w-8 h-8" />}
          title="No intro requests yet"
          description="When a founder reaches out, their request will appear here. Keep your profile and projects current so founders can evaluate your proof-of-work."
          animateTitle={false}
        />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-3">
                Pending · {pending.length}
              </p>
              <BuilderIntroInbox
                items={pending}
                onResponded={() => loadDashboard({ silent: true })}
              />
            </div>
          ) : null}

          {introInbox.filter((i) => i.status === 'accepted').length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-3">
                Accepted
              </p>
              <div className="space-y-3">
                {introInbox
                  .filter((i) => i.status === 'accepted')
                  .map((intro) => (
                    <div
                      key={intro._id}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="font-medium text-sm text-white">{intro.roleTitle}</p>
                        <p className="text-xs text-white/50">
                          {intro.company} · from {intro.founderName}
                        </p>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full border border-emerald-400/30 text-emerald-300 bg-emerald-400/5">
                        Accepted
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          {introInbox.filter((i) => i.status === 'declined').length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-3">
                Declined
              </p>
              <div className="space-y-3">
                {introInbox
                  .filter((i) => i.status === 'declined')
                  .map((intro) => (
                    <div
                      key={intro._id}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="font-medium text-sm text-white">{intro.roleTitle}</p>
                        <p className="text-xs text-white/50">
                          {intro.company} · from {intro.founderName}
                        </p>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full border border-white/20 text-white/40">
                        Declined
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </BlurFade>
  );
}
