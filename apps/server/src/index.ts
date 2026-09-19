import { buildApp } from './app.ts';
import { createAuth } from './auth.ts';
import { createDb } from './db.ts';
import { loadConfig } from './env.ts';
import { migrate } from './migrate.ts';
import { RealtimeHub } from './realtime/hub.ts';
import { seed } from './seed.ts';

const cfg = loadConfig();
const db = await createDb(cfg);
const log = (msg: string, err?: unknown) => console.log(`[server] ${msg}`, err ?? '');

await migrate(db, log);
await seed(db, undefined, log);

const auth = createAuth(cfg, db);
let hub: RealtimeHub | null = null;
const app = await buildApp(
  {
    cfg,
    db,
    auth,
    isOnline: (id) => hub?.isOnline(id) ?? false,
    notify: (id, event, payload) => hub?.notify(id, event, payload),
  },
  { logger: process.env.NODE_ENV === 'production' },
);
hub = new RealtimeHub(app.server, db, auth, { corsOrigins: cfg.corsOrigins, log });

await app.listen({ port: cfg.port, host: cfg.host });
log(`listening on http://localhost:${cfg.port} (db=${db.kind}, auth=${auth.mode})`);

const shutdown = async () => {
  hub?.close();
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
