import { levelFromXp, type FriendshipState, type ProfilePage, type PublicProfile, type UserStats } from '@tg/shared';
import type { Db } from '../db.ts';
import { notFound } from '../errors.ts';

/** Seconds since last activity for a player to count as online (the realtime server also tracks sockets). */
const ONLINE_WINDOW_SEC = 120;

interface ProfileRow {
  id: string;
  nickname: string;
  avatar: string;
  xp: number;
  rating: number;
  ranked_games: number;
  is_guest: boolean;
  created_at: Date;
  online: boolean;
  daily_streak: number;
  best_district_streak: number;
  best_village_streak: number;
}

export function toPublicProfile(r: ProfileRow, onlineOverride?: boolean): PublicProfile {
  return {
    id: r.id,
    nickname: r.nickname,
    avatar: r.avatar,
    level: levelFromXp(r.xp),
    xp: r.xp,
    rating: r.rating,
    rankedGames: r.ranked_games,
    isGuest: r.is_guest,
    createdAt: r.created_at.toISOString(),
    online: onlineOverride ?? r.online,
  };
}

export const PUBLIC_PROFILE_COLUMNS = `p.id, p.nickname, p.avatar, p.xp, p.rating, p.ranked_games, p.is_guest, p.created_at,
  p.last_seen_at > now() - interval '${ONLINE_WINDOW_SEC} seconds' as online,
  p.daily_streak, p.best_district_streak, p.best_village_streak`;

export async function friendshipState(db: Db, viewerId: string | null, userId: string): Promise<FriendshipState> {
  if (!viewerId) return 'none';
  if (viewerId === userId) return 'self';
  const f = await db.one<{ requester_id: string; status: string }>(
    `select requester_id, status from public.friendships
     where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)`,
    [viewerId, userId],
  );
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requester_id === viewerId ? 'outgoing' : 'incoming';
}

export async function getProfilePage(db: Db, userId: string, viewerId: string | null, isOnline?: (id: string) => boolean): Promise<ProfilePage> {
  const p = await db.one<ProfileRow>(`select ${PUBLIC_PROFILE_COLUMNS} from public.profiles p where p.id = $1`, [userId]);
  if (!p) throw notFound('Player');

  const s = await db.one<{
    games: number;
    rounds: number;
    avg_score: number | null;
    best: number | null;
    perfect: number;
    avg_distance: number | null;
    duels: number;
    duels_won: number;
    br: number;
    br_won: number;
  }>(
    `select
       (select count(*)::int from public.games where user_id = $1 and status = 'finished') as games,
       (select count(*)::int from public.game_rounds r join public.games g on g.id = r.game_id
          where g.user_id = $1 and r.guessed_at is not null) as rounds,
       (select avg(total_score)::float8 from public.games where user_id = $1 and status = 'finished') as avg_score,
       (select max(total_score)::int from public.games where user_id = $1 and status = 'finished') as best,
       (select count(*)::int from public.game_rounds r join public.games g on g.id = r.game_id
          where g.user_id = $1 and r.score = 5000) as perfect,
       (select avg(r.distance_m)::float8 from public.game_rounds r join public.games g on g.id = r.game_id
          where g.user_id = $1 and r.distance_m is not null) as avg_distance,
       (select count(*)::int from public.match_players mp join public.matches m on m.id = mp.match_id
          where mp.user_id = $1 and m.mode in ('duels', 'team_duels') and m.finished_at is not null) as duels,
       (select count(*)::int from public.match_players mp join public.matches m on m.id = mp.match_id
          where mp.user_id = $1 and m.mode in ('duels', 'team_duels') and mp.placement = 1) as duels_won,
       (select count(*)::int from public.match_players mp join public.matches m on m.id = mp.match_id
          where mp.user_id = $1 and m.mode like 'br_%' and m.finished_at is not null) as br,
       (select count(*)::int from public.match_players mp join public.matches m on m.id = mp.match_id
          where mp.user_id = $1 and m.mode like 'br_%' and mp.placement = 1) as br_won`,
    [userId],
  );
  const stats: UserStats = {
    gamesPlayed: s!.games,
    roundsPlayed: s!.rounds,
    avgScore: Math.round(s!.avg_score ?? 0),
    bestScore: s!.best ?? 0,
    perfectRounds: s!.perfect,
    avgDistanceM: s!.avg_distance,
    dailyStreak: p.daily_streak,
    bestDistrictStreak: p.best_district_streak,
    bestVillageStreak: p.best_village_streak,
    duelsPlayed: s!.duels,
    duelsWon: s!.duels_won,
    brPlayed: s!.br,
    brWon: s!.br_won,
  };

  const achievements = await db.query<{ code: string; unlocked_at: Date }>(
    'select code, unlocked_at from public.user_achievements where user_id = $1 order by unlocked_at desc',
    [userId],
  );
  const explorer = await db.query<{ district_code: string; medal: string | null; best_score: number }>(
    'select district_code, medal, best_score from public.explorer_progress where user_id = $1',
    [userId],
  );
  const recent = await db.query<{ id: string; mode: ProfilePage['recentGames'][number]['mode']; slug: string; name: string; name_en: string; total_score: number; finished_at: Date }>(
    `select g.id, g.mode, m.slug, m.name, m.name_en, g.total_score, g.finished_at
     from public.games g join public.maps m on m.id = g.map_id
     where g.user_id = $1 and g.status = 'finished' order by g.finished_at desc limit 10`,
    [userId],
  );

  return {
    profile: toPublicProfile(p, isOnline?.(userId) || undefined),
    stats,
    achievements: achievements.map((a) => ({ code: a.code, unlockedAt: a.unlocked_at.toISOString() })),
    explorer: explorer.map((e) => ({ districtCode: e.district_code, medal: e.medal, bestScore: e.best_score })),
    recentGames: recent.map((g) => ({
      id: g.id,
      mode: g.mode,
      mapSlug: g.slug,
      mapName: g.name,
      mapNameEn: g.name_en,
      totalScore: g.total_score,
      finishedAt: g.finished_at.toISOString(),
    })),
    friendship: await friendshipState(db, viewerId, userId),
  };
}
