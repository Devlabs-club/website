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
    <div className={cn('flex flex-wrap items-start justify-between gap-4 mb-5', className)}>
      <div>
        {eyebrow ? (
          <p className="text-[#fa7d22] uppercase tracking-[0.25em] text-[10px] font-bold mb-2">{eyebrow}</p>
        ) : null}
        <h2 className="text-2xl md:text-[28px] font-semibold tracking-tight text-white leading-tight">{title}</h2>
        {subtitle ? <p className="text-white/50 text-sm mt-1.5 max-w-2xl">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
