import React, { useState } from 'react';

export type FounderHighlight = {
  title?: string;
  detail?: string;
  source?: string;
};

const SOURCE_LABELS: Record<string, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  devpost: 'Devpost',
  portfolio: 'Portfolio',
  personalwebsite: 'Website',
  twitter: 'X',
  resume: 'Resume',
  research: 'Research',
  profile: 'Profile',
};

function normalizeSourceToken(token: string) {
  const key = token.trim().toLowerCase().replace(/\s+/g, '').replace(/profile$/i, '');
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  if (/github/i.test(token)) return 'GitHub';
  if (/linkedin/i.test(token)) return 'LinkedIn';
  if (/devpost/i.test(token)) return 'Devpost';
  if (/twitter|^x$/i.test(token)) return 'X';
  if (/research/i.test(token)) return 'Research';
  if (/portfolio|website/i.test(token)) return 'Web';
  return token.trim();
}

function formatSources(source?: string | null) {
  if (!source?.trim()) return [];
  return [...new Set(source.split(/[,;|]/).map(normalizeSourceToken).filter(Boolean))].slice(0, 2);
}

function HighlightChip({
  item,
  active,
  onToggle,
  variant,
}: {
  item: FounderHighlight;
  active: boolean;
  onToggle: () => void;
  variant: 'profile' | 'panel';
}) {
  const sources = formatSources(item.source);

  if (variant === 'profile') {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        className={
          active
            ? 'inline-flex max-w-full flex-col rounded-2xl border border-[#ff7417]/40 bg-[#fff5ef] px-3 py-2 text-left transition'
            : 'inline-flex max-w-full flex-col rounded-2xl border border-black/10 bg-[#fbf6f3]/86 px-3 py-2 text-left transition hover:border-[#ff7417]/25 hover:bg-[#fff9f4]'
        }
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={`text-xs font-extrabold ${active ? 'text-[#bf4f08]' : 'text-[#050505]'}`}>{item.title}</span>
          {sources.map((label) => (
            <span
              key={label}
              className="rounded-full border border-black/10 bg-white px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-black/40"
            >
              {label}
            </span>
          ))}
        </span>
        {active ? (
          <span className="mt-1.5 text-xs leading-5 text-black/55">{item.detail}</span>
        ) : (
          <span className="mt-1 line-clamp-1 text-xs leading-5 text-black/45">{item.detail}</span>
        )}
      </button>
    );
  }

  return (
    <div className="inline-flex max-w-full flex-col rounded-xl border border-[#ff7417]/20 bg-white px-3 py-2">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-extrabold text-[#bf4f08]">{item.title}</span>
        {sources.map((label) => (
          <span
            key={label}
            className="rounded-full border border-black/10 bg-[#fdfaf7] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-black/40"
          >
            {label}
          </span>
        ))}
      </span>
      <span className="mt-1 line-clamp-2 text-xs leading-5 text-black/55">{item.detail}</span>
    </div>
  );
}

export const BuilderHighlightsSection: React.FC<{
  highlights: FounderHighlight[];
  defaultVisible?: number;
  variant?: 'profile' | 'panel';
}> = ({ highlights, defaultVisible = 6, variant = 'profile' }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const items = highlights.filter((item) => item?.title && item?.detail);
  if (!items.length) return null;

  const hiddenCount = Math.max(0, items.length - defaultVisible);
  const visibleItems = expanded ? items : items.slice(0, defaultVisible);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {visibleItems.map((item, index) => (
          <HighlightChip
            key={`${item.title}-${index}`}
            item={item}
            variant={variant}
            active={variant === 'profile' && activeIndex === index}
            onToggle={() => setActiveIndex((current) => (current === index ? null : index))}
          />
        ))}

        {hiddenCount > 0 && !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex h-fit items-center rounded-full border border-[#ff7417]/35 bg-[#fff5ef] px-3 py-1.5 text-xs font-semibold text-[#bf4f08] transition hover:border-[#ff7417]/50"
          >
            +{hiddenCount} more
          </button>
        ) : null}
      </div>

      {expanded && hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 text-xs font-semibold text-[#bf4f08] transition hover:text-[#ff7417]"
        >
          Show fewer
        </button>
      ) : null}
    </div>
  );
};

export default BuilderHighlightsSection;
