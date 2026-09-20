/**
 * Achievements that can be earned without a server. Multiplayer and community-map
 * achievements are hidden in the serverless build because they are unreachable there.
 */
export const OFFLINE_ACHIEVEMENTS = new Set([
  'first_game',
  'games_10',
  'games_100',
  'perfect_round',
  'perfect_10',
  'score_20k',
  'score_24k',
  'nmpz_20k',
  'speed_demon',
  'daily_first',
  'daily_streak_7',
  'challenge_creator',
  'streak_10',
  'streak_25',
  'village_streak_5',
  'explorer_all_bronze',
  'explorer_all_gold',
  'explorer_all_platinum',
  'level_10',
  'level_25',
]);
