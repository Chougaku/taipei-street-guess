import type { GameView, MapSummary, Profile } from '@tg/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, testPool, type TestEnv } from './test-utils.ts';

let env: TestEnv;
beforeAll(async () => {
  // Fake metadata lookup: snaps to the given point with a synthetic pano id.
  env = await createTestEnv({ resolvePano: async ({ lat, lng }) => ({ panoId: `fake-${lat.toFixed(5)}-${lng.toFixed(5)}`, lat, lng }) });
});
afterAll(async () => env?.close());

const inTaipei = () => testPool().slice(0, 12).map((l) => ({ panoId: l.panoId, lat: l.lat, lng: l.lng, heading: 90 }));

describe('map maker', () => {
  it('creates, fills, publishes and plays a custom map', async () => {
    const owner = await env.guest();
    const { body: map, status } = await owner.post<MapSummary>('/api/maps', { name: '我的捷運站', description: '測試地圖' });
    expect(status).toBe(200);
    expect(map.kind).toBe('custom');
    expect(map.visibility).toBe('private');

    // Too few locations to publish.
    expect((await owner.patch(`/api/maps/${map.id}`, { visibility: 'public' })).status).toBe(409);

    const locations = [
      ...inTaipei(),
      { lat: 25.012, lng: 121.4637 }, // Banqiao (New Taipei) — dropped
      { lat: 25.0339, lng: 121.5645 }, // no pano id — resolved by the fake resolver
      inTaipei()[0]!, // duplicate pano — dropped
    ];
    const saved = await owner.patch<unknown>(`/api/maps/${map.id}`, {}); // no-op patch is fine
    expect(saved.status).toBe(200);
    const put = await env.app.inject({
      method: 'PUT',
      url: `/api/maps/${map.id}/locations`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { locations },
    });
    expect(put.statusCode).toBe(200);
    const res = put.json() as { saved: number; skipped: number; map: MapSummary };
    expect(res.saved).toBe(13);
    expect(res.skipped).toBe(2);
    expect(res.map.locationCount).toBe(13);
    expect(res.map.diagonalKm).toBeGreaterThan(1);

    const pub = await owner.patch<MapSummary>(`/api/maps/${map.id}`, { visibility: 'public' });
    expect(pub.body.visibility).toBe('public');
    const ach = await env.db.one('select 1 from public.user_achievements where user_id = $1 and code = $2', [owner.userId, 'map_maker']);
    expect(ach).not.toBeNull();

    // Others can find, like and play it, but not edit it.
    const player = await env.guest();
    const list = await player.get<MapSummary[]>('/api/maps?sort=new');
    expect(list.body.map((m) => m.id)).toContain(map.id);
    expect((await player.post<{ likes: number }>(`/api/maps/${map.id}/like`)).body.likes).toBe(1);
    expect((await player.get<{ likedByMe: boolean }>(`/api/maps/${map.slug}`)).body.likedByMe).toBe(true);
    expect((await player.patch(`/api/maps/${map.id}`, { name: 'hacked' })).status).toBe(403);
    expect((await player.get(`/api/maps/${map.id}/locations`)).status).toBe(403);

    const game = await player.post<GameView>('/api/games', { mapSlug: map.slug, settings: { timeLimitSec: 0, movement: 'moving' } });
    expect(game.status).toBe(200);
    const panos = await env.db.query<{ pano_id: string }>('select pano_id from public.game_rounds where game_id = $1', [game.body.id]);
    const mapPanos = new Set((await env.db.query<{ pano_id: string }>('select pano_id from public.map_locations where map_id = $1', [map.id])).map((r) => r.pano_id));
    expect(panos.every((p) => mapPanos.has(p.pano_id))).toBe(true);
  });

  it('keeps private maps private', async () => {
    const owner = await env.guest();
    const other = await env.guest();
    const { body: map } = await owner.post<MapSummary>('/api/maps', { name: '秘密地圖' });
    expect((await other.get(`/api/maps/${map.slug}`)).status).toBe(403);
    expect((await owner.get(`/api/maps/${map.slug}`)).status).toBe(200);
    const mine = await owner.get<MapSummary[]>(`/api/maps?owner=${owner.userId}`);
    expect(mine.body.map((m) => m.id)).toContain(map.id);
    const theirs = await other.get<MapSummary[]>(`/api/maps?owner=${owner.userId}`);
    expect(theirs.body.map((m) => m.id)).not.toContain(map.id);
    expect((await owner.del(`/api/maps/${map.id}`)).status).toBe(200);
  });
});

describe('location reports', () => {
  it('auto-disables a location after reports from 3 players and lets admins resolve', async () => {
    const reporters = await Promise.all([env.guest(), env.guest(), env.guest()]);
    const games = await Promise.all(reporters.map((r) => r.post<GameView>('/api/games', { mapSlug: 'nangang', settings: { timeLimitSec: 0, movement: 'moving' } })));
    // Point every game's first round at the same location.
    const loc = (await env.db.one<{ id: number; pano_id: string }>(
      `select l.id, l.pano_id from public.map_locations l join public.maps m on m.id = l.map_id where m.slug = 'taipei' and l.district_code = '63000090' limit 1`,
    ))!;
    for (const g of games) await env.db.query('update public.game_rounds set location_id = $2, pano_id = $3 where game_id = $1 and round_no = 1', [g.body.id, loc.id, loc.pano_id]);

    for (const [i, r] of reporters.entries()) {
      expect((await r.post('/api/reports', { gameId: games[i]!.body.id, roundNo: 1, reason: 'indoor' })).status).toBe(200);
    }
    const disabled = await env.db.one<{ disabled: boolean }>('select disabled from public.map_locations where id = $1', [loc.id]);
    expect(disabled?.disabled).toBe(true);

    // Non-admins can't see the queue.
    expect((await reporters[0]!.get('/api/admin/reports')).status).toBe(403);
    await env.db.query(`update public.profiles set role = 'admin' where id = $1`, [reporters[0]!.userId]);
    expect((await reporters[0]!.get<Profile>('/api/me')).body.isAdmin).toBe(true);
    const queue = await reporters[0]!.get<{ panoId: string; reports: number }[]>('/api/admin/reports');
    expect(queue.body.find((q) => q.panoId === loc.pano_id)?.reports).toBe(3);

    await reporters[0]!.post('/api/admin/reports/resolve', { panoId: loc.pano_id, action: 'dismiss' });
    const restored = await env.db.one<{ disabled: boolean }>('select disabled from public.map_locations where id = $1', [loc.id]);
    expect(restored?.disabled).toBe(false);
  });
});
