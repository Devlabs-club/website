import React, { useMemo, useState } from 'react';

type Message = { sender: 'agent' | 'user'; text: string };

type ActionOption = {
  label: string;
  action: string;
  placeholder: string;
};

function buildPayload(action: string, input: string) {
  const value = input.trim();

  if (action === 'claim_profile') {
    return { claimConfirmed: true, note: value || null };
  }

  if (action === 'update_availability') {
    const [available, hours, comp, mode] = value.split('|').map((part) => part.trim());
    return {
      availableNow: ['true', 'yes', 'available', 'open'].includes((available || '').toLowerCase()),
      hoursPerWeek: Number(hours) || null,
      desiredCompensation: comp || null,
      remotePreference: mode || 'unspecified',
    };
  }

  if (action === 'create_role_brief') {
    const [company, roleTitle, startupSummary, skills, budget, timeline, workType] = value
      .split('|')
      .map((part) => part.trim());
    return {
      company,
      roleTitle,
      startupSummary,
      skillsNeeded: (skills || '').split(',').map((skill) => skill.trim()).filter(Boolean),
      budget,
      timeline,
      workType,
    };
  }

  if (action === 'run_candidate_search') {
    return { opportunityId: value };
  }

  return { input: value };
}

export default function ConversationalShell({
  title,
  subtitle,
  options,
}: {
  title: string;
  subtitle: string;
  options: ActionOption[];
}) {
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'agent', text: subtitle },
  ]);
  const [selectedAction, setSelectedAction] = useState(options[0]?.action || '');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<any[]>([]);

  const activeOption = useMemo(() => options.find((option) => option.action === selectedAction) || options[0], [options, selectedAction]);

  const handleSend = async () => {
    if (!input.trim() || !activeOption) return;
    const userMessage = input.trim();
    setMessages((prev) => [...prev, { sender: 'user', text: userMessage }]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: activeOption.action, payload: buildPayload(activeOption.action, userMessage) }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Action failed');

      setMessages((prev) => [...prev, { sender: 'agent', text: data.message || 'Done.' }]);
      if (Array.isArray(data.uiBlocks)) {
        setCards(data.uiBlocks);
      }
      if (Array.isArray(data.shortlist) && data.shortlist.length > 0) {
        setCards(data.shortlist.map((candidate: any) => ({
          type: 'candidate_card',
          title: `${candidate.name} — ${candidate.matchScore}%`,
          subtitle: `${candidate.location || 'Remote'} · ${candidate.availability?.hoursPerWeek || 0} hrs/week`,
          riskFlags: candidate.riskFlags || [],
        })));
      }
    } catch (error) {
      setMessages((prev) => [...prev, { sender: 'agent', text: error instanceof Error ? error.message : 'Something went wrong.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-8">
      <div className="glass-panel-strong p-6 md:p-8">
        <h2 className="text-white text-3xl md:text-4xl font-semibold leading-tight">{title}</h2>
        <p className="text-white/70 mt-3 max-w-2xl">Text naturally. DevLabs agent converts it into structured hiring data and actions.</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.action}
              onClick={() => setSelectedAction(option.action)}
              className={`px-4 py-2 rounded-full text-sm border transition ${selectedAction === option.action ? 'bg-[#fa7d22] text-black border-[#fa7d22] shadow-[0_0_22px_rgba(250,125,34,0.4)]' : 'text-white/80 border-white/20 hover:border-white/45 hover:text-white bg-white/[0.02]'}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-white/15 bg-black/35 p-4 h-[420px] overflow-y-auto space-y-3 shadow-inner shadow-black/40">
          {messages.map((message, index) => (
            <div key={`${message.sender}-${index}`} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.sender === 'agent' ? 'bg-white/[0.12] text-white/90 border border-white/10' : 'ml-auto bg-[#fa7d22] text-black font-semibold shadow-[0_8px_25px_rgba(250,125,34,0.35)]'}`}>
              {message.text}
            </div>
          ))}
          {loading ? <div className="text-white/60 text-sm">Agent is working…</div> : null}
        </div>

        <div className="mt-4 flex gap-3">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder={activeOption?.placeholder || 'Type a request...'}
            className="flex-1 bg-white/[0.06] border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/45 focus:outline-none focus:border-[#fa7d22]/75"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="px-5 py-3 rounded-xl bg-[#fa7d22] text-black font-semibold hover:bg-[#ff9b4e] transition disabled:opacity-60 shadow-[0_10px_28px_rgba(250,125,34,0.35)]"
          >
            Send
          </button>
        </div>
      </div>

      <div className="glass-panel p-6 md:p-7 shadow-glass-lg">
        <h3 className="text-white text-xl font-semibold">Generated UI</h3>
        <p className="text-white/65 mt-2 text-sm">Agent-created cards from your conversation.</p>

        <div className="mt-5 space-y-3">
          {cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/25 bg-white/[0.04] p-4 text-white/55 text-sm">
              Run an action to generate profile, role brief, or candidate cards.
            </div>
          ) : (
            cards.map((card, index) => (
              <div key={`${card.type}-${index}`} className="rounded-2xl border border-white/15 bg-white/[0.05] p-4">
                <p className="text-white font-semibold">{card.title || card.type}</p>
                {card.subtitle ? <p className="text-white/70 text-sm mt-1">{card.subtitle}</p> : null}
                {card.body ? <p className="text-white/80 text-sm mt-2 leading-relaxed">{card.body}</p> : null}
                {Array.isArray(card.missingItems) && card.missingItems.length > 0 ? (
                  <ul className="mt-3 text-sm text-white/70 list-disc list-inside space-y-1">
                    {card.missingItems.map((item: string) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {Array.isArray(card.riskFlags) && card.riskFlags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {card.riskFlags.map((risk: string) => (
                      <span key={risk} className="px-2 py-1 rounded-full text-xs border border-amber-400/40 text-amber-200 bg-amber-500/10">{risk}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
