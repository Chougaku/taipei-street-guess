import { DISTRICTS, sample, type BBox, type MapSummary } from '@tg/shared';
import type { Db } from '../db.ts';
import { forbidden, notFound } from '../errors.ts';
import { CITY_MAP_SLUG } from '../seed.ts';

export interface MapRow {
  id: string;
  slug: string;
  name: string;
  name_en: string;
  description: string;
  kind: 'official' | 'custom';
  district_code: string | null;
  owner_id: string | null;
  owner_name: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  bbox: number[];
  diagonal_km: number;
  location_count: number;
  likes: number;
  plays: number;
}

export const MAP_COLUMNS = `m.id, m.slug, m.name, m.name_en, m.description, m.kind, m.district_code, m.owner_id,
  p.nickname as owner_name, m.visibility, m.bbox, m.diagonal_km, m.location_count, m.likes, m.plays`;
export const MAP_FROM = 'public.maps m left join public.profiles p on p.id = m.owner_id';

export function toMapSummary(r: MapRow): MapSummary {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    nameEn: r.name_en,
    description: r.description,
    kind: r.kind,
    districtCode: r.district_code,
    bbox: r.bbox as BBox,
    diagonalKm: r.diagonal_km,
    locationCount: r.location_count,
    visibility: r.visibility,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    likes: r.likes,
    plays: r.plays,
  };
}

export async function listOfficialMaps(db: Db): Promise<MapSummary[]> {
  const rows = await db.query<MapRow>(`select ${MAP_COLUMNS} from ${MAP_FROM} where m.kind = 'official' order by m.sort_order`);
  return rows.map(toMapSummary);
}

export async function getMapBySlug(db: Db, slug: string, viewerId: string | null): Promise<MapRow> {
  const row = await db.one<MapRow>(`select ${MAP_COLUMNS} from ${MAP_FROM} where m.slug = $1`, [slug]);
  if (!row) throw notFound('Map');
  if (row.visibility === 'private' && row.owner_id !== viewerId) throw forbidden('This map is private');
  return row;
}

export async function getMapById(db: Db, id: string): Promise<MapRow> {
  const row = await db.one<MapRow>(`select ${MAP_COLUMNS} from ${MAP_FROM} where m.id = $1`, [id]);
  if (!row) throw notFound('Map');
  return row;
}

export interface LocationRow {
  id: number;
  pano_id: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  zoom: number;
  district_code: string | null;
  village_code: string | null;
}

const LOCATION_COLUMNS = 'l.id, l.pano_id, l.lat, l.lng, l.heading, l.pitch, l.zoom, l.district_code, l.village_code';

async function cityMapId(db: Db): Promise<string> {
  const row = await db.one<{ id: string }>('select id from public.maps where slug = $1', [CITY_MAP_SLUG]);
  if (!row) throw new Error('City map is missing — was the database seeded?');
  return row.id;
}

async function randomFrom(
  db: Db,
  mapId: string,
  district: string | null,
  n: number,
  exclude: number[],
): Promise<LocationRow[]> {
  return db.query<LocationRow>(
    `select ${LOCATION_COLUMNS} from public.map_locations l
     where l.map_id = $1 and not l.disabled
       and ($2::text is null or l.district_code = $2)
       and not (l.id = any($3::bigint[]))
     order by random() limit $4`,
    [mapId, district, `{${exclude.join(',')}}`, n],
  );
}

/** Location ids the user has seen recently, so repeat games feel fresh. */
async function recentlySeen(db: Db, userId: string): Promise<number[]> {
  const rows = await db.query<{ location_id: number }>(
    `select r.location_id from public.game_rounds r join public.games g on g.id = r.game_id
     where g.user_id = $1 and r.location_id is not null and g.created_at > now() - interval '14 days'
     order by g.created_at desc limit 500`,
    [userId],
  );
  return rows.map((r) => r.location_id);
}

/**
 * Picks `n` locations for a map. The whole-city map weights all 12 districts
 * equally (instead of by area, which would favour the mountains of Shilin
 * and Beitou), and avoids repeating a district within a game when possible.
 */
export async function pickLocations(
  db: Db,
  map: MapRow,
  n: number,
  opts: { userId?: string; exclude?: number[]; rand?: () => number } = {},
): Promise<LocationRow[]> {
  const rand = opts.rand ?? Math.random;
  const exclude = [...(opts.exclude ?? []), ...(opts.userId ? await recentlySeen(db, opts.userId) : [])];
  const pick = async (mapId: string, district: string | null, count: number) => {
    let rows = await randomFrom(db, mapId, district, count, exclude);
    if (rows.length < count) rows = await randomFrom(db, mapId, district, count, opts.exclude ?? []);
    return rows;
  };

  if (map.kind === 'custom') return pick(map.id, null, n);
  const poolId = await cityMapId(db);
  if (map.district_code) return pick(poolId, map.district_code, n);

  const districts: string[] = [];
  while (districts.length < n) districts.push(...sample(DISTRICTS, Math.min(DISTRICTS.length, n - districts.length), rand).map((d) => d.code));
  const out: LocationRow[] = [];
  for (const d of districts) {
    const [loc] = await pick(poolId, d, 1);
    if (loc) {
      out.push(loc);
      exclude.push(loc.id);
    }
  }
  return out;
}

/** One random location from the official city pool, optionally within a district / with a known village. */
export async function randomPoolLocation(
  db: Db,
  opts: { district?: string | null; requireVillage?: boolean; exclude?: number[] } = {},
): Promise<LocationRow | null> {
  const poolId = await cityMapId(db);
  const rows = await db.query<LocationRow>(
    `select ${LOCATION_COLUMNS} from public.map_locations l
     where l.map_id = $1 and not l.disabled
       and ($2::text is null or l.district_code = $2)
       and (not $3::boolean or l.village_code is not null)
       and not (l.id = any($4::bigint[]))
     order by random() limit 1`,
    [poolId, opts.district ?? null, opts.requireVillage ?? false, `{${(opts.exclude ?? []).join(',')}}`],
  );
  return rows[0] ?? null;
}

/** A replacement location in the same region as `loc` (used when a pano no longer loads). */
export async function pickReplacement(db: Db, map: MapRow, loc: { district_code: string | null }, exclude: number[]) {
  if (map.kind === 'custom') return (await randomFrom(db, map.id, null, 1, exclude))[0] ?? null;
  const poolId = await cityMapId(db);
  return (await randomFrom(db, poolId, map.district_code ?? loc.district_code, 1, exclude))[0] ?? null;
}
