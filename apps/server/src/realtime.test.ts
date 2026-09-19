import type { AddressInfo } from 'node:net';
import type { Ack, ClientToServer, MatchState, PartyState, ServerToClient } from '@tg/shared';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RealtimeHub } from './realtime/hub.ts';
import type { Match } from './realtime/match.ts';
import { createTestEnv, type TestClient, type TestEnv } from './test-utils.ts';

type Client = Socket<ServerToClient, ClientToServer>;

let env: TestEnv;
let hub: RealtimeHub;
let url: string;

beforeAll(async () => {
  env = await createTestEnv();
  hub = new RealtimeHub(env.app.server, env.db, env.auth, {
    timings: { countdownMs: 30, resultMs: 60, afterFirstGuessMs: 250, maxRounds: 40 },
    matchmakingIntervalMs: 50,
    partyGraceMs: 200,
  });
  await env.app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(env.app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  hub?.close();
  await env?.close();
});

interface Player {
  api: TestClient;
  socket: Client;
  states: MatchState[];
  party: PartyState | null;
  call<T>(event: string, payload?: unknown): Promise<T>;
  waitFor(pred: (s: MatchState) => boolean, ms?: number): Promise<MatchState>;
}

async function connect(): Promise<Player> {
  const api = await env.guest();
  const socket: Client = io(url, { auth: { token: api.token }, transports: ['websocket'], forceNew: true });
  const p: Player = {
    api,
    socket,
    states: [],
    party: null,
    call<T>(event: string, payload?: unknown) {
      return new Promise<T>((resolve, reject) => {
        const ack: Ack<T> = (res) => (res.ok ? resolve(res.data) : reject(new Error(res.error)));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (payload === undefined) (socket.emit as any)(event, ack);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        else (socket.emit as any)(event, payload, ack);
      });
    },
    waitFor(pred, ms = 5000) {
      const hit = p.states.findLast(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for match state')), ms);
        const on = (s: MatchState) => {
          if (pred(s)) {
            clearTimeout(t);
            socket.off('match:state', on);
            resolve(s);
          }
        };
        socket.on('match:state', on);
      });
    },
  };
  socket.on('match:state', (s) => p.states.push(s));
  socket.on('party:state', (s) => (p.party = s));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return p;
}

const matchOf = (id: string) => (hub as unknown as { matches: Map<string, Match> }).matches.get(id)!;
const answer = (id: string) => {
  const r = matchOf(id).round!;
  return { lat: r.loc.lat, lng: r.loc.lng, region: (r as unknown as { answerRegion: string }).answerRegion };
};
const guessing = (roundNo: number) => (s: MatchState) => s.round?.roundNo === roundNo && s.round.phase === 'guessing';

describe('parties', () => {
  it('creates, joins and configures a party', async () => {
    const host = await connect();
    const guest = await connect();
    const party = await host.call<PartyState>('party:create');
    const joined = await guest.call<PartyState>('party:join', { code: party.code });
    expect(joined.members.map((m) => m.id).sort()).toEqual([host.api.userId, guest.api.userId].sort());
    await expect(guest.call('party:config', { mode: 'br_distance' })).rejects.toThrow(/host/);
    const updated = await host.call<PartyState>('party:config', { mode: 'br_distance', lives: 2, mapSlug: 'daan' });
    expect(updated.config).toMatchObject({ mode: 'br_distance', lives: 2, mapSlug: 'daan' });
    await expect(host.call('party:config', { mapSlug: 'nope' })).rejects.toThrow();
    await guest.call('party:leave');
    await new Promise((r) => setTimeout(r, 50));
    expect(host.party?.members).toHaveLength(1);
    host.socket.close();
    guest.socket.close();
  });

  it('keeps a disconnected member only for the grace period', async () => {
    const host = await connect();
    const guest = await connect();
    const party = await host.call<PartyState>('party:create');
    await guest.call('party:join', { code: party.code });
    guest.socket.close();
    await new Promise((r) => setTimeout(r, 80));
    expect(host.party?.members.find((m) => m.id === guest.api.userId)?.connected).toBe(false);
    await new Promise((r) => setTimeout(r, 300));
    expect(host.party?.members).toHaveLength(1);
    host.socket.close();
  });
});

