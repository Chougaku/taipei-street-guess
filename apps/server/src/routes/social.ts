import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidParam, type Ctx } from '../app.ts';
import { challengeResults, createChallenge, createChallengeFromGame, getChallenge, getDaily, playChallenge, playDaily } from '../services/challenges.ts';
import { mapLeaderboard, ratingLeaderboard, streakLeaderboard, xpLeaderboard } from '../services/leaderboards.ts';
import { taipeiDay } from '../services/progression.ts';
import { getProfilePage } from '../services/users.ts';
import { settingsSchema } from './games.ts';

const codeParam = z.object({ code: z.string().regex(/^[A-Za-z0-9]{6,12}$/) });
const dayQuery = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const boardQuery = z.object({
  period: z.enum(['day', 'week', 'all']).default('all'),
  friends: z
    .enum(['1', '0', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export function registerSocialRoutes(api: FastifyInstance, ctx: Ctx) {
  // ── Challenges ──
  api.post('/challenges', async (req) => {
    const user = await ctx.requireUser(req);
    const body = z.object({ mapSlug: z.string().min(1), settings: settingsSchema }).parse(req.body);
    return createChallenge(ctx.db, user.id, body);
  });

  api.post('/games/:id/challenge', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return createChallengeFromGame(ctx.db, user.id, id);
  });

  api.get('/challenges/:code', async (req) => {
    const { code } = codeParam.parse(req.params);
    const user = await ctx.optionalUser(req);
    return getChallenge(ctx.db, code, user?.id ?? null);
  });

  api.post('/challenges/:code/play', async (req) => {
    const user = await ctx.requireUser(req);
    const { code } = codeParam.parse(req.params);
    return playChallenge(ctx.db, code, user.id);
  });

  api.get('/challenges/:code/results', async (req) => {
    const { code } = codeParam.parse(req.params);
    const user = await ctx.optionalUser(req);
    return challengeResults(ctx.db, { code }, user?.id ?? null);
  });

  // ── Daily challenge (Asia/Taipei calendar day) ──
  api.get('/daily', async (req) => {
    const user = await ctx.optionalUser(req);
    return getDaily(ctx.db, user?.id ?? null);
  });

  api.post('/daily/play', async (req) => {
    const user = await ctx.requireUser(req);
    return playDaily(ctx.db, user.id);
  });

  api.get('/daily/results', async (req) => {
    const { day } = dayQuery.parse(req.query);
    const user = await ctx.optionalUser(req);
    const d = day ?? taipeiDay();
    // Past days are fine to browse; future days would create challenges early.
    return challengeResults(ctx.db, { day: d > taipeiDay() ? taipeiDay() : d }, user?.id ?? null);
  });

  // ── Leaderboards ──
  api.get('/leaderboards/maps/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.params);
    const q = boardQuery.parse(req.query);
    const user = await ctx.optionalUser(req);
    return mapLeaderboard(ctx.db, slug, { ...q, userId: user?.id ?? null });
  });

  api.get('/leaderboards/xp', async (req) => {
    const q = boardQuery.parse(req.query);
    const user = await ctx.optionalUser(req);
    return xpLeaderboard(ctx.db, { friends: q.friends, userId: user?.id ?? null });
  });

  api.get('/leaderboards/streak/:level', async (req) => {
    const { level } = z.object({ level: z.enum(['district', 'village']) }).parse(req.params);
    const q = boardQuery.parse(req.query);
    const user = await ctx.optionalUser(req);
    return streakLeaderboard(ctx.db, level, { ...q, userId: user?.id ?? null });
  });

  api.get('/leaderboards/rating', async (req) => {
    const q = boardQuery.parse(req.query);
    const user = await ctx.optionalUser(req);
    return ratingLeaderboard(ctx.db, { friends: q.friends, userId: user?.id ?? null });
  });

  // ── Profiles ──
  api.get('/users/:id', async (req) => {
    const { id } = uuidParam.parse(req.params);
    const user = await ctx.optionalUser(req);
    return getProfilePage(ctx.db, id, user?.id ?? null, ctx.isOnline);
  });
}
