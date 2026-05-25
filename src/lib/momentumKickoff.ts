/** April 24, 2026, 10:30 AM America/Phoenix — partner credits, badge, leaderboard. */
export const MOMENTUM_KICKOFF_ISO = "2026-04-24T10:30:00-07:00" as const;

export function isMomentumKickoffRevealed(now = Date.now()) {
  return now >= new Date(MOMENTUM_KICKOFF_ISO).getTime();
}