describe('duels', () => {
  it('plays a duel to the end and records the result', async () => {
    const a = await connect();
    const b = await connect();
    const party = await a.call<PartyState>('party:create');
    await b.call('party:join', { code: party.code });
    await a.call('party:config', { mode: 'duels', timeLimitSec: 0 });
    const { matchId } = await a.call<{ matchId: string }>('party:start');

    let s = await a.waitFor(guessing(1));
    expect(s.round?.pano?.panoId).toBeTruthy();
    expect(s.round?.result).toBeNull();
    expect(JSON.stringify(s)).not.toContain(String(answer(matchId).lat));

    for (let round = 1; round <= 2; round++) {
      await a.waitFor(guessing(round));
      const ans = answer(matchId);
      await a.call('match:guess', { matchId, roundNo: round, guess: ans });
      // b sees that a has guessed, then misses by a lot.
      await b.waitFor((x) => x.round?.roundNo === round && x.players.find((p) => p.id === a.api.userId)!.done);
      await b.call('match:guess', { matchId, roundNo: round, guess: null });
      s = await a.waitFor((x) => x.round?.roundNo === round && x.round.phase === 'result');
      expect(s.round!.result!.damage).toMatchObject({ team: 'blue', amount: 5000 });
    }
    s = await a.waitFor((x) => x.status === 'finished');
    expect(s.winner?.team).toBe('red');
    expect(s.teams.find((t) => t.id === 'blue')!.hp).toBe(0);
    expect(s.xp?.[a.api.userId]).toBe(100);

    const rows = await env.db.query<{ user_id: string; placement: number }>('select user_id, placement from public.match_players where match_id = $1', [matchId]);
    expect(rows.find((r) => r.user_id === a.api.userId)?.placement).toBe(1);
    const ach = await env.db.one('select 1 from public.user_achievements where user_id = $1 and code = $2', [a.api.userId, 'duel_win']);
    expect(ach).not.toBeNull();
    // The party returns to the lobby.
    await new Promise((r) => setTimeout(r, 50));
    expect(a.party?.matchId).toBeNull();
    a.socket.close();
    b.socket.close();
  });

  it('gives the others a short countdown after the first guess', async () => {
    const a = await connect();
    const b = await connect();
    const party = await a.call<PartyState>('party:create');
    await b.call('party:join', { code: party.code });
    await a.call('party:config', { mode: 'duels', timeLimitSec: 0 });
    const { matchId } = await a.call<{ matchId: string }>('party:start');
    await a.waitFor(guessing(1));
    const ans = answer(matchId);
    await a.call('match:guess', { matchId, roundNo: 1, guess: { lat: ans.lat + 0.01, lng: ans.lng } });
    const s = await b.waitFor((x) => x.round?.deadline !== null && x.round?.roundNo === 1);
    expect(new Date(s.round!.deadline!).getTime() - Date.now()).toBeLessThanOrEqual(300);
    // b never guesses — the round resolves on the countdown.
    const res = await a.waitFor((x) => x.round?.phase === 'result');
    expect(res.round!.result!.guesses.find((g) => g.playerId === b.api.userId)?.guess).toBeNull();
    await a.call('match:leave', { matchId });
    const fin = await b.waitFor((x) => x.status === 'finished');
    expect(fin.winner?.team).toBe('blue'); // a forfeited
    a.socket.close();
    b.socket.close();
  });

  it('matches two queued players for ranked and updates ratings', async () => {
    const a = await connect();
    const b = await connect();
    const found = new Promise<string>((resolve) => a.socket.once('match:found', (p) => resolve(p.matchId)));
    await a.call('queue:join');
    await b.call('queue:join');
    const matchId = await found;
    await a.waitFor(guessing(1));
    expect(matchOf(matchId).ranked).toBe(true);
    await b.call('match:leave', { matchId });
    const fin = await a.waitFor((x) => x.status === 'finished');
    expect(fin.ratingChanges?.find((r) => r.playerId === a.api.userId)).toMatchObject({ before: 1000, after: 1020 });
    const p = await env.db.one<{ rating: number; ranked_games: number }>('select rating, ranked_games from public.profiles where id = $1', [b.api.userId]);
    expect(p).toEqual({ rating: 980, ranked_games: 1 });
    a.socket.close();
    b.socket.close();
  });
});

describe('battle royale', () => {
  it('eliminates the farthest players until one is left', async () => {
    const ps = await Promise.all([connect(), connect(), connect()]);
    const [host, ...rest] = ps as [Player, Player, Player];
    const party = await host.call<PartyState>('party:create');
    for (const p of rest) await p.call('party:join', { code: party.code });
    await host.call('party:config', { mode: 'br_distance', lives: 1, timeLimitSec: 0 });
    const { matchId } = await host.call<{ matchId: string }>('party:start');

    for (let round = 1; round <= 2; round++) {
      await host.waitFor(guessing(round));
      const ans = answer(matchId);
      const alive = matchOf(matchId).alive.map((p) => p.id);
      for (const [i, p] of ps.entries()) {
        if (!alive.includes(p.api.userId)) continue;
        await p.call('match:guess', { matchId, roundNo: round, guess: { lat: ans.lat + i * 0.01, lng: ans.lng } });
      }
      const s = await host.waitFor((x) => x.round?.roundNo === round && x.round.phase === 'result');
      expect(s.round!.result!.livesLost).toHaveLength(1);
    }
    const fin = await host.waitFor((x) => x.status === 'finished');
    expect(fin.winner?.playerId).toBe(host.api.userId);
    expect(fin.players.map((p) => [p.id, p.placement])).toEqual(
      expect.arrayContaining([
        [ps[0]!.api.userId, 1],
        [ps[1]!.api.userId, 2],
        [ps[2]!.api.userId, 3],
      ]),
    );
    for (const p of ps) p.socket.close();
  });

  it('handles region guesses with limited attempts', async () => {
    const a = await connect();
    const b = await connect();
    const party = await a.call<PartyState>('party:create');
    await b.call('party:join', { code: party.code });
    await a.call('party:config', { mode: 'br_district', lives: 1, timeLimitSec: 0 });
    const { matchId } = await a.call<{ matchId: string }>('party:start');
    await a.waitFor(guessing(1));
    const ans = answer(matchId);
    expect(ans.region).toMatch(/^63000\d{3}$/);
    const wrong = ans.region === '63000010' ? '63000020' : '63000010';
    const after = await b.call<MatchState>('match:guess', { matchId, roundNo: 1, guess: null, region: wrong });
    expect(after.round?.attemptsLeft).toBe(0); // district mode: one attempt
    await a.call('match:guess', { matchId, roundNo: 1, guess: ans, region: ans.region });
    const fin = await a.waitFor((x) => x.status === 'finished');
    expect(fin.winner?.playerId).toBe(a.api.userId);
    expect(fin.history[0]!.guesses.find((g) => g.playerId === a.api.userId)?.correct).toBe(true);
    a.socket.close();
    b.socket.close();
  });
});
