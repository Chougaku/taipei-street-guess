import { existsSync } from 'node:fs';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import type { Auth, AuthUser } from './auth.ts';
import type { Db } from './db.ts';
import type { Config } from './env.ts';
import { HttpError } from './errors.ts';
import { registerFriendRoutes } from './routes/friends.ts';
import { registerGameRoutes } from './routes/games.ts';
import { registerMapRoutes } from './routes/maps.ts';
import { registerProfileRoutes } from './routes/profiles.ts';
import { registerSocialRoutes } from './routes/social.ts';
import { registerReportRoutes } from './routes/reports.ts';
import { registerStreakRoutes } from './routes/streaks.ts';
import type { PanoResolver } from './services/mapmaker.ts';

export interface AppDeps {
  cfg: Config;
  db: Db;
  auth: Auth;
  /** Realtime presence (sockets connected); falls back to last-seen timestamps when absent. */
  isOnline?: (userId: string) => boolean;
  /** Pushes a realtime event to a user's connected clients (no-op without the realtime server). */
  notify?: (userId: string, event: string, payload?: unknown) => void;
  /** Snaps lat/lng to a Street View pano (defaults to the Google metadata API; stubbed in tests). */
  resolvePano?: PanoResolver;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser | null;
  }
}

export interface Ctx extends AppDeps {
  /** Resolves the authenticated user or throws 401. */
  requireUser(req: FastifyRequest): Promise<AuthUser>;
  /** Resolves the authenticated user if a token is present. */
  optionalUser(req: FastifyRequest): Promise<AuthUser | null>;
}

export async function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 5 * 1024 * 1024 });
  await app.register(cors, { origin: deps.cfg.corsOrigins, credentials: false, exposedHeaders: ['x-server-time'] });
  // Lets clients sync their countdowns to the server clock, which is authoritative for deadlines.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-server-time', String(Date.now()));
  });

  const optionalUser = async (req: FastifyRequest) => {
    if (req.authUser !== undefined) return req.authUser;
    const header = req.headers.authorization;
    req.authUser = header?.startsWith('Bearer ') ? await deps.auth.verify(header.slice(7)) : null;
    return req.authUser;
  };
  const ctx: Ctx = {
    ...deps,
    optionalUser,
    async requireUser(req) {
      const user = await optionalUser(req);
      if (!user) throw new HttpError(401, 'unauthorized', 'Sign in required');
      return user;
    },
  };

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'validation', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: 'bad_request', message: (err as Error).message });
    req.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Internal server error' });
  });

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true }));
      api.get('/config', async () => ({ authMode: deps.auth.mode }));
      if (deps.auth.createDevGuest) {
        const create = deps.auth.createDevGuest;
        api.post('/auth/dev-guest', async () => create());
      }
      registerMapRoutes(api, ctx);
      registerProfileRoutes(api, ctx);
      registerGameRoutes(api, ctx);
      registerSocialRoutes(api, ctx);
      registerFriendRoutes(api, ctx);
      registerStreakRoutes(api, ctx);
      registerReportRoutes(api, ctx);
    },
    { prefix: '/api' },
  );

  const webDist = deps.cfg.webDistDir;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    // SPA fallback: unknown non-API GET routes serve index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.status(404).send({ error: 'not_found', message: 'Not found' });
    });
  }

  return app;
}

export const uuidParam = z.object({ id: z.string().uuid() });
