/** Pure rule functions for Duels and Battle Royale, shared by server and client. */

export const DUEL_START_HP = 6000;
/** Once someone guesses, everyone else gets this long. */
export const GUESS_COUNTDOWN_SEC = 15;

export function duelMultiplier(roundNo: number): number {
  return roundNo <= 4 ? 1 : 1 + 0.5 * (roundNo - 4);
}

export interface DuelRoundOutcome {
  damage: number;
  /** Team that takes the damage, null on a tie. */
  loser: string | null;
}

/** `scores` maps team id → best score of that team for the round. */
export function duelRoundDamage(roundNo: number, scores: Record<string, number>): DuelRoundOutcome {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length < 2) return { damage: 0, loser: null };
  const [best, worst] = [entries[0]!, entries[entries.length - 1]!];
  const diff = best[1] - worst[1];
  if (diff === 0) return { damage: 0, loser: null };
  return { damage: Math.round(diff * duelMultiplier(roundNo)), loser: worst[0] };
}

export const BR_START_LIVES = 3;
export const BR_MAX_PLAYERS = 10;
export const BR_LOSE_FRACTION = 0.25;

export interface BrDistanceEntry {
  id: string;
  lives: number;
  distanceM: number | null;
}

/**
 * Who loses a life this round in BR Distance: everyone who didn't guess, plus
 * the farthest 25% (at least one) of those who did. If that would knock out
 * every remaining player, the closest of them is spared so there is a winner.
 */
export function brDistanceLosers(entries: BrDistanceEntry[], fraction = BR_LOSE_FRACTION): Set<string> {
  const alive = entries.filter((e) => e.lives > 0);
  const losers = new Set(alive.filter((e) => e.distanceM === null).map((e) => e.id));
  const guessed = alive.filter((e) => e.distanceM !== null).sort((a, b) => a.distanceM! - b.distanceM!);
  if (guessed.length > 1) {
    const n = Math.max(1, Math.ceil(guessed.length * fraction));
    const cutoff = guessed[guessed.length - n]!.distanceM!;
    // Ties with the cutoff distance share the fate.
    for (const e of guessed) if (e.distanceM! >= cutoff) losers.add(e.id);
    if (losers.size === alive.length) losers.delete(guessed[0]!.id);
  }
  const survivors = alive.filter((e) => !(losers.has(e.id) && e.lives === 1));
  if (survivors.length === 0 && alive.length > 0) {
    const spared = guessed[0] ?? alive[0]!;
    losers.delete(spared.id);
  }
  return losers;
}

export type BrRegionLevel = 'district' | 'village';
export const BR_REGION_ATTEMPTS: Record<BrRegionLevel, number> = { district: 1, village: 3 };
