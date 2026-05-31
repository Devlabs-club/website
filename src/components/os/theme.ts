export const osTheme = {
  primary: '#fa7d22',
  primaryHover: '#ff9b4e',
  secondary: '#ffb580',
  warmPanel: '#1a130d',
  surface: 'hsl(8 8% 3.5%)',
} as const;

export function scoreTone(score: number) {
  if (score >= 80) return 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30';
  if (score >= 60) return 'text-amber-200 bg-amber-500/15 border-amber-400/30';
  return 'text-white/80 bg-white/10 border-white/20';
}

export const glassPanel = 'glass-panel';
export const glassPanelStrong = 'glass-panel-strong';
