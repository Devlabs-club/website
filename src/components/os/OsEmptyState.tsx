import React from 'react';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { cn } from '@/lib/utils';

export default function OsEmptyState({
  icon,
  title,
  description,
  action,
  className,
  animateTitle = true,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  animateTitle?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center rounded-3xl border border-dashed border-white/20 bg-white/[0.02] backdrop-blur-sm',
        className
      )}
    >
      {icon ? (
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/40 mb-4">{icon}</div>
      ) : null}
      {animateTitle ? (
        <div className="mb-2">
          <TextGenerateEffect words={title} className="text-xl font-semibold text-white" duration={0.4} />
        </div>
      ) : (
        <h3 className="text-xl font-semibold mb-2 text-white">{title}</h3>
      )}
      {description ? <p className="text-white/60 max-w-md mb-8 text-sm">{description}</p> : null}
      {action}
    </div>
  );
}
