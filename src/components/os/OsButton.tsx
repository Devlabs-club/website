import React from 'react';
import { cn } from '@/lib/utils';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { Button } from '@/components/ui/button';
import { osTheme } from './theme';

type OsButtonVariant = 'shimmer' | 'glass' | 'ghost' | 'white';

export default function OsButton({
  variant = 'glass',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: OsButtonVariant }) {
  if (variant === 'shimmer') {
    return (
      <ShimmerButton
        shimmerColor="#ffffff"
        background={osTheme.primary}
        borderRadius="9999px"
        className={cn('text-black font-semibold text-sm', className)}
        {...props}
      >
        {children}
      </ShimmerButton>
    );
  }

  if (variant === 'white') {
    return (
      <button
        type="button"
        className={cn(
          'inline-flex items-center justify-center px-6 py-3 rounded-full bg-white text-[#1a1a1a] font-semibold tracking-wide shadow-[0_0_40px_rgba(250,125,34,0.15)] transition-all hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === 'ghost') {
    return (
      <Button
        variant="ghost"
        className={cn('text-white/70 hover:text-white hover:bg-white/5', className)}
        {...props}
      >
        {children}
      </Button>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-white/20 text-white font-medium transition-all hover:border-white/35 hover:from-white/15',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
