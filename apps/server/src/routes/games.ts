import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidParam, type Ctx } from '../app.ts';
import { createGame, getGame, nextRound, replaceRound, submitGuess } from '../services/games.ts';

export const settingsSchema = z.object({
  timeLimitSec: z.number().int().min(0).max(600),
  movement: z.enum(['moving', 'nomove', 'nmpz']),
});

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export function registerGameRoutes(api: FastifyInstance, ctx: Ctx) {
  api.post('/games', async (req) => {
    const user = await ctx.requireUser(req);
    const body = z
      .object({ mapSlug: z.string().min(1), settings: settingsSchema, mode: z.enum(['classic', 'explorer']).optional() })
      .parse(req.body);
    return createGame(ctx.db, user.id, body);
  });

  api.get('/explorer', async (req) => {
    const user = await ctx.requireUser(req);
    const rows = await ctx.db.query<{ district_code: string; medal: string | null; best_score: number; games: number }>(
      'select district_code, medal, best_score, games from public.explorer_progress where user_id = $1',
      [user.id],
    );
    return rows.map((r) => ({ districtCode: r.district_code, medal: r.medal, bestScore: r.best_score, games: r.games }));
  });

  api.get('/games/:id', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return getGame(ctx.db, id, user.id);
  });

  api.post('/games/:id/guess', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    const body = z.object({ roundNo: z.number().int().min(1), guess: latLng.nullable() }).parse(req.body);
    return submitGuess(ctx.db, id, user.id, body);
  });

  api.post('/games/:id/next', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return nextRound(ctx.db, id, user.id);
  });

  api.post('/games/:id/rounds/:roundNo/replace', async (req) => {
    const user = await ctx.requireUser(req);
    const { id, roundNo } = z.object({ id: z.string().uuid(), roundNo: z.coerce.number().int().min(1) }).parse(req.params);
    return replaceRound(ctx.db, id, user.id, roundNo);
  });
}
