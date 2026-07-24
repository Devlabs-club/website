import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Briefcase, Loader2, Plus, Send } from 'lucide-react';
import ChatMarkdown from '@/components/ChatMarkdown';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'founder';
  content: string;
};

type FounderJob = {
  id: string;
  _id: string;
  title?: string;
  roleTitle?: string;
  company?: string;
  status?: string;
};

type FounderSession = {
  id: string;
  _id: string;
  jobId?: string | null;
  title?: string;
};

interface FounderRoleIntakeChatProps {
  opportunityId: string | null;
  onClose: () => void;
  onSearchCompleted: (opportunityId: string) => void;
  enrichedOnboarding?: boolean;
}

const introMessage: ChatMessage = {
  id: 'intro',
  role: 'assistant',
  content: 'Cool, what kind of builder are we hiring?',
};

function normalizeMessage(message: any): ChatMessage {
  return {
    id: String(message.id || message._id || Math.random().toString(36).slice(2)),
    role: message.role === 'founder' || message.role === 'user' ? 'founder' : 'assistant',
    content: String(message.content || message.text || ''),
  };
}

export default function FounderRoleIntakeChat({
  opportunityId: initialOpportunityId,
  onClose,
  onSearchCompleted,
}: FounderRoleIntakeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([introMessage]);
  const [jobs, setJobs] = useState<FounderJob[]>([]);
  const [sessions, setSessions] = useState<FounderSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(initialOpportunityId);
  const [currentJob, setCurrentJob] = useState<FounderJob | null>(null);
  const [inputText, setInputText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [loadingState, setLoadingState] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy]);

  const loadJobs = useCallback(async () => {
    const response = await fetch('/api/founder-agent/jobs', { credentials: 'include' });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load jobs');
    setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    return data;
  }, []);

  const loadChatState = useCallback(async (params: { sessionId?: string | null; jobId?: string | null }) => {
    const query = new URLSearchParams();
    if (params.sessionId) query.set('sessionId', params.sessionId);
    if (params.jobId) query.set('jobId', params.jobId);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await fetch(`/api/founder-agent/chat${suffix}`, { credentials: 'include' });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load chat');
    setSessionId(data.session?.id || null);
    setJobId(data.job?.id || data.session?.jobId || params.jobId || null);
    setCurrentJob(data.job || null);
    const history = Array.isArray(data.history) ? data.history.map(normalizeMessage) : [];
    setMessages(history.length ? history : [introMessage]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingState(true);
      setError(null);
      try {
        await loadJobs();
        if (!cancelled && initialOpportunityId) {
          await loadChatState({ jobId: initialOpportunityId });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load founder agent');
      } finally {
        if (!cancelled) setLoadingState(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialOpportunityId, loadChatState, loadJobs]);

  const startNewHire = () => {
    setSessionId(null);
    setJobId(null);
    setCurrentJob(null);
    setMessages([introMessage]);
    setInputText('');
    inputRef.current?.focus();
  };

  const openJobChat = async (nextJobId: string) => {
    setLoadingState(true);
    setError(null);
    try {
      await loadChatState({ jobId: nextJobId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open chat');
    } finally {
      setLoadingState(false);
    }
  };

  const openSessionChat = async (nextSessionId: string) => {
    setLoadingState(true);
    setError(null);
    try {
      await loadChatState({ sessionId: nextSessionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open chat');
    } finally {
      setLoadingState(false);
    }
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isBusy) return;
    const founderMessage: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'founder',
      content: text,
    };
    setMessages((prev) => [...prev, founderMessage]);
    setInputText('');
    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/founder-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId, jobId, message: text }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Agent failed');

      setSessionId(data.session?.id || sessionId);
      setJobId(data.job?.id || data.session?.jobId || jobId);
      setCurrentJob(data.job || currentJob);
      const history = Array.isArray(data.history) ? data.history.map(normalizeMessage) : [];
      setMessages(history.length ? history : [...messages, founderMessage, normalizeMessage({ role: 'assistant', content: data.message })]);
      await loadJobs();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong. Try again.',
        },
      ]);
    } finally {
      setIsBusy(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-[#0c0c0e] text-white">
      <aside className="hidden md:flex w-72 shrink-0 flex-col border-r border-white/[0.08] bg-black/20">
        <div className="p-4 border-b border-white/[0.08]">
          <button
            type="button"
            onClick={startNewHire}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#fa7d22] px-3 py-2 text-sm font-semibold text-black hover:bg-[#ff9b4e] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New hire
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {sessions.filter((session) => !session.jobId).map((session) => {
            const active = String(session.id || session._id) === sessionId;
            return (
              <button
                key={session.id || session._id}
                type="button"
                onClick={() => openSessionChat(String(session.id || session._id))}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                  active ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 shrink-0 text-[#ffb580]" />
                  <span className="truncate text-sm font-medium">{session.title || 'New hire'}</span>
                </div>
                <p className="mt-1 truncate pl-6 text-xs text-white/35">Draft chat</p>
              </button>
            );
          })}
          {jobs.map((job) => {
            const active = String(job.id || job._id) === jobId;
            return (
              <button
                key={job.id || job._id}
                type="button"
                onClick={() => openJobChat(String(job.id || job._id))}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                  active ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 shrink-0 text-[#ffb580]" />
                  <span className="truncate text-sm font-medium">{job.title || job.roleTitle || 'Untitled role'}</span>
                </div>
                <p className="mt-1 truncate pl-6 text-xs text-white/35">
                  {job.company || job.status || 'Draft'}
                </p>
              </button>
            );
          })}
          {!jobs.length && !loadingState ? (
            <p className="px-2 py-4 text-xs text-white/35">No roles yet.</p>
          ) : null}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 md:px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 text-sm font-medium text-white/45 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold text-white">
              {currentJob?.title || currentJob?.roleTitle || 'New hire'}
            </p>
            <p className="text-[11px] uppercase tracking-widest text-white/30">Founder agent</p>
          </div>
          {currentJob?.id ? (
            <button
              type="button"
              onClick={() => onSearchCompleted(currentJob.id)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              Workspace
            </button>
          ) : (
            <div className="w-20" />
          )}
        </div>

        {error ? (
          <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
            {loadingState ? (
              <div className="flex items-center gap-2 text-sm text-white/40">
                <Loader2 className="w-4 h-4 animate-spin text-[#fa7d22]" />
                Loading chat...
              </div>
            ) : (
              messages.map((message) => {
                const isFounder = message.role === 'founder';
                return (
                  <div key={message.id} className={`flex ${isFounder ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        isFounder
                          ? 'bg-[#fa7d22] text-black font-medium'
                          : 'prose prose-invert prose-sm prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 max-w-[82%] bg-white/[0.05] text-white/85 border border-white/[0.06]'
                      }`}
                    >
                      {isFounder ? (
                        <span className="whitespace-pre-wrap">{message.content}</span>
                      ) : (
                        <ChatMarkdown text={message.content} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {isBusy ? (
              <div className="flex items-center gap-2 text-xs text-white/35">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#fa7d22]" />
                Working on it...
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-white/[0.08] px-4 py-4">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 focus-within:border-white/25">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tell me what you need for this role..."
                rows={1}
                disabled={isBusy || loadingState}
                className="min-h-6 max-h-32 flex-1 resize-none bg-transparent text-sm leading-relaxed text-white outline-none placeholder:text-white/25 disabled:opacity-40"
                onInput={(event) => {
                  const target = event.currentTarget;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                }}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!inputText.trim() || isBusy || loadingState}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fa7d22] text-black transition-colors hover:bg-[#ff9b4e] disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-white/20">Enter to send. Shift+Enter for a new line.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
