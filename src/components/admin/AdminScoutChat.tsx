import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, ChevronRight, Pencil, CheckCircle2, XCircle } from 'lucide-react';
import { canRunPreviewAnyway } from '@/lib/talent/searchReadiness';
import {
  parseAgentOptions,
  isStartFreshIntent,
  getOrCreateScoutSessionId,
  type AdminCandidate,
  type AgentOption,
  type SearchQualityBlock,
} from './adminScoutUtils';

type ChatMessage = {
  id: string;
  role: 'agent' | 'user' | 'tool';
  text: string;
  options?: AgentOption[];
  searchQuality?: SearchQualityBlock | null;
  toolStatus?: 'loading' | 'done' | 'error';
  timestamp: Date;
};

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const raw = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(res.ok ? 'Invalid server response' : `Server error (${res.status})`);
    }
    if (!res.ok || !data.success) {
      throw new Error(String(data.error || data.message || 'Request failed'));
    }
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Check server logs for the current tool step.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function userExplicitlyRequestedSearch(text: string): boolean {
  const trimmed = text.trim();
  return (
    /\b(run|start|launch|kick off)\b.*\b(search|builder search|talent search)\b/i.test(trimmed) ||
    /\b(find|show)\b.*\b(builders|candidates|matches)\b/i.test(trimmed) ||
    /\bready to search\b/i.test(trimmed)
  );
}

function agentAskedToRunSearch(text: string): boolean {
  return /\bwant me to run\b.*\bsearch\b/i.test(text) || /\bready\b.*\brun\b.*\bsearch\b/i.test(text);
}

function userConfirmedSearch(text: string): boolean {
  return /^(yes|yep|yeah|sure|do it|go ahead|run it|run search|run the search)$/i.test(text.trim());
}

