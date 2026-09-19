import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidParam, type Ctx } from '../app.ts';
import { createStreak, getStreak, guessStreak, nextStreakRound, replaceStreakRound } from '../services/streaks.ts';
import { settingsSchema } from './games.ts';

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export function registerStreakRoutes(api: FastifyInstance, ctx: Ctx) {
  api.post('/streaks', async (req) => {
    const user = await ctx.requireUser(req);
    const body = z.object({ level: z.enum(['district', 'village']), settings: settingsSchema }).parse(req.body);
    return createStreak(ctx.db, user.id, body);
  });

  api.get('/streaks/:id', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return getStreak(ctx.db, id, user.id);
  });

  api.post('/streaks/:id/guess', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    const body = z
      .object({ roundNo: z.number().int().min(1), region: z.string().max(16).nullable(), guess: latLng.nullable() })
      .parse(req.body);
    return guessStreak(ctx.db, id, user.id, body);
  });

  api.post('/streaks/:id/next', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return nextStreakRound(ctx.db, id, user.id);
  });

  api.post('/streaks/:id/replace', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return replaceStreakRound(ctx.db, id, user.id);
  });
}
