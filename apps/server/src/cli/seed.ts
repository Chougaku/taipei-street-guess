/** Applies migrations and (re)loads official maps + the location pool. */
import { createDb } from '../db.ts';
import { loadConfig } from '../env.ts';
import { migrate } from '../migrate.ts';
import { seed } from '../seed.ts';

const cfg = loadConfig();
const db = await createDb(cfg);
await migrate(db, console.log);
await seed(db, undefined, console.log);
const counts = await db.query<{ slug: string; location_count: number }>(
  "select slug, location_count from public.maps where kind = 'official' order by sort_order",
);
console.table(counts);
await db.close();
