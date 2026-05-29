import React, { useState, useEffect, useRef } from 'react';
import { Bot, UploadCloud, Check, Loader2, ArrowRight } from 'lucide-react';
import { DottedGlowBackground } from '../ui/dotted-glow-background';
import { AmbientBackground } from '../ui/AmbientBackground';
import { useAuth } from '../auth_manager';

type Message = {
  id: string;
  sender: 'agent' | 'user';
  text: string;
  type?: 'text' | 'upload' | 'logo_preview';
  logoData?: string;
};

interface FounderOnboardingChatProps {
  onCompleted: (startupData: { company: string; startupSummary: string; logoUrl?: string }) => void;
}

export default function FounderOnboardingChat({ onCompleted }: FounderOnboardingChatProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'welcome' | 'startup_info' | 'logo_upload' | 'industry_stage' | 'done'>('welcome');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedLogo, setUploadedLogo] = useState<string | null>(null);
  const [startupName, setStartupName] = useState('');
  const [startupDesc, setStartupDesc] = useState('');
  const [isExiting, setIsExiting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking, uploadProgress]);

  // Initial welcome message sequence
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsThinking(true);
      setTimeout(() => {
        setIsThinking(false);
        setMessages([
          {
            id: 'welcome',
            sender: 'agent',
            text: `Hey ${user?.name || 'there'}! Let's get you onboarded to DevLabs OS. I'm going to ask a few quick questions to set up your profile.`,
          },
        ]);

        setTimeout(() => {
          setIsThinking(true);
          setTimeout(() => {
            setIsThinking(false);
            setMessages((prev) => [
              ...prev,
              {
                id: 'startup_prompt',
                sender: 'agent',
                text: "First up, what is the name of your startup, and tell me a little bit about what you are building?",
              },
            ]);
            setStep('startup_info');
          }, 1000);
        }, 1200);
      }, 1000);
    }, 500);

    return () => clearTimeout(timer);
  }, [user]);

  const addMessage = (sender: 'agent' | 'user', text: string, type: 'text' | 'upload' | 'logo_preview' = 'text', logoData?: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender,
      text,
      type,
      logoData,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const handleStartupSubmit = async (text: string) => {
    if (!text.trim()) return;
    addMessage('user', text);
    setInputText('');
    setStep('logo_upload');
    setIsThinking(true);

    // Call API to parse and store startup info as a draft opportunity
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'founder_chat',
          payload: {
            message: `My startup name is ${text.split('\n')[0]} and we build: ${text.split('\n').slice(1).join('\n') || text}`,
            history: [],
          },
        }),
      });
      const data = await response.json();
      if (data.success && data.opportunity) {
        setStartupName(data.opportunity.company || '');
        setStartupDesc(data.opportunity.startupSummary || '');
      }
    } catch (err) {
      console.error('Failed to parse startup details:', err);
    }

    setTimeout(() => {
      setIsThinking(false);
      addMessage('agent', "Okay cool, I got that info! Next, could you upload your startup logo or profile picture?");
    }, 1500);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Simulate upload progress
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev === null) return null;
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 20;
      });
    }, 150);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setTimeout(() => {
        setUploadProgress(null);
        setUploadedLogo(base64);
        if (user?.id) {
          localStorage.setItem(`devlabs_founder_logo_${user.id}`, base64);
        }
        addMessage('user', 'Uploaded logo', 'logo_preview', base64);

        // Transition to next question
        setIsThinking(true);
        setTimeout(() => {
          setIsThinking(false);
          addMessage(
            'agent',
            "Got the logo! That looks great. Let's ask one final quick question: what industry or market sector is your startup in, and what is your current funding stage? (e.g. Fintech, Pre-seed, or type 'skip' if you're ready to proceed)"
          );
          setStep('industry_stage');
        }, 1200);
      }, 1000);
    };
    reader.readAsDataURL(file);
  };

  const handleIndustryStageSubmit = async (text: string) => {
    if (!text.trim()) return;
    addMessage('user', text);
    setInputText('');
    setStep('done');
    setIsThinking(true);

    if (text.toLowerCase() !== 'skip') {
      try {
        // Save sector/industry details
        await fetch('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'founder_chat',
            payload: {
              message: `My startup industry or funding stage is: ${text}`,
              history: messages.map((m) => ({
                role: m.sender === 'agent' ? 'assistant' : 'user',
                content: m.text,
              })),
            },
          }),
        });
      } catch (err) {
        console.error('Failed to update stage:', err);
      }
    }

    setTimeout(() => {
      setIsThinking(false);
      addMessage('agent', "Awesome! We're all set. Let's find some builders who can ship.");
      
      setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => {
          onCompleted({
            company: startupName || 'Your startup',
            startupSummary: startupDesc || '',
            logoUrl: uploadedLogo || undefined,
          });
        }, 800); // Allow exit fade-out transition to complete
      }, 1500);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!inputText.trim()) return;
    if (step === 'startup_info') {
      handleStartupSubmit(inputText);
    } else if (step === 'industry_stage') {
      handleIndustryStageSubmit(inputText);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center text-white overflow-hidden transition-opacity duration-700 ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <AmbientBackground overlayOpacity={0.72} />
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
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(8_8%_3.5%/0.75)_100%)]" />

      {/* Main chat window */}
      <div className="relative z-10 w-full max-w-xl mx-auto px-4 flex flex-col h-[85vh] justify-between">
        
        {/* Header */}
        <div className="text-center py-4 border-b border-white/5 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#fa7d22] to-[#ff9b4e] flex items-center justify-center shadow-lg shadow-[#fa7d22]/20 mb-3">
            <Bot className="w-6 h-6 text-black" />
          </div>
          <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent">
            Welcome to DevLabs OS
          </h2>
          <p className="text-xs text-white/40 mt-0.5">Let's set up your founder profile</p>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto py-6 space-y-4 px-2 custom-scrollbar">
          {messages.map((msg) => {
            const isAgent = msg.sender === 'agent';
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
                      ? 'bg-white/[0.03] border border-white/5 text-white/95 backdrop-blur-md'
                      : 'bg-gradient-to-r from-[#fa7d22] to-[#ff9b4e] text-black font-medium shadow-md shadow-[#fa7d22]/10'
                  }`}
                >
                  {msg.type === 'logo_preview' && msg.logoData ? (
                    <div className="space-y-2">
                      <p className="text-xs text-black/50 uppercase tracking-wider font-semibold">Startup Logo</p>
                      <img
                        src={msg.logoData}
                        alt="Startup Logo"
                        className="w-16 h-16 rounded-xl object-cover bg-white/10 border border-black/10"
                      />
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            );
          })}

          {/* Thinking indicator */}
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

          {/* Upload Progress Loader */}
          {uploadProgress !== null && (
            <div className="flex gap-3 ml-auto flex-row-reverse w-full max-w-[85%]">
              <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/5 text-white w-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/50">Uploading logo...</span>
                  <span className="text-xs font-semibold text-[#fa7d22]">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#fa7d22] h-full rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="py-4 border-t border-white/5 bg-[hsl(8_8%_3.5%/0.75)] backdrop-blur-md">
          {step === 'logo_upload' && uploadProgress === null ? (
            <div className="animate-fade-in">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-white/10 border-dashed rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-8 h-8 text-white/30 group-hover:text-[#fa7d22] transition-colors mb-2" />
                  <p className="text-sm text-white/60 font-medium">Click to upload logo</p>
                  <p className="text-xs text-white/30 mt-1">PNG, JPG, SVG up to 5MB</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
            </div>
          ) : step === 'done' ? (
            <div className="text-center py-2 text-white/40 text-sm italic">
              Onboarding complete. Entering dashboard...
            </div>
          ) : (
            <div className="relative flex items-end gap-2 bg-white/[0.03] border border-white/10 rounded-2xl p-2 focus-within:border-[#fa7d22]/30 transition-all duration-300">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  step === 'startup_info'
                    ? "Acme Corp\nWe build automated space lasers for satellite protection..."
                    : "Fintech, Pre-seed..."
                }
                rows={step === 'startup_info' ? 3 : 1}
                className="flex-1 bg-transparent border-0 text-sm text-white placeholder:text-white/20 focus:ring-0 focus:outline-none resize-none px-2 py-1.5"
              />
              <button
                onClick={handleSubmit}
                disabled={!inputText.trim()}
                className="p-3 rounded-xl bg-gradient-to-r from-[#fa7d22] to-[#ff9b4e] text-black font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
