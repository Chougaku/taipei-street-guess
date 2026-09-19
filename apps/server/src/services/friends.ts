import { levelFromXp, type FriendshipState, type PublicProfile, type UserRef } from '@tg/shared';
import type { Db } from '../db.ts';
import { badRequest, notFound } from '../errors.ts';
import { friendshipState, PUBLIC_PROFILE_COLUMNS, toPublicProfile } from './users.ts';

export interface FriendsList {
  friends: PublicProfile[];
  incoming: UserRef[];
  outgoing: UserRef[];
}

const toRef = (r: { id: string; nickname: string; avatar: string; xp: number }): UserRef => ({
  id: r.id,
  nickname: r.nickname,
  avatar: r.avatar,
  level: levelFromXp(r.xp),
});

/** Sends a friend request, or accepts it if the other player already asked. */
export async function addFriend(db: Db, userId: string, otherId: string): Promise<FriendshipState> {
  if (userId === otherId) throw badRequest("You can't befriend yourself");
  const exists = await db.one('select 1 from public.profiles where id = $1', [otherId]);
  if (!exists) throw notFound('Player');
  const state = await friendshipState(db, userId, otherId);
  if (state === 'incoming') {
    await db.query(`update public.friendships set status = 'accepted' where requester_id = $1 and addressee_id = $2`, [otherId, userId]);
    return 'friends';
  }
  if (state === 'none') {
    await db.query('insert into public.friendships (requester_id, addressee_id) values ($1, $2) on conflict do nothing', [userId, otherId]);
    return 'outgoing';
  }
  return state;
}

export async function addFriendByCode(db: Db, userId: string, code: string): Promise<{ userId: string; state: FriendshipState }> {
  const other = await db.one<{ id: string }>('select id from public.profiles where friend_code = $1', [code.trim().toUpperCase()]);
  if (!other) throw notFound('Player');
  return { userId: other.id, state: await addFriend(db, userId, other.id) };
}

/** Removes a friend, cancels an outgoing request or declines an incoming one. */
export async function removeFriend(db: Db, userId: string, otherId: string) {
  await db.query(
    `delete from public.friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)`,
    [userId, otherId],
  );
}

export async function friendIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `select case when requester_id = $1 then addressee_id else requester_id end as id
     from public.friendships where status = 'accepted' and (requester_id = $1 or addressee_id = $1)`,
    [userId],
  );
  return rows.map((r) => r.id);
}

export async function listFriends(db: Db, userId: string, isOnline?: (id: string) => boolean): Promise<FriendsList> {
  const friends = await db.query<Parameters<typeof toPublicProfile>[0]>(
    `select ${PUBLIC_PROFILE_COLUMNS} from public.profiles p
     where p.id in (select case when requester_id = $1 then addressee_id else requester_id end
                    from public.friendships where status = 'accepted' and (requester_id = $1 or addressee_id = $1))
     order by p.last_seen_at desc`,
    [userId],
  );
  const pending = await db.query<{ id: string; nickname: string; avatar: string; xp: number; incoming: boolean }>(
    `select p.id, p.nickname, p.avatar, p.xp, f.addressee_id = $1 as incoming
     from public.friendships f join public.profiles p on p.id = case when f.requester_id = $1 then f.addressee_id else f.requester_id end
     where f.status = 'pending' and (f.requester_id = $1 or f.addressee_id = $1)
     order by f.created_at desc`,
    [userId],
  );
  return {
    friends: friends
      .map((f) => toPublicProfile(f, isOnline?.(f.id) || undefined))
      .sort((a, b) => Number(b.online) - Number(a.online)),
    incoming: pending.filter((p) => p.incoming).map(toRef),
    outgoing: pending.filter((p) => !p.incoming).map(toRef),
  };
}

export async function searchPlayers(db: Db, query: string, viewerId: string): Promise<UserRef[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await db.query<{ id: string; nickname: string; avatar: string; xp: number }>(
    `select id, nickname, avatar, xp from public.profiles
     where id <> $2 and (lower(nickname) like lower($1) || '%' or friend_code = upper($1))
     order by xp desc limit 20`,
    [q.replace(/[%_\\]/g, (c) => `\\${c}`), viewerId],
  );
  return rows.map(toRef);
}
