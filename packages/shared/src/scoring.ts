export const MAX_ROUND_SCORE = 5000;
export const ROUNDS_PER_GAME = 5;
export const MAX_GAME_SCORE = MAX_ROUND_SCORE * ROUNDS_PER_GAME;
/** Guesses at least this close always earn the full 5000. */
export const PERFECT_RADIUS_M = 25;

/**
 * GeoGuessr-style exponential decay, scaled to the map's size so that small
 * maps (a single district) are proportionally stricter than the whole city.
 */
export function roundScore(distanceM: number, mapDiagonalKm: number): number {
  if (!Number.isFinite(distanceM) || distanceM < 0) return 0;
  if (distanceM <= PERFECT_RADIUS_M) return MAX_ROUND_SCORE;
  const d = distanceM / 1000;
  const size = Math.max(mapDiagonalKm, 0.5);
  return Math.round(MAX_ROUND_SCORE * Math.exp((-10 * d) / size));
}

export type DistanceUnit = 'metric' | 'imperial';

export function formatDistance(meters: number, unit: DistanceUnit = 'metric'): string {
  if (unit === 'imperial') {
    const feet = meters * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    const miles = meters / 1609.344;
    return `${miles < 10 ? miles.toFixed(2) : miles.toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`;
}
