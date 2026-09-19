import { divisionForRating, levelFromXp } from '@tg/shared';
import type { Db } from '../db.ts';

/** Inserts the given achievements; returns the codes that were newly unlocked. */
export async function award(db: Db, userId: string, codes: string[]): Promise<string[]> {
  if (codes.length === 0) return [];
  const rows = await db.query<{ code: string }>(
    `insert into public.user_achievements (user_id, code)
     select $1, c from unnest($2::text[]) as c
     on conflict do nothing returning code`,
    [userId, `{${codes.join(',')}}`],
  );
  return rows.map((r) => r.code);
}

/** Achievements that can be earned by finishing a (single-player) game. */
export async function checkGameAchievements(db: Db, userId: string): Promise<string[]> {
  const s = await db.one<{
    games: number;
    perfect: number;
    best: number;
    best_nmpz: number;
    speedy: number;
    dailies: number;
    daily_streak: number;
    xp: number;
  }>(
    `select
       (select count(*)::int from public.games where user_id = $1 and status = 'finished') as games,
       (select count(*)::int from public.game_rounds r join public.games g on g.id = r.game_id
          where g.user_id = $1 and r.score = 5000) as perfect,
       (select coalesce(max(total_score), 0)::int from public.games where user_id = $1 and status = 'finished') as best,
       (select coalesce(max(total_score), 0)::int from public.games
          where user_id = $1 and status = 'finished' and movement = 'nmpz') as best_nmpz,
       (select count(*)::int from public.game_rounds r join public.games g on g.id = r.game_id
          where g.user_id = $1 and r.score >= 4000 and r.time_ms <= 10000) as speedy,
       (select count(*)::int from public.games where user_id = $1 and status = 'finished' and mode = 'daily') as dailies,
       p.daily_streak, p.xp
     from public.profiles p where p.id = $1`,
    [userId],
  );
  if (!s) return [];
  const codes: string[] = [];
  if (s.games >= 1) codes.push('first_game');
  if (s.games >= 10) codes.push('games_10');
  if (s.games >= 100) codes.push('games_100');
  if (s.perfect >= 1) codes.push('perfect_round');
  if (s.perfect >= 10) codes.push('perfect_10');
  if (s.best >= 20_000) codes.push('score_20k');
  if (s.best >= 24_000) codes.push('score_24k');
  if (s.best_nmpz >= 20_000) codes.push('nmpz_20k');
  if (s.speedy >= 1) codes.push('speed_demon');
  if (s.dailies >= 1) codes.push('daily_first');
  if (s.daily_streak >= 7) codes.push('daily_streak_7');
  codes.push(...levelCodes(s.xp));
  codes.push(...(await explorerCodes(db, userId)));
  return award(db, userId, codes);
}

export function levelCodes(xp: number): string[] {
  const level = levelFromXp(xp);
  return [...(level >= 10 ? ['level_10'] : []), ...(level >= 25 ? ['level_25'] : [])];
}

async function explorerCodes(db: Db, userId: string): Promise<string[]> {
  const rows = await db.query<{ medal: string | null }>('select medal from public.explorer_progress where user_id = $1', [userId]);
  const rank = (m: string | null) => ['bronze', 'silver', 'gold', 'platinum'].indexOf(m ?? '') + 1;
  if (rows.length < 12) return [];
  const min = Math.min(...rows.map((r) => rank(r.medal)));
  return [...(min >= 1 ? ['explorer_all_bronze'] : []), ...(min >= 3 ? ['explorer_all_gold'] : []), ...(min >= 4 ? ['explorer_all_platinum'] : [])];
}

export function streakCodes(level: 'district' | 'village', streak: number): string[] {
  if (level === 'village') return streak >= 5 ? ['village_streak_5'] : [];
  return [...(streak >= 10 ? ['streak_10'] : []), ...(streak >= 25 ? ['streak_25'] : [])];
}

export function rankCodes(rating: number): string[] {
  const d = divisionForRating(rating);
  const order = ['bronze', 'silver', 'gold', 'master', 'champion'];
  const i = order.indexOf(d);
  return [...(i >= 2 ? ['rank_gold'] : []), ...(i >= 3 ? ['rank_master'] : [])];
}
