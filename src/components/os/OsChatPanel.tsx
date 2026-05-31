import React from 'react';
import ChatMarkdown from '@/components/ChatMarkdown';
import { cn } from '@/lib/utils';
import { LoaderFive } from '@/components/ui/loader';

export type OsChatMessage = { sender: 'agent' | 'user'; text: string };

export default function OsChatPanel({
  messages,
  busy,
  busyLabel = 'Thinking…',
  endRef,
  className,
}: {
  messages: OsChatMessage[];
  busy?: boolean;
  busyLabel?: string;
  endRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex-1 min-h-[400px] overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-b from-black/40 to-black/60 backdrop-blur-xl p-4 space-y-4 shadow-inner custom-scrollbar',
        className
      )}
    >
      {messages.map((message, index) => (
        <div key={`${message.sender}-${index}`} className={`flex animate-fade-in ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={cn(
              'max-w-[85%] rounded-2xl px-5 py-3 text-base leading-relaxed',
              message.sender === 'agent'
                ? 'bg-white/10 text-white border border-white/5 shadow-sm'
                : 'bg-gradient-to-br from-[#fa7d22] to-[#ff9b4e] text-black font-medium shadow-[0_4px_15px_rgba(250,125,34,0.2)]'
            )}
          >
            {message.sender === 'agent' ? (
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5">
                <ChatMarkdown text={message.text} />
              </div>
            ) : (
              message.text
            )}
          </div>
        </div>
      ))}

      {busy ? (
        <div className="flex justify-start animate-fade-in">
          <div className="rounded-2xl px-5 py-4 bg-gradient-to-r from-[#fa7d22]/10 via-purple-500/10 to-blue-500/10 border border-white/10 text-white/70 text-sm flex items-center gap-3">
            <LoaderFive text="Thinking" />
          </div>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
