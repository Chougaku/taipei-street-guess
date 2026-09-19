import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app.ts';
import { getProfile, touchLastSeen, updateProfile } from '../services/profiles.ts';

export function registerProfileRoutes(api: FastifyInstance, ctx: Ctx) {
  api.get('/me', async (req) => {
    const user = await ctx.requireUser(req);
    await touchLastSeen(ctx.db, user.id);
    return getProfile(ctx.db, user.id);
  });

  api.patch('/me', async (req) => {
    const user = await ctx.requireUser(req);
    const body = z.object({ nickname: z.string().optional(), avatar: z.string().optional() }).parse(req.body);
    return updateProfile(ctx.db, user.id, body);
  });
}
