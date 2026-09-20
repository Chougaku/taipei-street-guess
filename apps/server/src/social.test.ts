import { dailySettingsFor, previousDay, taipeiDay, type ChallengeInfo, type ChallengeResults, type GameView, type GuessResponse, type LeaderboardEntry, type ProfilePage } from '@tg/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from './test-utils.ts';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => env?.close());

/** Plays a game to the end; `offsetDeg` moves every guess north of the answer. */
async function playThrough(c: TestClient, game: GameView, offsetDeg = 0): Promise<GameView> {
  let g = game;
  for (let n = g.currentRound; n <= g.roundCount; n++) {
    const a = (await env.db.one<{ lat: number; lng: number }>('select lat, lng from public.game_rounds where game_id = $1 and round_no = $2', [g.id, n]))!;
    const res = await c.post<GuessResponse>(`/api/games/${g.id}/guess`, { roundNo: n, guess: { lat: a.lat + offsetDeg, lng: a.lng } });
    expect(res.status).toBe(200);
    g = res.body.game;
    if (n < g.roundCount) g = (await c.post<GameView>(`/api/games/${g.id}/next`)).body;
  }
  return g;
}

const newGame = async (c: TestClient, slug = 'taipei') =>
  (await c.post<GameView>('/api/games', { mapSlug: slug, settings: { timeLimitSec: 0, movement: 'moving' } })).body;

describe('achievements', () => {
  it('unlocks achievements when a game finishes', async () => {
    const c = await env.guest();
    const g = await playThrough(c, await newGame(c));
    expect(g.newAchievements).toEqual(expect.arrayContaining(['first_game', 'perfect_round', 'score_20k', 'score_24k']));
    // Not repeated for the next game.
    const g2 = await playThrough(c, await newGame(c), 0.5);
    expect(g2.newAchievements).not.toContain('first_game');
  });
});

