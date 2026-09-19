import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Repo root — src/ and dist/ are at the same depth. */
export const ROOT_DIR = resolve(here, '../../..');
export const SERVER_DIR = resolve(here, '..');

const env = process.env;

export interface Config {
  port: number;
  host: string;
  /** Postgres connection string; empty → embedded PGlite (local dev). */
  databaseUrl: string;
  /** Directory for the embedded PGlite database; 'memory' for an in-memory DB. */
  pgliteDir: string;
  supabaseUrl: string;
  supabaseJwtSecret: string;
  devJwtSecret: string;
  googleServerKey: string;
  /** Serve the built web app from this directory when set. */
  webDistDir: string | null;
  corsOrigins: string[] | true;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const cfg: Config = {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? '',
    pgliteDir: env.PGLITE_DIR ?? resolve(SERVER_DIR, '.pglite'),
    supabaseUrl: (env.SUPABASE_URL ?? '').replace(/\/$/, ''),
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET ?? '',
    devJwtSecret: env.DEV_JWT_SECRET ?? 'dev-only-secret-change-me',
    googleServerKey: env.GOOGLE_MAPS_SERVER_KEY ?? '',
    webDistDir: env.WEB_DIST_DIR ? resolve(env.WEB_DIST_DIR) : env.NODE_ENV === 'production' ? resolve(ROOT_DIR, 'apps/web/dist') : null,
    corsOrigins: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((s) => s.trim()) : true,
    ...overrides,
  };
  if (env.NODE_ENV === 'production' && !cfg.supabaseUrl) {
    throw new Error('SUPABASE_URL must be set in production (dev auth mode is for local development only)');
  }
  return cfg;
}

export const isSupabaseMode = (cfg: Config) => cfg.supabaseUrl !== '';
