import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidParam, type Ctx } from '../app.ts';
import {
  createMap,
  deleteMap,
  getMapLocations,
  googlePanoResolver,
  isLiked,
  listMaps,
  saveMapLocations,
  setLike,
  updateMap,
} from '../services/mapmaker.ts';
import { getMapBySlug, listOfficialMaps, toMapSummary } from '../services/maps.ts';

const visibility = z.enum(['public', 'unlisted', 'private']);
const metaSchema = z.object({ name: z.string().max(80).optional(), description: z.string().max(600).optional(), visibility: visibility.optional() });

export function registerMapRoutes(api: FastifyInstance, ctx: Ctx) {
  const resolvePano = ctx.resolvePano ?? googlePanoResolver(ctx.cfg.googleServerKey);

  api.get('/maps/official', async () => listOfficialMaps(ctx.db));

  api.get('/maps', async (req) => {
    const q = z
      .object({ sort: z.enum(['popular', 'new', 'liked']).default('popular'), q: z.string().max(40).optional(), owner: z.string().uuid().optional() })
      .parse(req.query);
    const user = await ctx.optionalUser(req);
    return listMaps(ctx.db, { sort: q.sort, q: q.q, ownerId: q.owner, viewerId: user?.id ?? null });
  });

  api.get('/maps/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string().min(1).max(64) }).parse(req.params);
    const user = await ctx.optionalUser(req);
    const map = toMapSummary(await getMapBySlug(ctx.db, slug, user?.id ?? null));
    return { ...map, likedByMe: user ? await isLiked(ctx.db, user.id, map.id) : false };
  });

  api.post('/maps', async (req) => {
    const user = await ctx.requireUser(req);
    const body = metaSchema.extend({ name: z.string() }).parse(req.body);
    return createMap(ctx.db, user.id, body);
  });

  api.patch('/maps/:id', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return updateMap(ctx.db, user.id, id, metaSchema.parse(req.body));
  });

  api.delete('/maps/:id', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    await deleteMap(ctx.db, user.id, id);
    return { ok: true };
  });

  api.get('/maps/:id/locations', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return getMapLocations(ctx.db, user.id, id);
  });

  api.put('/maps/:id/locations', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    const { locations } = z
      .object({
        locations: z
          .array(
            z.object({
              panoId: z.string().max(200).nullish(),
              lat: z.number().min(-90).max(90),
              lng: z.number().min(-180).max(180),
              heading: z.number().optional(),
              pitch: z.number().optional(),
              zoom: z.number().optional(),
            }),
          )
          .max(10_000),
      })
      .parse(req.body);
    return saveMapLocations(ctx.db, user.id, id, locations, resolvePano);
  });

  api.post('/maps/:id/like', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return setLike(ctx.db, user.id, id, true);
  });

  api.delete('/maps/:id/like', async (req) => {
    const user = await ctx.requireUser(req);
    const { id } = uuidParam.parse(req.params);
    return setLike(ctx.db, user.id, id, false);
  });
}
