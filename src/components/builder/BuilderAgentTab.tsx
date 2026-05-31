import React from 'react';
import { Sparkles } from 'lucide-react';
import { BlurFade } from '@/components/ui/blur-fade';
import { PlaceholdersAndVanishInput } from '@/components/ui/placeholders-and-vanish-input';
import { OsChatPanel, OsPageHeader, OsButton } from '@/components/os';
import type { BuilderDashboardContext } from './types';

export default function BuilderAgentTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const {
    builder,
    projects,
    agentMessages,
    agentBusy,
    uiBlocks,
    uploadingResume,
    messagesEndRef,
    fileInputRef,
    setAgentInput,
    handleAgentSend,
    handleResumeUpload,
  } = ctx;

  return (
    <BlurFade className="flex flex-col flex-1 min-h-[calc(100vh-8rem)]">
      <OsPageHeader
        title="DevLabs Agent"
        subtitle="Your AI operator to build proof-of-work and get hired."
      />

      <div className="flex gap-2 flex-wrap mb-4">
        {(builder?.profileCompletion?.missingItems || []).slice(0, 3).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleAgentSend(`Help me add my ${item}`)}
            className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-[#fa7d22]/30 text-white/80 hover:bg-[#fa7d22]/10"
          >
            Add {item}
          </button>
        ))}
      </div>

      <OsChatPanel messages={agentMessages} busy={agentBusy} endRef={messagesEndRef} className="flex-1 mb-4" />

      {agentMessages.length === 1 && !agentBusy ? (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Suggested actions</p>
          <div className="flex flex-wrap gap-2">
            {(builder.profileQuality?.suggestedFixes?.length
              ? builder.profileQuality.suggestedFixes.slice(0, 4).map((fix, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAgentSend(fix.action || '')}
                    className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white/80 hover:bg-white/[0.06] flex items-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#fa7d22]/70" />
                    {fix.action}
                  </button>
                ))
              : ['Add my GitHub', 'Import my Devpost project', 'Find matches for me'].map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => handleAgentSend(action)}
                    className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white/80 hover:bg-white/[0.06]"
                  >
                    {action}
                  </button>
                )))}
          </div>
        </div>
      ) : null}

      {uiBlocks.length > 0 ? (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[160px] overflow-y-auto">
          {uiBlocks.map((block, index) => (
            <div key={`${block.type}-${index}`} className="rounded-2xl border border-[#fa7d22]/20 bg-gradient-to-br from-white/[0.04] to-[#fa7d22]/5 p-4 text-sm">
              <p className="font-semibold text-white mb-1 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#fa7d22]" /> {block.title || block.type}
              </p>
              {block.body ? <p className="text-white/75 text-xs">{block.body}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex gap-3 shrink-0 items-center">
        <div className="flex-1 [&_form]:max-w-none [&_form]:bg-white/5 [&_form]:border [&_form]:border-white/20 [&_form]:shadow-none [&_input]:text-white [&_input]:pl-4">
          <PlaceholdersAndVanishInput
            placeholders={[
              'Tell the agent what to update…',
              'I am open to full-time remote work',
              'Import my Devpost project',
              'Improve my founder-facing summary',
            ]}
            onChange={(e) => setAgentInput(e.target.value)}
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.querySelector('input');
              const text = (input as HTMLInputElement | null)?.value?.trim() || agentInput.trim();
              if (text) handleAgentSend(text);
            }}
          />
        </div>
        <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleResumeUpload} />
        <OsButton variant="glass" onClick={() => fileInputRef.current?.click()} disabled={uploadingResume || agentBusy}>
          {uploadingResume ? 'Uploading…' : 'Upload resume'}
        </OsButton>
      </div>
    </BlurFade>
  );
}