describe('challenges', () => {
  it('lets friends play the same locations and compares results', async () => {
    const host = await env.guest();
    const friend = await env.guest();
    const hostGame = await playThrough(host, await newGame(host), 0.001);

    const { body: ch } = await host.post<ChallengeInfo>(`/api/games/${hostGame.id}/challenge`);
    expect(ch.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(ch.myStatus).toBe('finished');
    expect(ch.players).toBe(1);

    // Before playing, the friend sees the board but not the guesses.
    const before = await friend.get<ChallengeResults>(`/api/challenges/${ch.code}/results`);
    expect(before.body.entries).toHaveLength(1);
    expect(before.body.entries[0]!.rounds).toBeNull();

    const { body: fg } = await friend.post<GameView>(`/api/challenges/${ch.code}/play`);
    expect(fg.mode).toBe('challenge');
    const hostPanos = (await env.db.query<{ pano_id: string }>('select pano_id from public.game_rounds where game_id = $1 order by round_no', [hostGame.id])).map((r) => r.pano_id);
    const friendPanos = (await env.db.query<{ pano_id: string }>('select pano_id from public.game_rounds where game_id = $1 order by round_no', [fg.id])).map((r) => r.pano_id);
    expect(friendPanos).toEqual(hostPanos);

    // Playing again returns the same game (one attempt per player).
    expect((await friend.post<GameView>(`/api/challenges/${ch.code}/play`)).body.id).toBe(fg.id);

    await playThrough(friend, fg);
    const after = await friend.get<ChallengeResults>(`/api/challenges/${ch.code}/results`);
    expect(after.body.entries).toHaveLength(2);
    expect(after.body.entries[0]!.user.id).toBe(friend.userId);
    expect(after.body.entries[0]!.rounds).toHaveLength(5);
    expect(after.body.me?.rank).toBe(1);
  });

  it('creates a challenge from map settings', async () => {
    const c = await env.guest();
    const { status, body } = await c.post<ChallengeInfo>('/api/challenges', { mapSlug: 'daan', settings: { timeLimitSec: 60, movement: 'nmpz' } });
    expect(status).toBe(200);
    expect(body.settings).toEqual({ timeLimitSec: 60, movement: 'nmpz' });
    expect(body.map.slug).toBe('daan');
    expect(body.myStatus).toBe('none');
    expect((await c.get(`/api/challenges/NOPE1234`)).status).toBe(404);
  });
});

describe('daily challenge', () => {
  it('is the same for everyone, playable once, and builds a streak', async () => {
    const a = await env.guest();
    const b = await env.guest();
    const { body: info } = await a.get<ChallengeInfo>('/api/daily');
    expect(info.kind).toBe('daily');
    expect(info.day).toBe(taipeiDay());
    expect(info.settings).toEqual(dailySettingsFor(taipeiDay()));
    expect((await b.get<ChallengeInfo>('/api/daily')).body.code).toBe(info.code);

    const { body: game } = await a.post<GameView>('/api/daily/play');
    expect(game.mode).toBe('daily');
    // Pretend the player also played yesterday.
    await env.db.query('update public.profiles set daily_streak = 3, last_daily_day = $2::date where id = $1', [a.userId, previousDay(taipeiDay())]);
    const done = await playThrough(a, game);
    expect(done.xpGained).toBe(Math.round(done.totalScore / 100) + 50);
    expect(done.newAchievements).toContain('daily_first');
    const p = await env.db.one<{ daily_streak: number }>('select daily_streak from public.profiles where id = $1', [a.userId]);
    expect(p?.daily_streak).toBe(4);

    const results = await a.get<ChallengeResults>('/api/daily/results');
    expect(results.body.me?.score).toBe(done.totalScore);
  });
});

describe('leaderboards and profiles', () => {
  it('ranks best games per player on a map', async () => {
    const good = await env.guest();
    const bad = await env.guest();
    await playThrough(good, await newGame(good, 'songshan'));
    await playThrough(bad, await newGame(bad, 'songshan'), 0.02);
    await playThrough(bad, await newGame(bad, 'songshan'), 0.05); // worse; shouldn't replace the best
    const { body } = await bad.get<{ entries: LeaderboardEntry[]; me: LeaderboardEntry | null }>('/api/leaderboards/maps/songshan?period=week');
    expect(body.entries[0]!.user.id).toBe(good.userId);
    expect(body.entries.filter((e) => e.user.id === bad.userId)).toHaveLength(1);
    expect(body.me?.rank).toBe(2);

    const friendsOnly = await bad.get<{ entries: LeaderboardEntry[] }>('/api/leaderboards/maps/songshan?friends=1');
    expect(friendsOnly.body.entries.map((e) => e.user.id)).toEqual([bad.userId]);
  });

  it('builds a profile page with stats', async () => {
    const c = await env.guest();
    const viewer = await env.guest();
    await playThrough(c, await newGame(c));
    const { body } = await viewer.get<ProfilePage>(`/api/users/${c.userId}`);
    expect(body.profile.id).toBe(c.userId);
    expect(body.stats.gamesPlayed).toBe(1);
    expect(body.stats.perfectRounds).toBe(5);
    expect(body.stats.bestScore).toBe(25_000);
    expect(body.recentGames).toHaveLength(1);
    expect(body.achievements.map((a) => a.code)).toContain('first_game');
    expect(body.friendship).toBe('none');
    expect((await c.get<ProfilePage>(`/api/users/${c.userId}`)).body.friendship).toBe('self');
  });
});

describe('friends', () => {
  it('sends, accepts and removes friend requests', async () => {
    const a = await env.guest();
    const b = await env.guest();
    const code = (await b.get<{ friendCode: string }>('/api/me')).body.friendCode;
    const sent = await a.post<{ state: string; userId: string }>('/api/friends/by-code', { code });
    expect(sent.body).toEqual({ userId: b.userId, state: 'outgoing' });

    const bList = await b.get<{ incoming: { id: string }[] }>('/api/friends');
    expect(bList.body.incoming.map((u) => u.id)).toEqual([a.userId]);
    expect((await b.post<{ state: string }>(`/api/friends/${a.userId}`)).body.state).toBe('friends');

    const aList = await a.get<{ friends: { id: string }[] }>('/api/friends');
    expect(aList.body.friends.map((u) => u.id)).toEqual([b.userId]);
    expect((await a.get<ProfilePage>(`/api/users/${b.userId}`)).body.friendship).toBe('friends');

    // Friends-only leaderboards include accepted friends.
    await playThrough(b, await newGame(b, 'datong'));
    const board = await a.get<{ entries: LeaderboardEntry[] }>('/api/leaderboards/maps/datong?friends=1');
    expect(board.body.entries.map((e) => e.user.id)).toEqual([b.userId]);

    await a.del(`/api/friends/${b.userId}`);
    expect((await a.get<{ friends: unknown[] }>('/api/friends')).body.friends).toHaveLength(0);
  });

  it('searches players by nickname', async () => {
    const a = await env.guest();
    const b = await env.guest();
    await b.patch('/api/me', { nickname: '捷運迷123' });
    const res = await a.get<{ id: string }[]>(`/api/players/search?q=${encodeURIComponent('捷運')}`);
    expect(res.body.map((u) => u.id)).toContain(b.userId);
  });
});
