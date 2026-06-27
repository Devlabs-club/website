import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2, Check, X } from 'lucide-react';

type Thread = {
  _id: string;
  roleTitle?: string;
  company?: string;
  builderName?: string;
  founderName?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string | null;
  introRequestId?: string | null;
  introStatus?: string | null;
};

type ChatMessage = {
  _id: string;
  senderType: 'founder' | 'builder' | 'system';
  body: string;
  createdAt: string;
};

type IntroRequestInfo = {
  _id: string;
  status: string;
  introMessage?: string;
  viewedAt?: string | null;
  founderName?: string | null;
};

export default function MessagesPanel({
  viewer,
  initialThreadId,
  initialIntroRequestId,
  onIntroResponded,
}: {
  viewer: 'builder' | 'founder';
  initialThreadId?: string | null;
  initialIntroRequestId?: string | null;
  onIntroResponded?: () => void;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [introRequest, setIntroRequest] = useState<IntroRequestInfo | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [introBusy, setIntroBusy] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const viewedIntroRef = useRef<string | null>(null);

  const loadThreads = async () => {
    const action = viewer === 'builder' ? 'get_builder_threads' : 'get_founder_threads';
    const res = await fetch('/api/agent/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.threads)) {
      setThreads(data.threads);
      if (initialIntroRequestId) {
        const match = data.threads.find(
          (t: Thread) => t.introRequestId === initialIntroRequestId
        );
        if (match) setActiveThreadId(match._id);
      } else if (!activeThreadId && data.threads.length > 0) {
        setActiveThreadId(initialThreadId || data.threads[0]._id);
      }
    }
  };

  const loadMessages = async (threadId: string) => {
    const res = await fetch('/api/agent/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'get_thread_messages', payload: { threadId } }),
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.messages)) {
      setMessages(data.messages);
      setIntroRequest(data.introRequest || null);
      setShowDecline(false);
      setDeclineReason('');
      setIntroError(null);
    }
  };

  const markIntroViewed = async (introRequestId: string) => {
    if (viewer !== 'builder' || viewedIntroRef.current === introRequestId) return;
    viewedIntroRef.current = introRequestId;
    await fetch('/api/agent/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        action: 'respond_intro',
        payload: { introRequestId, response: 'view' },
      }),
    });
  };

  const respondIntro = async (response: 'accept' | 'decline') => {
    if (!introRequest?._id || introBusy) return;
    setIntroBusy(true);
    setIntroError(null);
    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'respond_intro',
          payload: {
            introRequestId: introRequest._id,
            response,
            declineReason: response === 'decline' ? declineReason.trim() || undefined : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not update intro');
      setShowDecline(false);
      setDeclineReason('');
      if (activeThreadId) await loadMessages(activeThreadId);
      await loadThreads();
      onIntroResponded?.();
    } catch (e) {
      setIntroError(e instanceof Error ? e.message : 'Could not update intro');
    } finally {
      setIntroBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadThreads();
      setLoading(false);
    })();
  }, [viewer]);

  useEffect(() => {
    if (activeThreadId) loadMessages(activeThreadId);
  }, [activeThreadId]);

  useEffect(() => {
    if (
      viewer === 'builder' &&
      introRequest?._id &&
      introRequest.status === 'requested' &&
      !introRequest.viewedAt
    ) {
      void markIntroViewed(introRequest._id);
    }
  }, [introRequest?._id, introRequest?.status, introRequest?.viewedAt, viewer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, introRequest]);

  const sendMessage = async () => {
    const body = input.trim();
    if (!body || !activeThreadId || sending) return;
    setSending(true);
    setInput('');
    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'send_message',
          payload: { threadId: activeThreadId, body },
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadMessages(activeThreadId);
        await loadThreads();
      }
    } finally {
      setSending(false);
    }
  };

  const activeThread = threads.find((t) => t._id === activeThreadId);
  const pendingIntro =
    viewer === 'builder' && introRequest?.status === 'requested';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-white/50">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading messages...
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4 min-h-[520px]">
      <aside className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#fa7d22]" />
          <span className="text-sm font-semibold text-white">Conversations</span>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-white/45">
              No messages yet. When a founder requests an intro, it will appear here.
            </p>
          ) : (
            threads.map((thread) => (
              <button
                key={thread._id}
                type="button"
                onClick={() => setActiveThreadId(thread._id)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 transition ${
                  activeThreadId === thread._id ? 'bg-[#fa7d22]/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white truncate">
                    {viewer === 'founder' ? thread.builderName : thread.founderName || 'Founder'}
                  </p>
                  {thread.introStatus === 'requested' ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#ffb580] border border-[#fa7d22]/30 px-1.5 py-0.5 rounded-full">
                      Intro
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-[#fa7d22] truncate">
                  {thread.roleTitle}
                  {thread.company ? ` · ${thread.company}` : ''}
                </p>
                {thread.lastMessagePreview ? (
                  <p className="text-xs text-white/45 truncate mt-1">{thread.lastMessagePreview}</p>
                ) : null}
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col overflow-hidden">
        {activeThread ? (
          <>
            <div className="px-5 py-4 border-b border-white/10">
              <h3 className="font-semibold text-white">
                {viewer === 'founder' ? activeThread.builderName : activeThread.founderName || 'Founder'}
              </h3>
              <p className="text-xs text-white/50">
                {activeThread.roleTitle}
                {activeThread.company ? ` @ ${activeThread.company}` : ''}
              </p>
            </div>

            {pendingIntro ? (
              <div className="mx-5 mt-4 rounded-2xl border border-[#fa7d22]/30 bg-[#fa7d22]/10 p-4">
                <p className="text-sm font-semibold text-white mb-1">Intro request — action required</p>
                <p className="text-sm text-white/75 mb-4">
                  {introRequest.founderName || activeThread.founderName || 'This founder'} invited you to
                  discuss {activeThread.roleTitle}. Accept to move forward; the founder can then schedule a call.
                </p>
                {introError ? <p className="text-sm text-amber-300 mb-3">{introError}</p> : null}
                {showDecline ? (
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Optional reason for declining…"
                    rows={2}
                    className="w-full mb-3 rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white resize-none"
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={introBusy}
                    onClick={() => respondIntro('accept')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold hover:bg-[#ff9b4e] disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    Accept intro
                  </button>
                  {showDecline ? (
                    <button
                      type="button"
                      disabled={introBusy}
                      onClick={() => respondIntro('decline')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-400/40 text-red-300 text-sm hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Confirm decline
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={introBusy}
                      onClick={() => setShowDecline(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 text-white/70 text-sm hover:bg-white/5 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Decline
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {introRequest?.status === 'builder_accepted' ? (
              <div className="mx-5 mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                You accepted this intro. Check the Calls tab when the founder schedules a meeting.
              </div>
            ) : null}

            {introRequest?.status === 'builder_declined' ? (
              <div className="mx-5 mt-4 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/60">
                You declined this intro request.
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[380px]">
              {messages.map((msg) => {
                const isMine =
                  (viewer === 'founder' && msg.senderType === 'founder') ||
                  (viewer === 'builder' && msg.senderType === 'builder');
                const isSystem = msg.senderType === 'system';
                return (
                  <div
                    key={msg._id}
                    className={`flex ${isSystem ? 'justify-center' : isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        isSystem
                          ? 'bg-white/5 text-white/50 border border-white/10 text-xs'
                          : isMine
                            ? 'bg-[#fa7d22] text-black'
                            : 'bg-white/10 text-white border border-white/10'
                      }`}
                    >
                      {msg.body}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div className="p-4 border-t border-white/10 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 rounded-xl bg-[#0e1012] border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#fa7d22]/40"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#fa7d22] text-black font-semibold disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-white/45 text-sm p-8">
            Select a conversation to start messaging.
          </div>
        )}
      </section>
    </div>
  );
}
