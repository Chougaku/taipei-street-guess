import type { StreakView } from '@tg/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from './test-utils.ts';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => env?.close());

const current = async (id: string) =>
  (await env.db.one<{ current: { district: string; village: string; lat: number; lng: number } }>('select current from public.streak_runs where id = $1', [id]))!.current;

async function start(c: TestClient, level: 'district' | 'village' = 'district', timeLimitSec = 0) {
  const res = await c.post<StreakView>('/api/streaks', { level, settings: { timeLimitSec, movement: 'moving' } });
  expect(res.status).toBe(200);
  return res.body;
}

describe('district streak', () => {
  it('continues while correct and ends on the first miss', async () => {
    const c = await env.guest();
    let run = await start(c);
    expect(run.current?.roundNo).toBe(1);
    expect(JSON.stringify(run)).not.toMatch(/6300\d{4}/); // answer region not leaked

    for (let n = 1; n <= 3; n++) {
      const cur = await current(run.id);
      run = (await c.post<StreakView>(`/api/streaks/${run.id}/guess`, { roundNo: n, region: cur.district, guess: cur })).body;
      expect(run.streak).toBe(n);
      expect(run.current).toBeNull(); // awaiting "next"
      expect(run.history.at(-1)?.correct).toBe(true);
      run = (await c.post<StreakView>(`/api/streaks/${run.id}/next`)).body;
      expect(run.current?.roundNo).toBe(n + 1);
    }

    const cur = await current(run.id);
    const wrong = cur.district === '63000010' ? '63000020' : '63000010';
    run = (await c.post<StreakView>(`/api/streaks/${run.id}/guess`, { roundNo: 4, region: wrong, guess: null })).body;
    expect(run.status).toBe('finished');
    expect(run.streak).toBe(3);
    expect(run.best).toBe(3);
    expect(run.xpGained).toBe(30);
    expect(run.history.at(-1)).toMatchObject({ correct: false, guessRegion: wrong, answerRegion: cur.district });
    expect((await c.post(`/api/streaks/${run.id}/guess`, { roundNo: 5, region: wrong, guess: null })).status).toBe(409);
  });

  it('rejects malformed regions and times out late guesses', async () => {
    const c = await env.guest();
    const run = await start(c, 'district', 10);
    expect((await c.post(`/api/streaks/${run.id}/guess`, { roundNo: 1, region: 'nope', guess: null })).status).toBe(400);
    await env.db.query(`update public.streak_runs set deadline = now() - interval '1 minute' where id = $1`, [run.id]);
    const cur = await current(run.id);
    const res = await c.post<StreakView>(`/api/streaks/${run.id}/guess`, { roundNo: 1, region: cur.district, guess: null });
    expect(res.body.status).toBe('finished');
    expect(res.body.history[0]!.timedOut).toBe(true);
  });

  it('shows up on the streak leaderboard', async () => {
    const c = await env.guest();
    let run = await start(c);
    const cur = await current(run.id);
    run = (await c.post<StreakView>(`/api/streaks/${run.id}/guess`, { roundNo: 1, region: cur.district, guess: null })).body;
    run = (await c.post<StreakView>(`/api/streaks/${run.id}/next`)).body;
    const cur2 = await current(run.id);
    await c.post(`/api/streaks/${run.id}/guess`, { roundNo: 2, region: cur2.district === '63000030' ? '63000040' : '63000030', guess: null });
    const board = await c.get<{ me: { score: number } | null }>('/api/leaderboards/streak/district');
    expect(board.body.me?.score).toBe(1);
  });
});

describe('village streak', () => {
  it('uses village codes', async () => {
    const c = await env.guest();
    const run = await start(c, 'village');
    const cur = await current(run.id);
    expect(cur.village).toMatch(/^63000\d{6}$/);
    const res = await c.post<StreakView>(`/api/streaks/${run.id}/guess`, { roundNo: 1, region: cur.village, guess: null });
    expect(res.body.streak).toBe(1);
  });
});
