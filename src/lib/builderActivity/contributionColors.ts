/** DevLabs orange contribution palette (GitHub-graph style, 5 levels). */
export const CONTRIBUTION_COLORS = {
  empty: '#f3ebe6',
  level1: '#ffe4d1',
  level2: '#ffc9a3',
  level3: '#ff9f52',
  level4: '#ff7417',
} as const;

export function contributionColor(count: number): string {
  if (count <= 0) return CONTRIBUTION_COLORS.empty;
  if (count <= 3) return CONTRIBUTION_COLORS.level1;
  if (count <= 6) return CONTRIBUTION_COLORS.level2;
  if (count <= 9) return CONTRIBUTION_COLORS.level3;
  return CONTRIBUTION_COLORS.level4;
}