function SearchQualityCard({ sq }: { sq: SearchQualityBlock }) {
  const strengthColor =
    sq.poolStrength === 'strong'
      ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
      : sq.poolStrength === 'medium'
        ? 'text-amber-400 border-amber-500/20 bg-amber-500/5'
        : 'text-red-400 border-red-500/20 bg-red-500/5';

  return (
    <div className={`rounded-xl border p-3 text-xs w-full ${strengthColor}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold uppercase tracking-wider text-[10px] opacity-70">
          Search Quality
        </span>
        <span className="font-bold capitalize">
          {sq.poolStrength} pool · {sq.confidence} confidence
        </span>
      </div>
      <div className="flex gap-4 mb-2 opacity-80">
        <span>{sq.strongCount} strong</span>
        <span>{sq.mediumCount} good</span>
        <span>{sq.totalRetrieved} total</span>
      </div>
      {sq.bottlenecks?.length > 0 ? (
        <p className="opacity-70 mb-1">Bottleneck: {sq.bottlenecks[0]}</p>
      ) : null}
    </div>
  );
}

export default function AdminScoutChat({
  scoutSessionId,
  opportunityId: initialOpportunityId,
  startFresh = false,
  onOpportunityChange,
  onSearchResults,
  onSearchStart,
  onSearchError,
  resetKey,
}: {
  scoutSessionId: string;
  opportunityId: string | null;
  startFresh?: boolean;
  onOpportunityChange: (id: string | null, brief: Record<string, unknown> | null) => void;
  onSearchResults: (candidates: AdminCandidate[], brief: Record<string, unknown> | null) => void;
  onSearchStart: () => void;
  onSearchError?: (message: string) => void;
  resetKey: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [opportunityId, setOpportunityId] = useState<string | null>(initialOpportunityId);
  const [currentBrief, setCurrentBrief] = useState<Record<string, unknown> | null>(null);
  const [toolCallLabel, setToolCallLabel] = useState<string | null>(null);
  const [pendingNewSearch, setPendingNewSearch] = useState(startFresh);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const initiatedRef = useRef(false);
  const lastResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    setMessages([]);
    setOpportunityId(initialOpportunityId);
    setCurrentBrief(null);
    setPendingNewSearch(startFresh);
    initiatedRef.current = false;
  }, [resetKey, initialOpportunityId, startFresh]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy]);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const full: ChatMessage = {
      ...msg,
      id: Math.random().toString(36).slice(2),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, full]);
    return full;
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<Pick<ChatMessage, 'text' | 'toolStatus'>>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const triggerSearch = useCallback(
    async (oppId: string) => {
      onSearchStart();
      setIsBusy(true);
      setToolCallLabel('Searching the builder graph...');
      const toolMsg = addMessage({
        role: 'tool',
        text: 'Scanning proof-of-work talent graph…',
        toolStatus: 'loading',
      });

      try {
        console.info('[admin-squad-ui] search:start', { opportunityId: oppId });
        const data = await fetchJsonWithTimeout('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'admin_scout_search',
            payload: { scoutSessionId, opportunityId: oppId },
          }),
        }, 60000);

        const candidates = (data.shortlist?.candidates || []) as AdminCandidate[];
        console.info('[admin-squad-ui] search:done', { opportunityId: oppId, candidates: candidates.length });
        onSearchResults(candidates, data.opportunity || currentBrief);
        updateMessage(toolMsg.id, {
          text:
            candidates.length > 0
              ? `Search finished · ${candidates.length} builder${candidates.length === 1 ? '' : 's'} found`
              : 'Search finished · no matches found',
          toolStatus: 'done',
        });
        addMessage({ role: 'agent', text: data.message || `Found ${candidates.length} builders.` });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Search failed';
        console.error('[admin-squad-ui] search:error', { opportunityId: oppId, message });
        updateMessage(toolMsg.id, { text: `Search failed · ${message}`, toolStatus: 'error' });
        addMessage({ role: 'agent', text: `Search failed: ${message}` });
        onSearchResults([], currentBrief);
        onSearchError?.(message);
      } finally {
        setIsBusy(false);
        setToolCallLabel(null);
      }
    },
    [
      scoutSessionId,
      addMessage,
      updateMessage,
      onSearchResults,
      onSearchStart,
      onSearchError,
      currentBrief,
    ]
  );

  const sendToAgent = useCallback(
    async (text: string, history: ChatMessage[]) => {
      const isInit = text === '__init__';
      const userWantsFresh = !isInit && isStartFreshIntent(text);
      const lastAgentMessage = [...history].reverse().find((m) => m.role === 'agent')?.text || '';
      const userAskedForSearch =
        !isInit &&
        (userExplicitlyRequestedSearch(text) ||
          (agentAskedToRunSearch(lastAgentMessage) && userConfirmedSearch(text)));
      if (userWantsFresh) {
        setOpportunityId(null);
        setCurrentBrief(null);
        setPendingNewSearch(true);
        onOpportunityChange(null, null);
      }

      const inNewSearchMode = pendingNewSearch && !opportunityId;
      const userText = isInit
        ? startFresh || !initialOpportunityId
          ? 'New admin scout search. Start a brand-new role brief — ignore previous searches unless I ask to continue one.'
          : 'Continue working on my existing role search. Help me refine the brief or review candidates.'
        : text;

      if (!isInit) addMessage({ role: 'user', text });

      setIsBusy(true);
      setToolCallLabel('Thinking...');

      const chatHistory = history
        .filter((m) => m.role === 'user' || m.role === 'agent')
        .map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.text }));

      if (isInit) chatHistory.push({ role: 'user', content: userText });

      try {
        console.info('[admin-squad-ui] chat:start', {
          opportunityId: inNewSearchMode || userWantsFresh ? null : opportunityId,
          startFresh: (isInit && startFresh) || inNewSearchMode || userWantsFresh,
          message: userText,
        });
        const data = await fetchJsonWithTimeout('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'admin_scout_chat',
            payload: {
              scoutSessionId,
              message: userText,
              opportunityId: inNewSearchMode || userWantsFresh ? null : opportunityId,
              startFresh: (isInit && startFresh) || inNewSearchMode || userWantsFresh,
              history: chatHistory.slice(-16),
            },
          }),
        }, 60000);
        const toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls as Array<{ name?: string; result?: Record<string, unknown> }> : [];
        console.info('[admin-squad-ui] chat:done', {
          opportunityId: (data.opportunity as Record<string, unknown> | undefined)?._id || null,
          toolCalls: toolCalls.map((tool) => tool.name),
        });

        const opp = data.opportunity as Record<string, unknown> | undefined;
        if (opp?._id) {
          const id = String(opp._id);
          setOpportunityId(id);
          setCurrentBrief(opp);
          setPendingNewSearch(false);
          onOpportunityChange(id, opp);
        }

        const rawMessage = String(data.message || '');
        const failedTool = toolCalls.find((tool) => tool.result?.error);
        if (toolCalls.length > 0) {
          addMessage({
            role: 'tool',
            text: `Tool${toolCalls.length === 1 ? '' : 's'} called · ${toolCalls.map((tool) => tool.name || 'unknown').join(', ')}`,
            toolStatus: failedTool ? 'error' : 'done',
          });
        }
        if (failedTool?.result?.error) {
          addMessage({
            role: 'agent',
            text: `Tool error: ${String(failedTool.result.error)}`,
          });
        }
        const uiBlocks = Array.isArray(data.uiBlocks) ? data.uiBlocks : [];
        const sqBlock = uiBlocks.find(
          (b: { type?: string }) => b.type === 'search_quality_report'
        ) as SearchQualityBlock | undefined;
        const talentPreviewBlock = uiBlocks.find(
          (b: { type?: string }) => b.type === 'talent_preview'
        );

        const parsed = parseAgentOptions(rawMessage);
        if (parsed && parsed.options.length >= 2) {
          if (parsed.message) addMessage({ role: 'agent', text: parsed.message });
          addMessage({
            role: 'agent',
            text: parsed.question,
            options: parsed.options,
            searchQuality: sqBlock ?? null,
          });
        } else {
          addMessage({ role: 'agent', text: rawMessage, searchQuality: sqBlock ?? null });
        }

        if ((sqBlock || talentPreviewBlock) && opp?._id) {
          onSearchStart();
          const toolMsg = addMessage({
            role: 'tool',
            text: 'Scanning proof-of-work talent graph…',
            toolStatus: 'loading',
          });
          try {
            console.info('[admin-squad-ui] load_shortlist:start', { opportunityId: String(opp._id) });
            const loadData = await fetchJsonWithTimeout('/api/agent/actions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'admin_scout_load_shortlist',
                payload: { scoutSessionId, opportunityId: String(opp._id) },
              }),
            }, 45000);
            const loaded = (loadData.shortlist?.candidates || []) as AdminCandidate[];
            console.info('[admin-squad-ui] load_shortlist:done', { opportunityId: String(opp._id), candidates: loaded.length });
            onSearchResults(loaded, opp);
            updateMessage(toolMsg.id, {
              text:
                loaded.length > 0
                  ? `Search finished · ${loaded.length} builder${loaded.length === 1 ? '' : 's'} found`
                  : 'Search finished · no matches found',
              toolStatus: 'done',
            });
          } catch (loadErr: unknown) {
            const message = loadErr instanceof Error ? loadErr.message : 'Could not load results';
            console.error('[admin-squad-ui] load_shortlist:error', { opportunityId: String(opp._id), message });
            updateMessage(toolMsg.id, { text: `Search failed · ${message}`, toolStatus: 'error' });
            onSearchResults([], opp);
            onSearchError?.(message);
          }
        }

        if (!sqBlock && opp && canRunPreviewAnyway(opp) && userAskedForSearch) {
          await triggerSearch(String(opp._id));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown error';
        console.error('[admin-squad-ui] chat:error', { message });
        addMessage({ role: 'agent', text: `Something went wrong: ${message}. Try again.` });
        onSearchError?.(message);
      } finally {
        setIsBusy(false);
        setToolCallLabel(null);
      }
    },
    [scoutSessionId, opportunityId, pendingNewSearch, startFresh, initialOpportunityId, addMessage, updateMessage, onOpportunityChange, onSearchResults, onSearchStart, onSearchError, triggerSearch]
  );

  useEffect(() => {
    if (initiatedRef.current || !scoutSessionId) return;
    initiatedRef.current = true;
    sendToAgent('__init__', []);
  }, [sendToAgent, scoutSessionId, resetKey]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isBusy) return;
    setInputText('');
    sendToAgent(text, messages);
  };

  const handleOptionClick = (option: AgentOption) => {
    sendToAgent(option.value, messages);
  };

  const lastOptionsMessage = [...messages].reverse().find((m) => m.options && m.options.length > 0);
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const showOptionCard =
    lastOptionsMessage &&
    !isBusy &&
    (!lastUserMessage || lastOptionsMessage.timestamp >= lastUserMessage.timestamp);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Admin Squad</h2>
          <p className="text-xs text-white/40 mt-0.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fa7d22] animate-pulse" />
            {currentBrief?.roleTitle && currentBrief.roleTitle !== 'New role'
              ? `${String(currentBrief.roleTitle)} · ${String(currentBrief.company || 'Draft')}`
              : 'Founder agent test chat'}
          </p>
        </div>
        {currentBrief?._id && canRunPreviewAnyway(currentBrief) ? (
          <button
            type="button"
            onClick={() => triggerSearch(String(currentBrief._id))}
            disabled={isBusy}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#fa7d22] text-black font-medium hover:bg-[#ff9b4e] disabled:opacity-40"
          >
            Run search
          </button>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4 space-y-4">
        {messages.map((msg) => {
          if (msg.role === 'tool') {
            const isLoading = msg.toolStatus === 'loading';
            const isDone = msg.toolStatus === 'done';
            const isError = msg.toolStatus === 'error';
            return (
              <div
                key={msg.id}
                className={`flex items-center gap-2 text-xs ${
                  isDone ? 'text-emerald-400/85' : isError ? 'text-red-400/85' : 'text-white/30'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                ) : isDone ? (
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                ) : isError ? (
                  <XCircle className="w-3 h-3 shrink-0" />
                ) : null}
                <span>{msg.text}</span>
              </div>
            );
          }

          const isAgent = msg.role === 'agent';
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
                <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              ) : (
                <div className="max-w-[85%] px-3 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-medium">
                  {msg.text}
                </div>
              )}
              {isAgent && msg.searchQuality ? <SearchQualityCard sq={msg.searchQuality} /> : null}
            </div>
          );
        })}

        {isBusy ? (
          <div className="flex items-center gap-2 text-white/30 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#fa7d22]" />
            <span>{toolCallLabel || 'Thinking...'}</span>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      {showOptionCard && lastOptionsMessage ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-[#111114] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/[0.06] text-sm font-medium text-white">
            {lastOptionsMessage.text || 'Choose one'}
          </div>
          <div className="divide-y divide-white/[0.05]">
            {lastOptionsMessage.options!.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleOptionClick(opt)}
                disabled={isBusy}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.04] disabled:opacity-40"
              >
                <span className="text-sm text-white/80">{opt.label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-white/25" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              disabled={isBusy}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/[0.04] disabled:opacity-40"
            >
              <Pencil className="w-3.5 h-3.5 text-white/25" />
              <span className="text-sm text-white/40 italic">Something else</span>
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-end gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5">
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Describe the role, stack, or who you need…"
          rows={1}
          disabled={isBusy}
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 resize-none outline-none disabled:opacity-40"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputText.trim() || isBusy}
          className="w-8 h-8 rounded-lg bg-[#fa7d22] text-black flex items-center justify-center disabled:opacity-30"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
