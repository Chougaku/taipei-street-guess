import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from './db.ts';
import { ROOT_DIR } from './env.ts';

const MIGRATIONS_DIR = resolve(ROOT_DIR, 'supabase/migrations');

/**
 * Stand-in for the bits of Supabase's `auth` schema our migrations reference,
 * used only with the embedded dev/test database.
 */
const AUTH_STUB = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now()
);
`;

export async function migrate(db: Db, log: (msg: string) => void = () => {}): Promise<void> {
  if (db.kind === 'pglite') await db.exec(AUTH_STUB);
  await db.exec(`create table if not exists public.schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  const applied = new Set((await db.query<{ name: string }>('select name from public.schema_migrations')).map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    await db.tx(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into public.schema_migrations (name) values ($1)', [file]);
    });
    log(`applied migration ${file}`);
  }
}
