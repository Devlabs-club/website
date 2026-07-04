import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { AuthProvider, useAuth } from "@/components/auth_manager";
import { FounderRail } from "@/components/founder/FounderRail";
import { FounderUpgradeModal } from "@/components/founder/FounderUpgradeModal";
import type { PlanId } from "@/components/founder/FounderBillingCard";

type Thread = {
  _id: string;
  opportunityId: string;
  builderId: string;
  founderEmail: string;
  founderName?: string | null;
  builderName?: string | null;
  roleTitle?: string | null;
  company?: string | null;
  introStatus?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  unreadCount?: number;
};

type Message = {
  _id: string;
  threadId: string;
  senderType: "founder" | "builder" | "system";
  body: string;
  readAt?: string | null;
  createdAt: string;
};

type IntroRequest = {
  _id: string;
  status?: string | null;
  introMessage?: string | null;
  founderName?: string | null;
};

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusLabel(status?: string | null) {
  switch (status) {
    case "builder_accepted":
      return "Accepted";
    case "builder_declined":
      return "Declined";
    case "requested":
      return "Intro sent";
    default:
      return status ? status.replace(/_/g, " ") : "Conversation";
  }
}

async function callAgentAction(action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch("/api/agent/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

const FounderConversationsInner: React.FC = () => {
  const { user, logout } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [introRequest, setIntroRequest] = useState<IntroRequest | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; upgradeTarget: PlanId; reason?: string }>({
    open: false,
    upgradeTarget: "growth",
  });
  const endRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const selected = useMemo(() => threads.find((thread) => thread._id === selectedId) || null, [threads, selectedId]);
  const initial = (user?.name || user?.email || "F").trim().charAt(0).toUpperCase();

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadThreads = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingThreads(true);
    setError("");
    const { data } = await callAgentAction("get_founder_threads");
    if (data.success) {
      const nextThreads = Array.isArray(data.threads) ? data.threads : [];
      setThreads(nextThreads);
      setSelectedId((current) => {
        if (current && nextThreads.some((thread: Thread) => thread._id === current)) return current;
        const requestedId = new URLSearchParams(window.location.search).get("threadId");
        return nextThreads.find((thread: Thread) => thread._id === requestedId)?._id || nextThreads[0]?._id || null;
      });
    } else {
      setError(data.error || "Could not load conversations.");
    }
    if (showLoading) setLoadingThreads(false);
  }, []);

  const loadMessages = useCallback(async (threadId: string, showLoading = false) => {
    if (showLoading) setLoadingMessages(true);
    setError("");
    const { data } = await callAgentAction("get_thread_messages", { threadId });
    if (data.success) {
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setIntroRequest(data.introRequest || null);
      setThreads((prev) => prev.map((thread) => (thread._id === threadId ? { ...thread, unreadCount: 0 } : thread)));
    } else {
      setError(data.error || "Could not load this conversation.");
    }
    if (showLoading) setLoadingMessages(false);
  }, []);

  useEffect(() => {
    void loadThreads(true);
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setIntroRequest(null);
      return;
    }
    void loadMessages(selectedId, true);
  }, [loadMessages, selectedId]);

  useEffect(() => {
    const refresh = () => {
      void loadThreads(false);
      const current = selectedIdRef.current;
      if (current) void loadMessages(current, false);
    };

    const poll = window.setInterval(refresh, 5000);
    const events = new EventSource("/api/talent/realtime");
    events.addEventListener("change", refresh);
    events.onerror = () => {
      events.close();
    };

    return () => {
      window.clearInterval(poll);
      events.close();
    };
  }, [loadMessages, loadThreads]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, selectedId]);

  const sendMessage = async () => {
    if (!selectedId || !body.trim() || sending) return;
    const messageBody = body.trim();
    setBody("");
    setSending(true);
    const { res, data } = await callAgentAction("send_message", { threadId: selectedId, body: messageBody });
    if (data.success && data.messageDoc) {
      setMessages((prev) => [...prev, data.messageDoc]);
      setThreads((prev) =>
        prev.map((thread) =>
          thread._id === selectedId
            ? { ...thread, lastMessagePreview: messageBody, lastMessageAt: data.messageDoc.createdAt || new Date().toISOString() }
            : thread
        )
      );
    } else if (res.status === 402 && data.upgradeTarget) {
      setUpgradeModal({ open: true, upgradeTarget: data.upgradeTarget, reason: data.error });
      setBody(messageBody);
    } else {
      setError(data.error || "Could not send the message.");
      setBody(messageBody);
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f4f3] text-foreground">
      <div className="flex min-h-screen">
        <FounderRail onLogout={logout} initial={initial} active="conversations" />
        <main className="flex min-w-0 flex-1 flex-col p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold tracking-tight text-black">Conversations</p>
              <p className="mt-1 text-sm text-black/45">Message builders after intros, trials, and hiring decisions.</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-4">
            <aside className="min-h-0 overflow-hidden rounded-[28px] border border-[#ece7e1] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05),0_18px_45px_rgba(16,24,40,0.08)]">
              <div className="border-b border-[#ece7e1] px-5 py-4">
                <p className="text-sm font-semibold text-black">Builders</p>
                <p className="mt-1 text-xs text-black/40">{threads.length} active threads</p>
              </div>
              <div className="h-[calc(100vh-178px)] overflow-y-auto p-2">
                {loadingThreads ? (
                  <div className="flex h-40 items-center justify-center text-black/40">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : threads.length === 0 ? (
                  <div className="m-3 rounded-2xl border border-dashed border-[#ece7e1] bg-[#fffcfa] p-5 text-sm text-black/45">
                    Intro conversations will appear here after you invite builders.
                  </div>
                ) : (
                  threads.map((thread) => (
                    <button
                      key={thread._id}
                      type="button"
                      onClick={() => setSelectedId(thread._id)}
                      className={
                        selectedId === thread._id
                          ? "mb-2 w-full rounded-2xl border border-[#ece7e1] bg-[#fdfaf7] p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                          : "mb-2 w-full rounded-2xl border border-transparent p-4 text-left transition hover:border-[#ece7e1] hover:bg-[#fffcfa]"
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-black">{thread.builderName || "Builder"}</p>
                          <p className="mt-1 truncate text-xs text-black/45">
                            {thread.roleTitle || "Role"} {thread.company ? `at ${thread.company}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {thread.unreadCount ? (
                            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#ec9149] px-1.5 text-[10px] font-bold leading-none text-white">
                              {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                            </span>
                          ) : null}
                          <span className="text-xs text-black/35">{timeAgo(thread.lastMessageAt)}</span>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-5 text-black/55">
                        {thread.lastMessagePreview || "No messages yet."}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <section className="min-h-0 overflow-hidden rounded-[28px] border border-[#ece7e1] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05),0_18px_45px_rgba(16,24,40,0.08)]">
              {selected ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex items-center justify-between border-b border-[#ece7e1] px-6 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-black">{selected.builderName || "Builder"}</p>
                      <p className="mt-1 truncate text-xs text-black/45">
                        {selected.roleTitle || "Role"} {selected.company ? `at ${selected.company}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full border border-[#ece7e1] bg-[#fffcfa] px-3 py-1 text-xs font-medium text-black/55">
                      {statusLabel(introRequest?.status || selected.introStatus)}
                    </span>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto bg-[#fdfaf7] px-6 py-5">
                    {loadingMessages ? (
                      <div className="flex h-full items-center justify-center text-black/40">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="rounded-2xl border border-dashed border-[#ece7e1] bg-white px-6 py-5 text-center text-sm text-black/45">
                          <MessageCircle className="mx-auto mb-3 h-5 w-5 text-[#ec9149]" />
                          No messages in this conversation yet.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((message) => {
                          const fromFounder = message.senderType === "founder";
                          const isSystem = message.senderType === "system";
                          return (
                            <div key={message._id} className={fromFounder ? "flex justify-end" : "flex justify-start"}>
                              <div
                                className={
                                  isSystem
                                    ? "max-w-[78%] rounded-xl border border-[#ece7e1] bg-white px-3 py-2 text-xs text-black/45"
                                    : fromFounder
                                      ? "max-w-[78%] rounded-2xl bg-[#ec9149] px-4 py-3 text-sm leading-6 text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]"
                                      : "max-w-[78%] rounded-2xl border border-[#ece7e1] bg-white px-4 py-3 text-sm leading-6 text-black shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                                }
                              >
                                {message.body}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={endRef} />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[#ece7e1] bg-white p-4">
                    <div className="flex items-end gap-3 rounded-2xl border border-[#ece7e1] bg-[#fffcfa] p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                      <textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        rows={2}
                        placeholder="Write a message to the builder..."
                        className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-black outline-none placeholder:text-black/35"
                      />
                      <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={sending || !body.trim()}
                        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#ec9149] px-4 text-sm font-semibold text-white hover:bg-[#dd7f36] disabled:opacity-50"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center bg-[#fdfaf7]">
                  <div className="rounded-2xl border border-dashed border-[#ece7e1] bg-white px-6 py-5 text-center text-sm text-black/45">
                    Select a builder conversation.
                  </div>
                </div>
              )}
            </section>
          </section>
        </main>
      </div>
      <FounderUpgradeModal
        open={upgradeModal.open}
        onClose={() => setUpgradeModal((prev) => ({ ...prev, open: false }))}
        upgradeTarget={upgradeModal.upgradeTarget}
        reason={upgradeModal.reason}
      />
    </div>
  );
};

const FounderConversationsPage: React.FC = () => (
  <AuthProvider>
    <FounderConversationsInner />
  </AuthProvider>
);

export default FounderConversationsPage;
