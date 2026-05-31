import React from 'react';
import { cn } from '@/lib/utils';

export default function OsPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4 mb-6', className)}>
      <div>
        {eyebrow ? (
          <p className="text-[#fa7d22] uppercase tracking-[0.2em] text-[10px] font-bold mb-2">{eyebrow}</p>
        ) : null}
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">{title}</h2>
        {subtitle ? <p className="text-white/60 text-sm mt-2 max-w-2xl">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
