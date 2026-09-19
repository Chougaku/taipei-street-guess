import type { Db } from '../db.ts';
import { badRequest, forbidden, notFound } from '../errors.ts';
import { refreshOfficialCounts } from '../seed.ts';

export const REPORT_REASONS = ['no_coverage', 'indoor', 'bad_quality', 'wrong_place', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Distinct players reporting the same location before it's pulled automatically. */
const AUTO_DISABLE_REPORTS = 3;

export async function reportLocation(
  db: Db,
  userId: string,
  input: { gameId?: string; roundNo?: number; streakId?: string; panoId?: string; reason: ReportReason; note?: string },
) {
  if (!REPORT_REASONS.includes(input.reason)) throw badRequest('Invalid reason');
  let locationId: number | null = null;
  let panoId = input.panoId ?? null;
  if (input.gameId && input.roundNo) {
    const r = await db.one<{ location_id: number | null; pano_id: string; user_id: string }>(
      `select r.location_id, r.pano_id, g.user_id from public.game_rounds r join public.games g on g.id = r.game_id
       where r.game_id = $1 and r.round_no = $2`,
      [input.gameId, input.roundNo],
    );
    if (!r || r.user_id !== userId) throw notFound('Round');
    locationId = r.location_id;
    panoId = r.pano_id;
  } else if (panoId) {
    const loc = await db.one<{ id: number }>('select id from public.map_locations where pano_id = $1 order by id limit 1', [panoId]);
    locationId = loc?.id ?? null;
  }
  if (!panoId) throw badRequest('Nothing to report');
  await db.query(
    `insert into public.location_reports (location_id, pano_id, user_id, reason, note) values ($1, $2, $3, $4, $5)`,
    [locationId, panoId, userId, input.reason, (input.note ?? '').slice(0, 500)],
  );
  if (locationId) {
    const n = await db.one<{ n: number }>(
      `select count(distinct user_id)::int as n from public.location_reports where location_id = $1 and status = 'open'`,
      [locationId],
    );
    if ((n?.n ?? 0) >= AUTO_DISABLE_REPORTS) {
      await db.query('update public.map_locations set disabled = true where id = $1', [locationId]);
      await refreshOfficialCounts(db);
    }
  }
  return { ok: true };
}

export async function requireAdmin(db: Db, userId: string) {
  const p = await db.one<{ role: string }>('select role from public.profiles where id = $1', [userId]);
  if (p?.role !== 'admin') throw forbidden('Admins only');
}

export interface ReportGroup {
  locationId: number | null;
  panoId: string;
  lat: number | null;
  lng: number | null;
  heading: number;
  mapName: string | null;
  disabled: boolean;
  reports: number;
  reasons: Record<string, number>;
  notes: string[];
  lastReportedAt: string;
}

export async function listReports(db: Db): Promise<ReportGroup[]> {
  const rows = await db.query<{
    location_id: number | null;
    pano_id: string;
    lat: number | null;
    lng: number | null;
    heading: number | null;
    map_name: string | null;
    disabled: boolean | null;
    reports: number;
    reasons: Record<string, number>;
    notes: string[];
    last: Date;
  }>(
    `select r.location_id, r.pano_id, l.lat, l.lng, l.heading, m.name as map_name, l.disabled,
       count(*)::int as reports,
       (select jsonb_object_agg(reason, c) from (select reason, count(*)::int c from public.location_reports x
          where x.pano_id = r.pano_id and x.status = 'open' group by reason) s) as reasons,
       array_remove(array_agg(nullif(r.note, '')), null) as notes,
       max(r.created_at) as last
     from public.location_reports r
     left join public.map_locations l on l.id = r.location_id
     left join public.maps m on m.id = l.map_id
     where r.status = 'open'
     group by r.location_id, r.pano_id, l.lat, l.lng, l.heading, m.name, l.disabled
     order by count(*) desc, max(r.created_at) desc limit 200`,
  );
  return rows.map((r) => ({
    locationId: r.location_id,
    panoId: r.pano_id,
    lat: r.lat,
    lng: r.lng,
    heading: r.heading ?? 0,
    mapName: r.map_name,
    disabled: !!r.disabled,
    reports: r.reports,
    reasons: r.reasons ?? {},
    notes: (r.notes ?? []).slice(0, 5),
    lastReportedAt: r.last.toISOString(),
  }));
}

/** Resolves all open reports for a pano: 'disable' pulls the location, 'dismiss' keeps (or restores) it. */
export async function resolveReports(db: Db, panoId: string, action: 'disable' | 'dismiss') {
  await db.tx(async (tx) => {
    await tx.query(`update public.map_locations set disabled = $2 where pano_id = $1`, [panoId, action === 'disable']);
    await tx.query(`update public.location_reports set status = $2 where pano_id = $1 and status = 'open'`, [
      panoId,
      action === 'disable' ? 'resolved' : 'dismissed',
    ]);
    await refreshOfficialCounts(tx);
  });
  return { ok: true };
}
