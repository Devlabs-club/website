import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Loader2, ChevronRight, Pencil } from 'lucide-react';
import { canRunPreviewAnyway } from '@/lib/talent/founderSearchQuality';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: 'agent' | 'user' | 'tool';
  text: string;
  toolName?: string;
  options?: AgentOption[];
  searchQuality?: SearchQualityBlock | null;
  timestamp: Date;
};

type SearchQualityBlock = {
  totalScanned: number;
  totalRetrieved: number;
  strongCount: number;
  mediumCount: number;
  poolStrength: 'weak' | 'medium' | 'strong';
  confidence: 'low' | 'medium' | 'high';
  bottlenecks: string[];
  suggestedRelaxations: string[];
  summary: string;
};

type AgentOption = {
  label: string;
  value: string;
};

// ── Option parser ─────────────────────────────────────────────────────────────
// Detects a question + numbered list in the agent response and splits it out.

function parseAgentOptions(text: string): { message: string; question: string; options: AgentOption[] } | null {
  // Match pattern: some text, then a question line, then 1. ... 2. ... etc.
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const optionLines: { idx: number; label: string }[] = [];

  lines.forEach((line, i) => {
    const m = line.match(/^(\d+)\.\s+(.+)$/);
    if (m) optionLines.push({ idx: i, label: m[2] });
  });

  if (optionLines.length < 2) return null;

  // Find the contiguous block of options
  const firstOptionIdx = optionLines[0].idx;
  const lastOptionIdx = optionLines[optionLines.length - 1].idx;

  // Question is the line immediately before the first option
  const questionIdx = firstOptionIdx - 1;
  const question = questionIdx >= 0 ? lines[questionIdx] : '';

  // Message is everything before the question (and anything after the options)
  const messageParts = [
    ...lines.slice(0, Math.max(0, questionIdx)),
    ...lines.slice(lastOptionIdx + 1),
  ].join('\n').trim();

  return {
    message: messageParts,
    question,
    options: optionLines.map(o => ({ label: o.label, value: o.label })),
  };
}

// ── Search Quality Card ────────────────────────────────────────────────────────

