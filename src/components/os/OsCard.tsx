import React from 'react';
import { cn } from '@/lib/utils';
import { MagicCard } from '@/components/ui/magic-card';
import { BorderBeam } from '@/components/ui/border-beam';
import { osTheme } from './theme';

export default function OsCard({
  children,
  className,
  spotlight = false,
  beam = false,
  beamClassName,
}: {
  children: React.ReactNode;
  className?: string;
  spotlight?: boolean;
  beam?: boolean;
  beamClassName?: string;
}) {
  const inner = (
    <div
      className={cn(
        'relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6 transition-all duration-300 hover:border-white/20',
        className
      )}
    >
      {beam ? (
        <BorderBeam
          size={120}
          duration={8}
          colorFrom={osTheme.primary}
          colorTo={osTheme.secondary}
          className={beamClassName}
        />
      ) : null}
      {children}
    </div>
  );

  if (spotlight) {
    return (
      <MagicCard
        className="rounded-3xl"
        gradientFrom={osTheme.primary}
        gradientTo={osTheme.secondary}
        gradientColor="rgba(250,125,34,0.15)"
        gradientOpacity={0.6}
      >
        {inner}
      </MagicCard>
    );
  }

  return inner;
}
