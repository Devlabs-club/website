import { cn } from '@/lib/utils';

export const adminInputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-orange-400/50 focus:ring-2 focus:ring-orange-400/20 disabled:opacity-50';

export const adminSelectClass = adminInputClass;

export const adminPanelClass =
  'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm';

export const adminSubPanelClass =
  'rounded-xl border border-white/10 bg-black/20';

export const adminLabelClass = 'text-xs font-semibold uppercase tracking-[0.15em] text-white/45';

export const adminMutedClass = 'text-sm text-white/55';

export function adminListItemClass(active: boolean) {
  return cn(
    'p-4 cursor-pointer transition-all border-b border-white/5 last:border-b-0',
    active
      ? 'bg-orange-500/10 border-l-2 border-l-[#fa7d22]'
      : 'hover:bg-white/[0.04] border-l-2 border-l-transparent'
  );
}

export function adminPrimaryButtonClass(disabled = false) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all',
    'bg-[#fa7d22] text-black hover:brightness-110',
    disabled && 'opacity-50 cursor-not-allowed'
  );
}

export function adminSecondaryButtonClass() {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all',
    'border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'
  );
}

export function adminGhostButtonClass() {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all',
    'text-white/60 hover:text-white hover:bg-white/5'
  );
}
