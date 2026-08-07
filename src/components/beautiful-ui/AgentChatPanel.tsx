"use client";

import React, { useEffect, useRef } from "react";
import ChatMarkdown from "@/components/ChatMarkdown";
import { ThinkingState } from "@/components/beautiful-ui/ThinkingState";
import "@/components/beautiful-ui/agent.css";

/**
 * Adapted from Beautiful UI ChatComposer
 * https://beautiful-ui-five.vercel.app/
 */

export type AgentChatMessage = {
  role: "founder" | "assistant";
  content: string;
};

type AgentChatPanelProps = {
  title?: string;
  subtitle?: string;
  messages: AgentChatMessage[];
  loading?: boolean;
  sending?: boolean;
  thinkingSteps?: string[];
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  endRef?: React.RefObject<HTMLDivElement | null>;
  loadingFallback?: React.ReactNode;
  className?: string;
};

function AssistantReply({ content }: { content: string }) {
  return (
    <div
      className="flex w-full gap-2.5"
      style={{ animation: "bui-fade-up 400ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#050505] text-white"
        aria-hidden
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1 prose prose-sm prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 max-w-none text-[15px] leading-[1.5] text-[var(--bui-ink)] prose-headings:my-2 prose-headings:text-[15px] prose-headings:text-[var(--bui-ink)] prose-strong:text-[var(--bui-ink)] prose-a:text-[#b55f1b]">
        <ChatMarkdown text={content} />
      </div>
    </div>
  );
}

export function AgentChatPanel({
  title = "Agent Conversation",
  subtitle,
  messages,
  loading = false,
  sending = false,
  thinkingSteps = [],
  value,
  onChange,
  onSend,
  placeholder = "Suggest changes…",
  endRef,
  loadingFallback,
  className = "",
}: AgentChatPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const canSend = value.trim().length > 0 && !sending && !loading;

  const setBottomNode = (node: HTMLDivElement | null) => {
    bottomRef.current = node;
    if (endRef && "current" in endRef) {
      (endRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    if (!sending && !loading) inputRef.current?.focus();
  }, [sending, loading]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollToBottom(loading ? "auto" : "smooth");
  }, [messages, sending, loading, thinkingSteps]);

  return (
    <div
      className={`bui-agent flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--bui-line)] bg-[var(--bui-surface)] shadow-[0_1px_3px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.04)] ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--bui-line)] p-1.5 pl-2.5">
        <div className="min-w-0 px-1.5 py-1.5">
          <p className="truncate text-[15px] font-semibold text-[var(--bui-ink)]">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[13px] text-[var(--bui-ink-3)]">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          stickToBottomRef.current = distanceFromBottom < 80;
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-1"
      >
        {loading ? (
          loadingFallback
        ) : (
          <>
            {messages.map((item, index) =>
              item.role === "founder" ? (
                <div key={index} className="flex justify-end pl-14">
                  <div className="rounded-xl bg-[var(--bui-field)] px-3 py-2 text-[15px] leading-[1.45] text-[var(--bui-ink)]">
                    {item.content}
                  </div>
                </div>
              ) : (
                <AssistantReply key={index} content={item.content} />
              )
            )}
            {sending ? <ThinkingState steps={thinkingSteps} active /> : null}
          </>
        )}
        <div ref={setBottomNode} />
      </div>

      <div className="mt-auto shrink-0 p-1.5">
        <div
          role="presentation"
          onClick={() => inputRef.current?.focus()}
          className="flex cursor-text flex-col gap-2 rounded-xl border border-[var(--bui-line)] bg-[var(--bui-field)] p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.035)] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--bui-line-strong)] focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSend) {
                stickToBottomRef.current = true;
                onSend();
              }
            }}
            disabled={sending || loading}
            placeholder={placeholder}
            aria-label="Chat prompt"
            className="min-h-[20px] w-full appearance-none border-0 bg-transparent text-[15px] leading-[1.45] text-[var(--bui-ink)] shadow-none outline-none ring-0 placeholder:text-[var(--bui-ink-3)] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:opacity-60"
            style={{ border: "none", outline: "none", boxShadow: "none" }}
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              aria-label="Send"
              disabled={!canSend}
              onClick={() => {
                stickToBottomRef.current = true;
                onSend();
              }}
              className="flex size-7 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.96] disabled:opacity-70"
              style={{
                background: canSend ? "var(--bui-brand)" : "var(--bui-line-strong)",
                color: canSend ? "var(--bui-brand-ink)" : "var(--bui-ink-2)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentChatPanel;
