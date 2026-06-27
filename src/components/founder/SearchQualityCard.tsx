import React from 'react';

type Props = {
  block: {
    title?: string;
    meta?: Record<string, unknown>;
  };
  onRunPreviewAnyway?: () => void;
  searchBusy?: boolean;
};

export default function SearchQualityCard({ block, onRunPreviewAnyway, searchBusy }: Props) {
  const meta = (block.meta || {}) as {
    rating?: string;
    filledRequired?: string[];
    missingRequired?: string[];
    filledOptional?: string[];
    missingOptional?: string[];
    canRunPreview?: boolean;
  };

  const rating = meta.rating || 'Needs work';
  const filledRequired = meta.filledRequired || [];
  const missingRequired = meta.missingRequired || [];
  const filledOptional = meta.filledOptional || [];
  const missingOptional = meta.missingOptional || [];

  const ratingTone =
    rating === 'Good'
      ? 'text-emerald-300 border-emerald-400/30'
      : rating === 'Fair'
        ? 'text-amber-200 border-amber-400/30'
        : 'text-white/70 border-white/20';

  const allRequiredLabels = [
    'Role',
    'What they build',
    'Skills',
    'Work type',
    'Budget',
    'Timeline',
    'Location',
  ];

  const isFilled = (label: string) => filledRequired.includes(label);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">{block.title || `Search Quality: ${rating}`}</p>
        <span className={`px-2 py-0.5 rounded-full text-xs border ${ratingTone}`}>{rating}</span>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Required</p>
        <ul className="text-sm space-y-1">
          {allRequiredLabels.map((label) => (
            <li key={label} className={isFilled(label) ? 'text-emerald-300/90' : 'text-white/50'}>
              {isFilled(label) ? '✓' : '○'} {label}
            </li>
          ))}
        </ul>
        {missingRequired.length > 0 ? (
          <p className="text-xs text-white/45 mt-2">Still open: {missingRequired.join(', ')}</p>
        ) : null}
      </div>

      {(filledOptional.length > 0 || missingOptional.length > 0) && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Optional</p>
          <ul className="text-sm text-white/60 space-y-0.5">
            {filledOptional.map((label) => (
              <li key={label}>✓ {label}</li>
            ))}
            {missingOptional.map((label) => (
              <li key={label} className="text-white/40">
                + {label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onRunPreviewAnyway ? (
        <button
          type="button"
          onClick={onRunPreviewAnyway}
          disabled={searchBusy}
          className="w-full py-2 rounded-xl border border-[#fa7d22]/40 text-[#ffb580] text-sm font-medium hover:bg-[#fa7d22]/10 disabled:opacity-50"
        >
          {searchBusy ? 'Running preview…' : 'Run preview anyway'}
        </button>
      ) : null}
    </div>
  );
}
