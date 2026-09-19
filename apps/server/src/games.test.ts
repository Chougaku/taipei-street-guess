import type { GameView, GuessResponse, MapSummary, Profile } from '@tg/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GRACE_MS } from './services/games.ts';
import { createTestEnv, type TestEnv } from './test-utils.ts';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => env?.close());

const answerOf = async (gameId: string, roundNo: number) =>
  (await env.db.one<{ lat: number; lng: number; district_code: string }>(
    'select lat, lng, district_code from public.game_rounds where game_id = $1 and round_no = $2',
    [gameId, roundNo],
  ))!;

describe('maps', () => {
  it('lists the city map and 12 district maps', async () => {
    const c = await env.guest();
    const { status, body } = await c.get<MapSummary[]>('/api/maps/official');
    expect(status).toBe(200);
    expect(body).toHaveLength(13);
    expect(body[0]!.slug).toBe('taipei');
    expect(body[0]!.locationCount).toBe(300);
    expect(body.find((m) => m.slug === 'daan')!.locationCount).toBe(25);
    expect(body.find((m) => m.slug === 'daan')!.diagonalKm).toBeLessThan(body[0]!.diagonalKm);
  });
});

describe('auth', () => {
  it('rejects requests without a token', async () => {
    const res = await env.app.inject({ method: 'POST', url: '/api/games', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('creates a guest profile automatically', async () => {
    const c = await env.guest();
    const { body } = await c.get<Profile>('/api/me');
    expect(body.id).toBe(c.userId);
    expect(body.isGuest).toBe(true);
    expect(body.nickname).toMatch(/^旅人/);
    expect(body.level).toBe(1);
  });

  it('validates nickname updates', async () => {
    const a = await env.guest();
    const b = await env.guest();
    expect((await a.patch<Profile>('/api/me', { nickname: '台北通' })).body.nickname).toBe('台北通');
    expect((await b.patch('/api/me', { nickname: '台北通' })).status).toBe(409);
    expect((await b.patch('/api/me', { nickname: 'x' })).status).toBe(400);
  });
});

describe('classic game', () => {
  it('plays a full 5-round game without leaking answers', async () => {
    const c = await env.guest();
    const created = await c.post<GameView>('/api/games', { mapSlug: 'taipei', settings: { timeLimitSec: 0, movement: 'moving' } });
    expect(created.status).toBe(200);
    let game = created.body;
    expect(game.current?.roundNo).toBe(1);
    expect(JSON.stringify(game.current)).not.toMatch(/"lat"/);

    const districts = new Set<string>();
    for (let n = 1; n <= 5; n++) {
      const answer = await answerOf(game.id, n);
      districts.add(answer.district_code);
      // Perfect guess on odd rounds, ~1 km off on even rounds.
      const guess = n % 2 ? answer : { lat: answer.lat + 0.009, lng: answer.lng };
      const res = await c.post<GuessResponse>(`/api/games/${game.id}/guess`, { roundNo: n, guess });
      expect(res.status).toBe(200);
      expect(res.body.result.answer.lat).toBeCloseTo(answer.lat, 6);
      if (n % 2) expect(res.body.result.score).toBe(5000);
      else expect(res.body.result.score).toBeGreaterThan(3500);
      game = res.body.game;
      if (n < 5) {
        expect(game.current).toBeNull();
        game = (await c.post<GameView>(`/api/games/${game.id}/next`)).body;
        expect(game.current?.roundNo).toBe(n + 1);
      }
    }
    expect(districts.size).toBe(5); // whole-city map avoids repeating a district
    expect(game.status).toBe('finished');
    expect(game.rounds).toHaveLength(5);
    expect(game.totalScore).toBe(game.rounds.reduce((s, r) => s + r.score, 0));
    expect(game.xpGained).toBe(Math.round(game.totalScore / 100));
    expect((await c.get<Profile>('/api/me')).body.xp).toBe(game.xpGained);
  });

  it('rejects double guesses and wrong rounds', async () => {
    const c = await env.guest();
    const { body: game } = await c.post<GameView>('/api/games', { mapSlug: 'daan', settings: { timeLimitSec: 0, movement: 'nmpz' } });
    expect((await c.post(`/api/games/${game.id}/guess`, { roundNo: 2, guess: null })).status).toBe(409);
    expect((await c.post(`/api/games/${game.id}/guess`, { roundNo: 1, guess: { lat: 25.03, lng: 121.54 } })).status).toBe(200);
    expect((await c.post(`/api/games/${game.id}/guess`, { roundNo: 1, guess: { lat: 25.03, lng: 121.54 } })).status).toBe(409);
  });

  it('keeps district maps inside their district', async () => {
    const c = await env.guest();
    const { body: game } = await c.post<GameView>('/api/games', { mapSlug: 'beitou', settings: { timeLimitSec: 0, movement: 'moving' } });
    const rows = await env.db.query<{ district_code: string }>('select district_code from public.game_rounds where game_id = $1', [game.id]);
    expect(rows.every((r) => r.district_code === '63000120')).toBe(true);
  });

  it("does not let other players read someone's game", async () => {
    const a = await env.guest();
    const b = await env.guest();
    const { body: game } = await a.post<GameView>('/api/games', { mapSlug: 'taipei', settings: { timeLimitSec: 0, movement: 'moving' } });
    expect((await b.get(`/api/games/${game.id}`)).status).toBe(404);
  });

  it('scores late guesses as timeouts', async () => {
    const c = await env.guest();
    const { body: game } = await c.post<GameView>('/api/games', { mapSlug: 'taipei', settings: { timeLimitSec: 10, movement: 'moving' } });
    expect(game.current?.deadline).not.toBeNull();
    await env.db.query(
      `update public.game_rounds set deadline = now() - make_interval(secs => $2::float8) where game_id = $1 and round_no = 1`,
      [game.id, GRACE_MS / 1000 + 1],
    );
    const answer = await answerOf(game.id, 1);
    const res = await c.post<GuessResponse>(`/api/games/${game.id}/guess`, { roundNo: 1, guess: answer });
    expect(res.body.result.score).toBe(0);
    expect(res.body.result.timedOut).toBe(true);
  });

  it('settles expired rounds when the game is reloaded', async () => {
    const c = await env.guest();
    const { body: game } = await c.post<GameView>('/api/games', { mapSlug: 'taipei', settings: { timeLimitSec: 30, movement: 'moving' } });
    await env.db.query(`update public.game_rounds set deadline = now() - interval '1 minute' where game_id = $1`, [game.id]);
    const { body } = await c.get<GameView>(`/api/games/${game.id}`);
    expect(body.current).toBeNull();
    expect(body.rounds[0]!.timedOut).toBe(true);
  });

  it('replaces a round whose panorama fails to load', async () => {
    const c = await env.guest();
    const { body: game } = await c.post<GameView>('/api/games', { mapSlug: 'xinyi', settings: { timeLimitSec: 0, movement: 'moving' } });
    const before = game.current!.pano.panoId;
    const res = await c.post<GameView>(`/api/games/${game.id}/rounds/1/replace`);
    expect(res.status).toBe(200);
    expect(res.body.current!.pano.panoId).not.toBe(before);
    const report = await env.db.one('select * from public.location_reports where pano_id = $1', [before]);
    expect(report).not.toBeNull();
  });

  it('records explorer medals on district maps only', async () => {
    const c = await env.guest();
    expect((await c.post('/api/games', { mapSlug: 'taipei', mode: 'explorer', settings: { timeLimitSec: 0, movement: 'moving' } })).status).toBe(400);
    let { body: game } = await c.post<GameView>('/api/games', { mapSlug: 'wanhua', mode: 'explorer', settings: { timeLimitSec: 0, movement: 'moving' } });
    for (let n = 1; n <= 5; n++) {
      const answer = await answerOf(game.id, n);
      game = (await c.post<GuessResponse>(`/api/games/${game.id}/guess`, { roundNo: n, guess: answer })).body.game;
      if (n < 5) game = (await c.post<GameView>(`/api/games/${game.id}/next`)).body;
    }
    expect(game.totalScore).toBe(25000);
    const progress = await env.db.one<{ medal: string }>('select medal from public.explorer_progress where user_id = $1', [c.userId]);
    expect(progress?.medal).toBe('platinum');
  });
});
