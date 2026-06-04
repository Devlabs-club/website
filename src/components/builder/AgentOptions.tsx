import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export type AgentOption = {
  id: string;
  label: string;
  description?: string;
  value: string;
  icon?: React.ReactNode;
};

export type AgentOptionsProps = {
  question: string;
  options: AgentOption[];
  allowCustom?: boolean;
  customLabel?: string;
  onSelect: (option: AgentOption) => void;
  selectedId?: string;
};

export default function AgentOptions({
  question,
  options,
  allowCustom = false,
  customLabel = 'Something else',
  onSelect,
  selectedId,
}: AgentOptionsProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(selectedId ?? null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement)) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = options[focusedIndex];
        if (opt) handleSelect(opt);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedIndex, options]);

  const handleSelect = (option: AgentOption) => {
    setSelected(option.id);
    onSelect(option);
  };

  const allOptions: AgentOption[] = allowCustom
    ? [...options, { id: '__custom__', label: customLabel, value: '__custom__', description: '' }]
    : options;

  return (
    <div ref={containerRef} className="space-y-2 mt-2" tabIndex={-1}>
      {question ? (
        <p className="text-sm text-white/70 font-medium mb-3">{question}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {allOptions.map((option, i) => {
          const isSelected = selected === option.id;
          const isFocused = focusedIndex === i;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleSelect(option)}
              onMouseEnter={() => setFocusedIndex(i)}
              className={cn(
                'w-full text-left rounded-xl px-4 py-3 border transition-all duration-200 flex items-center gap-3',
                isSelected
                  ? 'bg-[#fa7d22]/20 border-[#fa7d22]/50 text-[#ffb580] shadow-[0_0_12px_rgba(250,125,34,0.15)]'
                  : isFocused
                    ? 'bg-white/[0.06] border-white/20 text-white'
                    : 'bg-white/[0.03] border-white/10 text-white/80 hover:bg-white/[0.06] hover:border-white/20 hover:text-white'
              )}
            >
              {option.icon ? (
                <span className={cn('shrink-0', isSelected ? 'text-[#fa7d22]' : 'text-white/50')}>
                  {option.icon}
                </span>
              ) : (
                <span
                  className={cn(
                    'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors',
                    isSelected ? 'border-[#fa7d22] bg-[#fa7d22]/20' : 'border-white/20'
                  )}
                >
                  {isSelected ? <span className="w-2 h-2 rounded-full bg-[#fa7d22]" /> : null}
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                {option.description ? (
                  <span className="block text-xs text-white/50 mt-0.5">{option.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
