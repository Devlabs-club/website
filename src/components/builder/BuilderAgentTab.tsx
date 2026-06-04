import React from 'react';
import { Sparkles, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BlurFade } from '@/components/ui/blur-fade';
import { PlaceholdersAndVanishInput } from '@/components/ui/placeholders-and-vanish-input';
import { OsChatPanel, OsPageHeader } from '@/components/os';
import AgentOptions from './AgentOptions';
import type { BuilderDashboardContext } from './types';

export default function BuilderAgentTab({ ctx }: { ctx: BuilderDashboardContext }) {
  const {
    builder,
    agentMessages,
    agentInput,
    agentBusy,
    uiBlocks,
    uploadingResume,
    messagesEndRef,
    fileInputRef,
    setAgentInput,
    handleAgentSend,
    handleResumeUpload,
  } = ctx;

  const suggestedActions = builder.profileQuality?.suggestedFixes?.length
    ? builder.profileQuality.suggestedFixes.slice(0, 4).map((fix) => fix.action || '')
    : ['Add my GitHub', 'Import my Devpost project', 'Review my profile for missing proof', 'Improve my summary'];

  return (
    <BlurFade className="flex flex-col flex-1 min-h-[calc(100vh-8rem)]">
      <OsPageHeader
        title="Profile Agent"
        subtitle="Turn scattered projects into a clear, founder-readable profile."
      />

      {/* Missing items chips */}
      {(builder?.profileCompletion?.missingItems || []).length > 0 ? (
        <div className="flex gap-2 flex-wrap mb-4">
          {(builder.profileCompletion?.missingItems || []).slice(0, 3).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleAgentSend(`Help me add my ${item}`)}
              className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.03] border border-[#fa7d22]/20 text-white/70 hover:bg-[#fa7d22]/8 hover:text-white transition-colors"
            >
              + Add {item}
            </button>
          ))}
        </div>
      ) : null}

      {/* Chat */}
      <OsChatPanel messages={agentMessages} busy={agentBusy} endRef={messagesEndRef} className="flex-1 mb-4" />

      {/* Suggested actions — only on first open */}
      {agentMessages.length <= 1 && !agentBusy ? (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-2.5">Suggested</p>
          <div className="flex flex-wrap gap-2">
            {suggestedActions.filter(Boolean).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => handleAgentSend(action)}
                className="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/8 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-all flex items-center gap-2"
              >
                <Sparkles className="w-3 h-3 text-[#fa7d22]/60" />
                {action}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* UI blocks */}
      {uiBlocks.length > 0 ? (
        <div className="mb-4 space-y-3">
          {uiBlocks.map((block, index) => {
            // Structured option card — render AgentOptions
            if (block.type === 'options' && Array.isArray((block as any).options)) {
              return (
                <div key={`${block.type}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <AgentOptions
                    question={(block as any).question || ''}
                    options={(block as any).options}
                    allowCustom={(block as any).allowCustom}
                    onSelect={(opt) => handleAgentSend(opt.value)}
                  />
                </div>
              );
            }

            // Confirmation card
            if (block.type === 'confirmation') {
              const b = block as any;
              return (
                <div key={`${block.type}-${index}`} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="font-semibold text-white text-sm mb-1">{b.title}</p>
                  {b.description ? <p className="text-white/60 text-xs mb-3">{b.description}</p> : null}
                  {b.preview?.message ? (
                    <p className="text-white/50 text-xs italic mb-3 border-l border-white/10 pl-3">{b.preview.message}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAgentSend(`Yes, confirm: ${b.actionName}`)}
                      className="px-3 py-1.5 rounded-lg bg-[#fa7d22] text-black text-xs font-semibold hover:bg-[#ffb580] transition-colors"
                    >
                      {b.confirmLabel || 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAgentSend(`Cancel, don't ${b.actionName}`)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white/60 text-xs hover:text-white transition-colors"
                    >
                      {b.cancelLabel || 'Cancel'}
                    </button>
                  </div>
                </div>
              );
            }

            // Profile quality card
            if (block.type === 'profile_quality' || block.type === 'profile_diagnosis') {
              const b = block as any;
              return (
                <div key={`${block.type}-${index}`} className="rounded-xl border border-[#fa7d22]/15 bg-[#fa7d22]/5 p-4 text-sm">
                  <p className="font-semibold text-white mb-2 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-[#fa7d22]" />
                    {b.title || 'Profile Quality'}
                  </p>
                  {b.body ? <p className="text-white/60 text-xs leading-relaxed mb-2">{b.body}</p> : null}
                  {Array.isArray(b.items) ? (
                    <ul className="space-y-1">
                      {(b.items as string[]).map((item, i) => (
                        <li key={i} className="text-xs text-white/50 flex items-start gap-1.5">
                          <span className="text-[#fa7d22] mt-0.5">·</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            }

            // Generic fallback card
            return (
              <div key={`${block.type}-${index}`} className="rounded-xl border border-[#fa7d22]/15 bg-[#fa7d22]/5 p-4 text-sm">
                <p className="font-semibold text-white mb-1 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#fa7d22]" />
                  {(block as any).title || block.type}
                </p>
                {(block as any).body ? <p className="text-white/60 text-xs leading-relaxed">{(block as any).body}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Input row */}
      <div className="flex gap-2.5 shrink-0 items-center">
        <div className="flex-1 [&_form]:max-w-none [&_form]:bg-white/[0.04] [&_form]:border [&_form]:border-white/10 [&_form]:shadow-none [&_input]:text-white [&_input]:pl-4">
          <PlaceholdersAndVanishInput
            placeholders={[
              'Tell the agent what to update…',
              'Import my Devpost project',
              'Clarify my contribution on this project',
              'Improve my founder-readable summary',
              'What proof is missing from my profile?',
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
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingResume || agentBusy}
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-white/60 hover:text-white hover:border-white/20 text-sm font-medium transition-all disabled:opacity-40 shrink-0"
        >
          <Upload className="w-4 h-4" />
          {uploadingResume ? 'Uploading…' : 'Resume'}
        </button>
      </div>
    </BlurFade>
  );
}
