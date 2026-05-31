import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { scoreTone } from './theme';

type OsBadgeVariant = 'score' | 'accent' | 'muted' | 'success';

export default function OsBadge({
  children,
  variant = 'muted',
  score,
  className,
}: {
  children: React.ReactNode;
  variant?: OsBadgeVariant;
  score?: number;
  className?: string;
}) {
  const tone =
    variant === 'score' && typeof score === 'number'
      ? scoreTone(score)
      : variant === 'accent'
        ? 'text-[#ffb580] bg-[#fa7d22]/15 border-[#fa7d22]/30'
        : variant === 'success'
          ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
          : 'text-white/70 bg-white/5 border-white/15';

  return (
    <Badge
      variant="outline"
      className={cn('rounded-full border px-3 py-1 text-xs font-medium', tone, className)}
    >
      {children}
    </Badge>
  );
}
