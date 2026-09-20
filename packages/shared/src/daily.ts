import type { GameSettings } from './types.ts';

/** Current calendar day in Taipei (UTC+8, no DST) as YYYY-MM-DD. */
export function taipeiDay(now = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

export function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** Milliseconds until the next Taipei midnight. */
export function untilNextTaipeiDay(now = Date.now()): number {
  const taipei = now + 8 * 3600_000;
  return Math.ceil(taipei / 86_400_000) * 86_400_000 - taipei;
}

/** The daily challenge rotates its settings by weekday so every day feels different. */
const DAILY_SETTINGS: GameSettings[] = [
  { movement: 'moving', timeLimitSec: 180 }, // Sunday
  { movement: 'moving', timeLimitSec: 120 },
  { movement: 'nomove', timeLimitSec: 90 },
  { movement: 'moving', timeLimitSec: 60 },
  { movement: 'nmpz', timeLimitSec: 60 },
  { movement: 'nomove', timeLimitSec: 60 },
  { movement: 'moving', timeLimitSec: 90 }, // Saturday
];

export function dailySettingsFor(day: string): GameSettings {
  return DAILY_SETTINGS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;
}
