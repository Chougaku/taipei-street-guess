import { levelFromXp, type LeaderboardEntry } from '@tg/shared';
import type { Db } from '../db.ts';
import { getMapBySlug } from './maps.ts';

export type Period = 'day' | 'week' | 'all';
const PERIOD_SQL: Record<Period, string> = {
  day: "now() - interval '1 day'",
  week: "now() - interval '7 days'",
  all: "'-infinity'::timestamptz",
};

interface Row {
  user_id: string;
  nickname: string;
  avatar: string;
  xp: number;
  score: number;
  extra: number | null;
  game_id: string | null;
}

function rank(rows: Row[], userId: string | null, limit: number): { entries: LeaderboardEntry[]; me: LeaderboardEntry | null } {
  const toEntry = (r: Row, i: number): LeaderboardEntry => ({
    rank: i + 1,
    user: { id: r.user_id, nickname: r.nickname, avatar: r.avatar, level: levelFromXp(r.xp) },
    score: r.score,
    extra: r.extra,
    gameId: r.game_id,
  });
  const mi = userId ? rows.findIndex((r) => r.user_id === userId) : -1;
  return { entries: rows.slice(0, limit).map(toEntry), me: mi >= 0 ? toEntry(rows[mi]!, mi) : null };
}

/** Optional restriction to the viewer and their accepted friends. */
function friendsFilter(param: string): string {
  return `and (g.user_id = ${param} or g.user_id in (
    select case when f.requester_id = ${param} then f.addressee_id else f.requester_id end
    from public.friendships f where f.status = 'accepted' and (f.requester_id = ${param} or f.addressee_id = ${param})))`;
}

/** Best finished game per player on a map. */
export async function mapLeaderboard(db: Db, slug: string, opts: { period: Period; userId: string | null; friends: boolean; limit?: number }) {
  const map = await getMapBySlug(db, slug, opts.userId);
  const rows = await db.query<Row>(
    `select distinct on (g.user_id) g.user_id, p.nickname, p.avatar, p.xp, g.total_score as score,
       (select sum(r.time_ms)::int from public.game_rounds r where r.game_id = g.id) as extra, g.id as game_id
     from public.games g join public.profiles p on p.id = g.user_id
     where g.map_id = $1 and g.status = 'finished' and g.finished_at > ${PERIOD_SQL[opts.period]}
       ${opts.friends && opts.userId ? friendsFilter('$2') : ''}
     order by g.user_id, g.total_score desc, g.finished_at asc`,
    opts.friends && opts.userId ? [map.id, opts.userId] : [map.id],
  );
  rows.sort((a, b) => b.score - a.score || (a.extra ?? Infinity) - (b.extra ?? Infinity));
  return rank(rows, opts.userId, opts.limit ?? 100);
}

export async function xpLeaderboard(db: Db, opts: { userId: string | null; friends: boolean; limit?: number }) {
  const rows = await db.query<Row>(
    `select p.id as user_id, p.nickname, p.avatar, p.xp, p.xp as score, null::int as extra, null::uuid as game_id
     from public.profiles p
     where p.xp > 0 ${opts.friends && opts.userId ? friendsFilter('$1').replaceAll('g.user_id', 'p.id') : ''}
     order by p.xp desc limit 1000`,
    opts.friends && opts.userId ? [opts.userId] : [],
  );
  return rank(rows, opts.userId, opts.limit ?? 100);
}

export async function streakLeaderboard(db: Db, level: 'district' | 'village', opts: { period: Period; userId: string | null; friends: boolean; limit?: number }) {
  const rows = await db.query<Row>(
    `select distinct on (g.user_id) g.user_id, p.nickname, p.avatar, p.xp, g.streak as score, null::int as extra, null::uuid as game_id
     from public.streak_runs g join public.profiles p on p.id = g.user_id
     where g.level = $1 and g.status = 'finished' and g.streak > 0 and g.finished_at > ${PERIOD_SQL[opts.period]}
       ${opts.friends && opts.userId ? friendsFilter('$2') : ''}
     order by g.user_id, g.streak desc`,
    opts.friends && opts.userId ? [level, opts.userId] : [level],
  );
  rows.sort((a, b) => b.score - a.score);
  return rank(rows, opts.userId, opts.limit ?? 100);
}

export async function ratingLeaderboard(db: Db, opts: { userId: string | null; friends: boolean; limit?: number }) {
  const rows = await db.query<Row>(
    `select p.id as user_id, p.nickname, p.avatar, p.xp, p.rating as score, p.ranked_games as extra, null::uuid as game_id
     from public.profiles p
     where p.ranked_games > 0 ${opts.friends && opts.userId ? friendsFilter('$1').replaceAll('g.user_id', 'p.id') : ''}
     order by p.rating desc limit 1000`,
    opts.friends && opts.userId ? [opts.userId] : [],
  );
  return rank(rows, opts.userId, opts.limit ?? 100);
}
