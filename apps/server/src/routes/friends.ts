import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidParam, type Ctx } from '../app.ts';
import { addFriend, addFriendByCode, listFriends, removeFriend, searchPlayers } from '../services/friends.ts';

export function registerFriendRoutes(api: FastifyInstance, ctx: Ctx) {
  api.get('/friends', async (req) => {
    const user = await ctx.requireUser(req);
    return listFriends(ctx.db, user.id, ctx.isOnline);
  });

  api.post('/friends/:id', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    const state = await addFriend(ctx.db, user.id, id);
    ctx.notify?.(id, 'friends:changed');
    return { state };
  });

  api.post('/friends/by-code', async (req) => {
    const user = await ctx.requireUser(req);
    const { code } = z.object({ code: z.string().min(4).max(16) }).parse(req.body);
    const res = await addFriendByCode(ctx.db, user.id, code);
    ctx.notify?.(res.userId, 'friends:changed');
    return res;
  });

  api.delete('/friends/:id', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    await removeFriend(ctx.db, user.id, id);
    ctx.notify?.(id, 'friends:changed');
    return { state: 'none' };
  });

  api.get('/players/search', async (req) => {
    const user = await ctx.requireUser(req);
    const { q } = z.object({ q: z.string().max(32) }).parse(req.query);
    return searchPlayers(ctx.db, q, user.id);
  });
}
