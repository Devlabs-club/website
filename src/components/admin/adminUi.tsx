import React from 'react';
import { cn } from '@/lib/utils';

// Admin surfaces are themed to match the landing page (src/pages/index.astro):
// cream paper (#fbf6f3), near-black ink (#050505), orange accent (#ff7417 /
// deep #bf4f08), Manrope, heavy weights, rounded-full CTAs and soft shadows.

export const adminInputClass =
  'w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-[#050505] placeholder:text-black/35 outline-none transition focus:border-[#ff7417] focus:ring-2 focus:ring-[#ff7417]/20 disabled:opacity-50';

export const adminSelectClass = adminInputClass;

export const adminPanelClass =
  'rounded-2xl border border-black/10 bg-white shadow-[0_12px_40px_rgba(5,5,5,0.05)]';

export const adminSubPanelClass =
  'rounded-xl border border-black/10 bg-[#f4f1ed]';

export const adminLabelClass =
  'font-mono text-[11px] font-extrabold uppercase tracking-[0.2em] text-black/45';

export const adminMutedClass = 'text-sm text-black/55';

export function adminListItemClass(active: boolean) {
  return cn(
    'p-4 cursor-pointer transition-all border-b border-black/8 last:border-b-0',
    active
      ? 'bg-[#fff5ef] border-l-2 border-l-[#ff7417]'
      : 'hover:bg-[#f4f1ed] border-l-2 border-l-transparent'
  );
}

export function adminPrimaryButtonClass(disabled = false) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full border-2 px-6 py-2.5 text-sm font-extrabold transition-all',
    'border-[#1f2422] bg-[#2f3432] text-white shadow-[0_12px_28px_rgba(5,5,5,0.12)] hover:-translate-y-0.5 hover:border-[#ff7417] hover:bg-[#ff7417]',
    disabled && 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:bg-[#2f3432] hover:border-[#1f2422]'
  );
}

export function adminSecondaryButtonClass() {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full border-2 px-5 py-2 text-sm font-bold transition-all',
    'border-black/15 bg-[#fffaf7] text-[#050505] hover:-translate-y-0.5 hover:border-[#ff7417] hover:text-[#bf4f08]'
  );
}

export function adminGhostButtonClass() {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all',
    'text-black/55 hover:text-[#050505] hover:bg-black/5'
  );
}

/** Light, landing-themed page header (replaces the dark OsPageHeader in admin). */
export function AdminPageHeader({
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
          <p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.28em] text-[#bf4f08] mb-2">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-2xl md:text-[30px] font-black tracking-[-0.03em] text-[#050505] leading-tight">
          {title}
        </h2>
        {subtitle ? <p className="text-black/55 text-sm mt-1.5 max-w-2xl font-medium">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Light, landing-themed empty state (replaces the dark OsEmptyState in admin). */
export function AdminEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Accepted for drop-in parity with OsEmptyState; light state never animates. */
  animateTitle?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center rounded-2xl border border-dashed border-black/15 bg-[#f4f1ed]',
        className
      )}
    >
      {icon ? (
        <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-black/40 mb-4 border border-black/10">
          {icon}
        </div>
      ) : null}
      <h3 className="text-xl font-black tracking-[-0.02em] mb-2 text-[#050505]">{title}</h3>
      {description ? <p className="text-black/55 max-w-md mb-8 text-sm font-medium">{description}</p> : null}
      {action}
    </div>
  );
}
