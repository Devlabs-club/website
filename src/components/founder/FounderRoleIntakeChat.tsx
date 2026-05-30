import React, { useState, useEffect, useRef } from 'react';
import { Bot, Sparkles, Send, ArrowLeft, Loader2, ArrowRight, Award, Zap, HelpCircle } from 'lucide-react';
import { DottedGlowBackground } from '../ui/dotted-glow-background';
import { AmbientBackground } from '../ui/AmbientBackground';
import { useAuth } from '../auth_manager';

type ChatMessage = {
  id: string;
  sender: 'agent' | 'user';
  text: string;
  isCandidatesFeed?: boolean;
  candidates?: any[];
};

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
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [opportunityId, setOpportunityId] = useState<string | null>(initialOpportunityId);
  const [currentBrief, setCurrentBrief] = useState<any>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Initial prompt
  useEffect(() => {
    const greetingText = `Let's find the perfect builder for your next hire. First, tell me a little bit about the role and what qualities you look for in the person.`;
    
    setMessages([
      {
        id: 'agent-greet',
        sender: 'agent',
        text: greetingText,
      },
    ]);
  }, []);

  const addMessage = (sender: 'agent' | 'user', text: string, isCandidatesFeed = false, candidates?: any[]) => {
    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      sender,
      text,
      isCandidatesFeed,
      candidates,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isThinking) return;

    addMessage('user', text);
    setInputText('');
    setIsThinking(true);

    try {
      // Send chat message to backend
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'founder_chat',
          payload: {
            message: text,
            opportunityId: opportunityId,
            history: messages
              .filter((m) => !m.isCandidatesFeed)
              .map((m) => ({
                role: m.sender === 'agent' ? 'assistant' : 'user',
                content: m.text,
              })),
          },
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Agent request failed');

      setIsThinking(false);
      
      // Update opportunity tracking
      if (data.opportunity?._id) {
        setOpportunityId(String(data.opportunity._id));
        setCurrentBrief(data.opportunity);
      }

      // Check what is missing
      const skipped = data.opportunity?.skippedFields || [];
      const missing = data.session?.missingRequiredFields || [];
      setMissingFields(missing);

      addMessage('agent', data.message || 'Brief updated.');

      // If the brief is ready, run the builder search
      const hasTitle = data.opportunity?.roleTitle && data.opportunity?.roleTitle !== 'New role';
      const hasCompany = data.opportunity?.company && data.opportunity?.company !== 'Your startup';
      
      if (missing.length === 0 || data.intent === 'role_summary' || data.message.toLowerCase().includes('run the builder search') || data.message.toLowerCase().includes('rerun the search')) {
        // Trigger builder search automatically
        triggerBuilderSearch(String(data.opportunity._id));
      }
    } catch (err: any) {
      setIsThinking(false);
      addMessage('agent', `I encountered an issue processing that: ${err.message || 'unknown error'}`);
    }
  };

  const triggerBuilderSearch = async (oppId: string) => {
    setIsSearching(true);
    setIsThinking(true);
    addMessage('agent', "Brief compiled. Analyzing the DevLabs proof-of-work talent graph to match builders...");

    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run_builder_search',
          payload: { opportunityId: oppId },
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Search failed');

      // Fetch candidates list (anonymous or full depending on unlock state)
      const listRes = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_founder_dashboard',
          payload: {},
        }),
      });
      const listData = await listRes.json();
      const shortlist = (listData.shortlists || []).find((s: any) => s.opportunityId === oppId);

      setIsThinking(false);
      setIsSearching(false);

      if (shortlist && shortlist.candidates.length > 0) {
        addMessage(
          'agent',
          `Matched ${shortlist.totalMatches} builders with proof! Here are the top matches for your role:`,
          true,
          shortlist.candidates
        );
      } else {
        addMessage('agent', "I couldn't find any direct matches in our talent pool yet. Try adjusting the skills or stack in your brief.");
      }
    } catch (err: any) {
      setIsThinking(false);
      setIsSearching(false);
      addMessage('agent', `Could not complete matching: ${err.message || 'unknown error'}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getInterestingFact = (cand: any) => {
    if (cand.proofSummary) {
      // Clean up potential markdown formatting
      return cand.proofSummary.replace(/\*\*|`/g, '');
    }
    return cand.whyTheyMatch || "Built a standout project in a recent hackathon.";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center text-white overflow-hidden animate-fade-in">
      <AmbientBackground overlayOpacity={0.75} />
      <DottedGlowBackground
        className="fixed inset-0 z-0 w-full h-full"
        color="rgba(255,255,255,0.05)"
        glowColor="rgba(250, 125, 34, 0.28)"
        gap={14}
        radius={2}
        opacity={0.55}
        speedMin={0.3}
        speedMax={1}
        speedScale={0.8}
      />
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(8_8%_3.5%/0.8)_100%)]" />

      {/* Cockpit layout */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 flex flex-col h-screen justify-between py-6">
        
        {/* Header navigation */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-semibold group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Exit Search
          </button>
          
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#fa7d22] animate-pulse" />
            <span className="text-xs uppercase tracking-widest text-[#fa7d22] font-semibold">Role intake</span>
          </div>

          <div className="text-xs text-white/30">
            {currentBrief?.roleTitle && currentBrief.roleTitle !== 'New role'
              ? `${currentBrief.roleTitle} @ ${currentBrief.company || 'Draft'}`
              : 'New brief creation'}
          </div>
        </div>

        {/* Messaging Area */}
        <div className="flex-1 overflow-y-auto py-8 space-y-6 px-2 custom-scrollbar">
          {messages.map((msg, i) => {
            const isAgent = msg.sender === 'agent';
            
            if (msg.isCandidatesFeed && msg.candidates) {
              return (
                <div key={msg.id} className="space-y-6">
                  {/* Title message */}
                  <div className="flex gap-3 max-w-[85%] mr-auto">
                    <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#fa7d22] shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="rounded-2xl p-4 text-sm bg-white/[0.03] border border-white/5 text-white/95">
                      {msg.text}
                    </div>
                  </div>

                  {/* Candidate Feed Animation */}
                  <div className="grid gap-6 md:grid-cols-2 max-w-3xl ml-11">
                    {msg.candidates.map((cand, idx) => (
                      <div
                        key={cand.anonymousLabel || idx}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] p-5 flex flex-col justify-between transition-all duration-300 transform translate-y-0 opacity-100 animate-slide-up shadow-lg hover:shadow-[#fa7d22]/5"
                        style={{ animationDelay: `${idx * 200}ms` }}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-base text-white">{cand.anonymousLabel}</span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                              {cand.matchLabel || 'Strong Match'}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {(cand.topSkills || []).slice(0, 4).map((skill: string) => (
                              <span key={skill} className="px-2 py-0.5 rounded bg-white/5 text-white/60 text-xs border border-white/5">
                                {skill}
                              </span>
                            ))}
                          </div>

                          {/* Convincing Fact */}
                          <div className="rounded-xl bg-gradient-to-r from-[#fa7d22]/10 to-transparent p-3.5 border-l-2 border-[#fa7d22]">
                            <p className="text-[10px] uppercase tracking-wider text-[#ffb580] font-bold flex items-center gap-1.5 mb-1">
                              <Zap className="w-3.5 h-3.5" />
                              Interesting Fact
                            </p>
                            <p className="text-xs text-white/80 leading-relaxed font-medium">
                              {getInterestingFact(cand)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 flex gap-2">
                          <button
                            onClick={() => {
                              if (opportunityId) onSearchCompleted(opportunityId);
                            }}
                            className="flex-1 py-2 text-center rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition"
                          >
                            Explore Profile
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] animate-fade-in ${
                  isAgent ? 'mr-auto' : 'ml-auto flex-row-reverse'
                }`}
              >
                {isAgent && (
                  <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#fa7d22] shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`rounded-2xl p-4 text-sm leading-relaxed ${
                    isAgent
                      ? 'bg-white/[0.03] border border-white/5 text-white/95 backdrop-blur-md font-sans whitespace-pre-wrap'
                      : 'bg-gradient-to-r from-[#fa7d22] to-[#ff9b4e] text-black font-medium shadow-md shadow-[#fa7d22]/10'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}

          {/* Thinking dot animation */}
          {isThinking && (
            <div className="flex gap-3 mr-auto animate-pulse">
              <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#fa7d22]">
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-2xl px-4 py-3 bg-white/[0.03] border border-white/5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fa7d22] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#fa7d22] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#fa7d22] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer Chat Inputs */}
        <div className="border-t border-white/5 pt-4 bg-[hsl(8_8%_3.5%/0.8)] backdrop-blur-md">
          {isSearching ? (
            <div className="flex items-center justify-center gap-3 py-4 text-white/50 text-sm italic animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin text-[#fa7d22]" />
              Rerunning matches and structuring feed...
            </div>
          ) : (
            <div className="relative flex items-end gap-2 bg-white/[0.03] border border-white/10 rounded-2xl p-2.5 focus-within:border-[#fa7d22]/30 transition-all duration-300">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="I need a mobile engineer with Flutter experience to build a fintech app..."
                rows={2}
                className="flex-1 bg-transparent border-0 text-sm text-white placeholder:text-white/20 focus:ring-0 focus:outline-none resize-none px-2 py-1.5 custom-scrollbar"
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isThinking}
                className="p-3.5 rounded-xl bg-gradient-to-r from-[#fa7d22] to-[#ff9b4e] text-black font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
