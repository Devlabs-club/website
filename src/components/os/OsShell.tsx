import React from 'react';
import { AmbientBackground } from '@/components/ui/AmbientBackground';
import { cn } from '@/lib/utils';

export default function OsShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative min-h-screen w-full text-white font-manrope flex flex-col', className)}>
      <AmbientBackground />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(250,125,34,0.06) 0%, transparent 55%)',
        }}
      />
      <div className="relative z-10 flex-1 flex flex-col">{children}</div>
    </div>
  );
}
