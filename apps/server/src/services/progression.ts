import { medalForScore, medalRank, XP, type GameMode } from '@tg/shared';
import type { Db } from '../db.ts';
import { checkGameAchievements } from './achievements.ts';
import type { MapRow } from './maps.ts';

export async function addXp(db: Db, userId: string, xp: number) {
  if (xp > 0) await db.query('update public.profiles set xp = xp + $2 where id = $1', [userId, xp]);
}

/** Current calendar day in Taipei (UTC+8, no DST) as YYYY-MM-DD. */
export function taipeiDay(now = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

export function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** Awards XP, updates mode-specific progress and achievements for a finished game. */
export async function onGameFinished(
  db: Db,
  game: { id: string; user_id: string; mode: GameMode; total_score: number; map: MapRow; daily_day?: string | null },
): Promise<{ xp: number; achievements: string[] }> {
  let xp = XP.classicGame(game.total_score);

  if (game.mode === 'explorer' && game.map.district_code) {
    const medal = medalForScore(game.total_score);
    const prev = await db.one<{ medal: string | null }>(
      'select medal from public.explorer_progress where user_id = $1 and district_code = $2',
      [game.user_id, game.map.district_code],
    );
    const prevMedal = (prev?.medal ?? null) as Parameters<typeof medalRank>[0];
    const bestMedal = medalRank(medal) > medalRank(prevMedal) ? medal : prevMedal;
    await db.query(
      `insert into public.explorer_progress (user_id, district_code, best_score, medal, games, updated_at)
       values ($1, $2, $3, $4, 1, now())
       on conflict (user_id, district_code) do update set
         best_score = greatest(public.explorer_progress.best_score, excluded.best_score),
         medal = $4, games = public.explorer_progress.games + 1, updated_at = now()`,
      [game.user_id, game.map.district_code, game.total_score, bestMedal],
    );
  }

  if (game.mode === 'daily' && game.daily_day) {
    xp += XP.dailyBonus;
    // Consecutive-day streak: continues if yesterday's daily was played, otherwise restarts at 1.
    await db.query(
      `update public.profiles set
         daily_streak = case when last_daily_day = $2::date then daily_streak + 1
                             when last_daily_day = $3::date then daily_streak else 1 end,
         last_daily_day = greatest(coalesce(last_daily_day, $3::date), $3::date)
       where id = $1`,
      [game.user_id, previousDay(game.daily_day), game.daily_day],
    );
  }

  await addXp(db, game.user_id, xp);
  const achievements = await checkGameAchievements(db, game.user_id);
  return { xp, achievements };
}
