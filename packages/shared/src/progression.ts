/** XP, levels, explorer medals and ranked divisions. */

export function xpToReachLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelFromXp(xp: number): number {
  // Inverse of 50·L·(L−1) ≤ xp
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2));
}

export function levelProgress(xp: number): { level: number; current: number; needed: number } {
  const level = levelFromXp(xp);
  const base = xpToReachLevel(level);
  return { level, current: xp - base, needed: xpToReachLevel(level + 1) - base };
}

export const XP = {
  classicGame: (totalScore: number) => Math.round(totalScore / 100),
  streakCorrect: 10,
  duelWin: 100,
  duelLoss: 30,
  brWin: 150,
  brPlacement: 40,
  dailyBonus: 50,
} as const;

export type Medal = 'bronze' | 'silver' | 'gold' | 'platinum';
export const MEDALS: Medal[] = ['bronze', 'silver', 'gold', 'platinum'];
export const MEDAL_THRESHOLDS: Record<Medal, number> = {
  bronze: 10_000,
  silver: 15_000,
  gold: 20_000,
  platinum: 23_500,
};

export function medalForScore(score: number): Medal | null {
  let best: Medal | null = null;
  for (const m of MEDALS) if (score >= MEDAL_THRESHOLDS[m]) best = m;
  return best;
}

export function medalRank(m: Medal | null): number {
  return m ? MEDALS.indexOf(m) + 1 : 0;
}

export const INITIAL_RATING = 1000;
export const PLACEMENT_GAMES = 10;

export function eloExpected(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** New rating after a game. `result` is 1 for win, 0 for loss, 0.5 draw. */
export function eloUpdate(rating: number, opponent: number, result: 0 | 0.5 | 1, gamesPlayed: number): number {
  const k = gamesPlayed < PLACEMENT_GAMES ? 40 : 32;
  return Math.round(rating + k * (result - eloExpected(rating, opponent)));
}

export type Division = 'bronze' | 'silver' | 'gold' | 'master' | 'champion';
export function divisionForRating(rating: number): Division {
  if (rating < 1000) return 'bronze';
  if (rating < 1200) return 'silver';
  if (rating < 1400) return 'gold';
  if (rating < 1600) return 'master';
  return 'champion';
}