function SearchQualityCard({ sq }: { sq: SearchQualityBlock }) {
  const strengthColor = sq.poolStrength === 'strong'
    ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
    : sq.poolStrength === 'medium'
      ? 'text-amber-400 border-amber-500/20 bg-amber-500/5'
      : 'text-red-400 border-red-500/20 bg-red-500/5';

  return (
    <div className={`rounded-xl border p-3 text-xs w-full max-w-[88%] ${strengthColor}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold uppercase tracking-wider text-[10px] opacity-70">Search Quality</span>
        <span className="font-bold capitalize">{sq.poolStrength} pool · {sq.confidence} confidence</span>
      </div>
      <div className="flex gap-4 mb-2 opacity-80">
        <span>{sq.strongCount} strong</span>
        <span>{sq.mediumCount} good</span>
        <span>{sq.totalRetrieved} total</span>
      </div>
      {sq.bottlenecks?.length > 0 ? (
        <p className="opacity-70 mb-1">Bottleneck: {sq.bottlenecks[0]}</p>
      ) : null}
      {sq.suggestedRelaxations?.length > 0 ? (
        <p className="opacity-70">Suggestion: {sq.suggestedRelaxations[0]}</p>
      ) : null}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FounderRoleIntakeChatProps {
  opportunityId: string | null;
  onClose: () => void;
  onSearchCompleted: (opportunityId: string) => void;
}

export default function FounderRoleIntakeChat({
  opportunityId: initialOpportunityId,
  onClose,
  onSearchCompleted,
}: FounderRoleIntakeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [opportunityId, setOpportunityId] = useState<string | null>(initialOpportunityId);
  const [currentBrief, setCurrentBrief] = useState<any>(null);
  const [toolCallLabel, setToolCallLabel] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Use a ref so the init effect only fires once and doesn't need sendToAgent in deps
  const initiatedRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy]);

  const addMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const full: ChatMessage = { ...msg, id: Math.random().toString(36).slice(2), timestamp: new Date() };
    setMessages(prev => [...prev, full]);
    return full;
  };

  const sendToAgent = useCallback(async (text: string, history: ChatMessage[]) => {
    const isInit = text === '__init__';
    // For init: tell the agent whether this is a first-time founder (no opportunityId)
    // so it can calibrate its opening — fresh vs returning.
    const userText = isInit
      ? initialOpportunityId
        ? 'I want to work on my existing role or start a new search.'
        : 'I just signed up. I want to hire a builder for my startup.'
      : text;

    if (!isInit) {
      addMessage({ role: 'user', text });
    }

    setIsBusy(true);
    setToolCallLabel('Thinking...');

    const chatHistory = history
      .filter(m => m.role === 'user' || m.role === 'agent')
      .map(m => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.text }));

    // Add the synthetic user message for init
    if (isInit) {
      chatHistory.push({ role: 'user', content: userText });
    }

    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'founder_chat',
          payload: {
            message: userText,
            opportunityId,
            history: chatHistory.slice(-16),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Agent failed');

      if (data.opportunity?._id) {
        setOpportunityId(String(data.opportunity._id));
        setCurrentBrief(data.opportunity);
      }

      const rawMessage = data.message || '';

      // Extract search quality block from uiBlocks if present
      const sqBlock = (Array.isArray(data.uiBlocks) ? data.uiBlocks : [])
        .find((b: any) => b.type === 'search_quality_report') as SearchQualityBlock | undefined;

      const parsed = parseAgentOptions(rawMessage);

      if (parsed && parsed.options.length >= 2) {
        if (parsed.message) {
          addMessage({ role: 'agent', text: parsed.message });
        }
        addMessage({
          role: 'agent',
          text: parsed.question,
          options: parsed.options,
          searchQuality: sqBlock ?? null,
        });
      } else {
        addMessage({ role: 'agent', text: rawMessage, searchQuality: sqBlock ?? null });
      }

      // Auto-trigger search if brief is ready and agent signals it
      const lower = rawMessage.toLowerCase();
      const wantsSearch = lower.includes('run the builder search') || lower.includes('run search') || lower.includes('want me to run');
      if (data.opportunity && canRunPreviewAnyway(data.opportunity) && wantsSearch) {
        await triggerSearch(String(data.opportunity._id));
      }
    } catch (err: any) {
      addMessage({ role: 'agent', text: `Something went wrong: ${err.message || 'unknown error'}. Try again.` });
    } finally {
      setIsBusy(false);
      setToolCallLabel(null);
    }
  }, [opportunityId]);

  // Init effect — fires once after sendToAgent is available
  useEffect(() => {
    if (initiatedRef.current) return;
    initiatedRef.current = true;
    sendToAgent('__init__', []);
  }, [sendToAgent]);

  const triggerSearch = async (oppId: string) => {
    setIsBusy(true);
    setToolCallLabel('Searching the builder graph...');
    addMessage({ role: 'tool', text: 'Scanning proof-of-work talent graph...', toolName: 'run_search' });

    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'run_builder_search', payload: { opportunityId: oppId } }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Search failed');

      const total = data.shortlist?.totalMatches ?? data.totalMatches ?? 0;
      const strong = data.shortlist?.strongMatchCount ?? data.strongMatchCount ?? 0;

      addMessage({
        role: 'agent',
        text: total > 0
          ? `Found ${total} builder${total === 1 ? '' : 's'}${strong > 0 ? `, ${strong} strong match${strong === 1 ? '' : 'es'}` : ''}. Opening your pipeline...`
          : 'Search complete. No strong matches yet — try widening the skills or adjusting the stack.',
      });

      // Go directly to kanban board — no intermediate card display
      if (total > 0) {
        setTimeout(() => onSearchCompleted(oppId), 800);
      }
    } catch (err: any) {
      addMessage({ role: 'agent', text: `Search failed: ${err.message}` });
    } finally {
      setIsBusy(false);
      setToolCallLabel(null);
    }
  };

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isBusy) return;
    setInputText('');
    sendToAgent(text, messages);
  };

  const handleOptionClick = (option: AgentOption) => {
    setInputText('');
    sendToAgent(option.value, messages);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Only show the option card if the user hasn't already replied after seeing those options.
  // Compare timestamps: if the last user message is newer than the last options message, the
  // options were already answered and the card should be hidden.
  const lastOptionsMessage = [...messages].reverse().find(m => m.options && m.options.length > 0);
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const showOptionCard =
    lastOptionsMessage &&
    !isBusy &&
    (!lastUserMessage || lastOptionsMessage.timestamp >= lastUserMessage.timestamp);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0c0c0e] text-white">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#fa7d22] animate-pulse" />
          <span className="text-xs uppercase tracking-widest text-white/40 font-semibold">
            {currentBrief?.roleTitle && currentBrief.roleTitle !== 'New role'
              ? `${currentBrief.roleTitle} @ ${currentBrief.company || 'Draft'}`
              : 'New role brief'}
          </span>
        </div>

        {currentBrief?._id && (
          <button
            onClick={() => onSearchCompleted(String(currentBrief._id))}
            className="flex items-center gap-1.5 text-xs text-[#fa7d22] hover:text-[#ffb580] font-medium transition-colors"
          >
            View candidates
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        {!currentBrief?._id && <div className="w-24" />}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

          {messages.map((msg) => {
            if (msg.role === 'tool') {
              return (
                <div key={msg.id} className="flex items-center gap-2 text-white/30 text-xs py-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{msg.text}</span>
                </div>
              );
            }

            const isAgent = msg.role === 'agent';

            // Message with options — only show the question text, option card is rendered separately
            if (msg.options && msg.options.length > 0) {
              return (
                <div key={msg.id} className="text-sm text-white/70 leading-relaxed">
                  {msg.text}
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex flex-col gap-2 ${isAgent ? 'items-start' : 'items-end'}`}>
                {isAgent ? (
                  <p className="text-sm text-white/85 leading-relaxed max-w-[88%] whitespace-pre-wrap">
                    {msg.text}
                  </p>
                ) : (
                  <div className="max-w-[75%] px-4 py-2.5 rounded-2xl bg-[#fa7d22] text-black text-sm font-medium leading-relaxed">
                    {msg.text}
                  </div>
                )}
                {isAgent && msg.searchQuality ? (
                  <SearchQualityCard sq={msg.searchQuality} />
                ) : null}
              </div>
            );
          })}

          {/* Thinking indicator */}
          {isBusy && (
            <div className="flex items-center gap-2 text-white/30 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#fa7d22]" />
              <span>{toolCallLabel || 'Thinking...'}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Option card ── */}
      {showOptionCard && lastOptionsMessage && (
        <div className="max-w-2xl mx-auto w-full px-4 pb-3">
          <div className="rounded-2xl border border-white/[0.1] bg-[#111114] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white">
                {lastOptionsMessage.text || 'Choose one'}
              </span>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {lastOptionsMessage.options!.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleOptionClick(opt)}
                  disabled={isBusy}
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-white/[0.04] transition-colors group disabled:opacity-40"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/30 font-mono w-4 shrink-0">{i + 1}</span>
                    <span className="text-sm text-white/80 group-hover:text-white transition-colors">{opt.label}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
                </button>
              ))}
              {/* Something else row */}
              <button
                type="button"
                onClick={() => inputRef.current?.focus()}
                disabled={isBusy}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.04] transition-colors group disabled:opacity-40"
              >
                <Pencil className="w-3.5 h-3.5 text-white/25 shrink-0" />
                <span className="text-sm text-white/40 group-hover:text-white/60 transition-colors italic">Something else</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Input ── */}
      <div className="border-t border-white/[0.06] px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-3 bg-white/[0.04] border border-white/[0.1] rounded-2xl px-4 py-3 focus-within:border-white/20 transition-colors">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the role, ask a question, or type your answer..."
              rows={1}
              disabled={isBusy}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 resize-none outline-none leading-relaxed disabled:opacity-40"
              style={{ minHeight: '24px', maxHeight: '120px' }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputText.trim() || isBusy}
              className="w-8 h-8 rounded-xl bg-[#fa7d22] text-black flex items-center justify-center hover:bg-[#ff9b4e] disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-center text-[11px] text-white/20 mt-2">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
