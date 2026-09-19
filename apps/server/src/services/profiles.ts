import { levelFromXp, type Profile } from '@tg/shared';
import type { Db } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';

interface ProfileRow {
  id: string;
  nickname: string;
  avatar: string;
  xp: number;
  rating: number;
  ranked_games: number;
  is_guest: boolean;
  friend_code: string;
  role: string;
  created_at: Date;
}

const PROFILE_COLUMNS = 'id, nickname, avatar, xp, rating, ranked_games, is_guest, friend_code, role, created_at';

export function toProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    nickname: r.nickname,
    avatar: r.avatar,
    xp: r.xp,
    level: levelFromXp(r.xp),
    rating: r.rating,
    rankedGames: r.ranked_games,
    isGuest: r.is_guest,
    friendCode: r.friend_code,
    isAdmin: r.role === 'admin',
    createdAt: r.created_at.toISOString(),
  };
}

export async function getProfile(db: Db, id: string): Promise<Profile> {
  const row = await db.one<ProfileRow>(`select ${PROFILE_COLUMNS} from public.profiles where id = $1`, [id]);
  if (!row) throw notFound('Profile');
  return toProfile(row);
}

export const AVATARS = [
  'pin-red', 'pin-orange', 'pin-yellow', 'pin-green', 'pin-teal', 'pin-blue', 'pin-purple', 'pin-pink',
  'bubble-tea', 'taipei-101', 'mrt', 'scooter', 'temple', 'night-market', 'mountain', 'cat',
] as const;

export async function updateProfile(db: Db, id: string, patch: { nickname?: string; avatar?: string }): Promise<Profile> {
  if (patch.nickname !== undefined) {
    const nickname = patch.nickname.trim();
    if ([...nickname].length < 2 || [...nickname].length > 16) throw badRequest('暱稱需為 2–16 個字', 'invalid_nickname');
    if (/[<>\p{Cc}]/u.test(nickname)) throw badRequest('暱稱含有不允許的字元', 'invalid_nickname');
    const taken = await db.one('select 1 from public.profiles where lower(nickname) = lower($1) and id <> $2', [nickname, id]);
    if (taken) throw conflict('這個暱稱已經有人使用', 'nickname_taken');
    await db.query('update public.profiles set nickname = $2 where id = $1', [id, nickname]);
  }
  if (patch.avatar !== undefined) {
    if (!(AVATARS as readonly string[]).includes(patch.avatar)) throw badRequest('Unknown avatar', 'invalid_avatar');
    await db.query('update public.profiles set avatar = $2 where id = $1', [id, patch.avatar]);
  }
  return getProfile(db, id);
}

export async function touchLastSeen(db: Db, id: string) {
  await db.query('update public.profiles set last_seen_at = now() where id = $1', [id]);
}
