import { mkdirSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';

type Row = Record<string, unknown>;

/**
 * Minimal SQL interface implemented by both postgres.js (Supabase / production)
 * and PGlite (embedded Postgres for local dev and tests).
 */
export interface Db {
  readonly kind: 'postgres' | 'pglite';
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Row>(text: string, params?: unknown[]): Promise<T | null>;
  /** Run multiple statements (no parameters). */
  exec(text: string): Promise<void>;
  tx<R>(fn: (db: Db) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

/** Postgres array literal for `= any($1::bigint[])` style parameters. */
export function pgArray(values: readonly (string | number)[]): string {
  return `{${values.map((v) => (typeof v === 'number' ? String(v) : `"${v.replace(/(["\\])/g, '\\$1')}"`)).join(',')}}`;
}

function wrapPostgres(sql: postgres.Sql | postgres.TransactionSql): Db {
  const db: Db = {
    kind: 'postgres',
    query: async <T>(text: string, params: unknown[] = []) =>
      (await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    one: async <T>(text: string, params: unknown[] = []) => ((await db.query<T>(text, params))[0] ?? null),
    exec: async (text) => {
      await sql.unsafe(text);
    },
    tx: async (fn) => {
      if (!('begin' in sql)) return fn(db); // already inside a transaction
      return (await (sql as postgres.Sql).begin((t) => fn(wrapPostgres(t)))) as never;
    },
    close: async () => {
      if ('end' in sql) await (sql as postgres.Sql).end({ timeout: 5 });
    },
  };
  return db;
}

interface PgliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<unknown>;
}

function wrapPglite(pg: PgliteLike, root: PGlite | null): Db {
  const db: Db = {
    kind: 'pglite',
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
    one: async <T>(text: string, params: unknown[] = []) => ((await db.query<T>(text, params))[0] ?? null),
    exec: async (text) => {
      await pg.exec(text);
    },
    tx: async (fn) => (root ? root.transaction((t) => fn(wrapPglite(t, null))) : fn(db)),
    close: async () => {
      await root?.close();
    },
  };
  return db;
}

export async function createDb(opts: { databaseUrl: string; pgliteDir: string }): Promise<Db> {
  if (opts.databaseUrl) {
    const sql = postgres(opts.databaseUrl, {
      max: 10,
      prepare: false, // required behind Supabase's transaction pooler
      onnotice: () => {},
      // Return int8 as JS numbers (ids and counts comfortably fit).
      types: {
        bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      },
    });
    return wrapPostgres(sql);
  }
  const inMemory = opts.pgliteDir === 'memory';
  if (!inMemory) mkdirSync(opts.pgliteDir, { recursive: true });
  // Loaded lazily: production uses Postgres and the server bundle doesn't ship PGlite.
  const { PGlite: PGliteImpl } = await import('@electric-sql/pglite');
  const pg = await PGliteImpl.create(inMemory ? undefined : opts.pgliteDir, {
    parsers: { 20: (v: string) => Number(v) },
  });
  return wrapPglite(pg, pg);
}
