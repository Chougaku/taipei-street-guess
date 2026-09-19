import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';
import { createAuth, type Auth } from './auth.ts';
import { createDb, type Db } from './db.ts';
import { loadConfig } from './env.ts';
import { migrate } from './migrate.ts';
import { loadLocationPool, seed, type PoolLocation } from './seed.ts';
import type { PanoResolver } from './services/mapmaker.ts';

let cachedPool: PoolLocation[] | null = null;

/** A small but district-complete slice of the real pool keeps tests fast. */
export function testPool(perDistrict = 25): PoolLocation[] {
  if (!cachedPool) {
    const byDistrict = new Map<string, PoolLocation[]>();
    for (const l of loadLocationPool()) {
      const list = byDistrict.get(l.district) ?? [];
      if (list.length < perDistrict) list.push(l);
      byDistrict.set(l.district, list);
    }
    cachedPool = [...byDistrict.values()].flat();
  }
  return cachedPool;
}

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  auth: Auth;
  /** Creates a guest and returns request helpers bound to their token. */
  guest(): Promise<TestClient>;
  close(): Promise<void>;
}

export interface TestClient {
  userId: string;
  token: string;
  get<T = unknown>(url: string): Promise<{ status: number; body: T }>;
  post<T = unknown>(url: string, payload?: unknown): Promise<{ status: number; body: T }>;
  patch<T = unknown>(url: string, payload?: unknown): Promise<{ status: number; body: T }>;
  del<T = unknown>(url: string): Promise<{ status: number; body: T }>;
}

export async function createTestEnv(opts: { resolvePano?: PanoResolver } = {}): Promise<TestEnv> {
  const cfg = loadConfig({ databaseUrl: '', pgliteDir: 'memory', supabaseUrl: '', devJwtSecret: 'test-secret', webDistDir: null });
  const db = await createDb(cfg);
  await migrate(db);
  await seed(db, testPool());
  const auth = createAuth(cfg, db);
  const app = await buildApp({ cfg, db, auth, resolvePano: opts.resolvePano ?? (async () => null) });

  const client = (token: string, userId: string): TestClient => {
    const call = async <T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
        ...(payload !== undefined ? { payload: payload as object } : {}),
      });
      return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
    };
    return {
      userId,
      token,
      get: (url) => call('GET', url),
      post: (url, payload) => call('POST', url, payload ?? {}),
      patch: (url, payload) => call('PATCH', url, payload ?? {}),
      del: (url) => call('DELETE', url),
    };
  };

  return {
    app,
    db,
    auth,
    async guest() {
      const res = await app.inject({ method: 'POST', url: '/api/auth/dev-guest' });
      const { token, userId } = res.json() as { token: string; userId: string };
      return client(token, userId);
    },
    async close() {
      await app.close();
      await db.close();
    },
  };
}
