import {
  bboxDiagonalKm,
  bboxOfPoints,
  findDistrict,
  isInTaipei,
  randomCode,
  TAIPEI_BBOX,
  type MapSummary,
  type MapVisibility,
} from '@tg/shared';
import { findVillage } from '@tg/shared/villages';
import type { Db } from '../db.ts';
import { badRequest, conflict, forbidden, notFound } from '../errors.ts';
import { award } from './achievements.ts';
import { MAP_COLUMNS, MAP_FROM, toMapSummary, type MapRow } from './maps.ts';

export const MAX_MAP_LOCATIONS = 10_000;
export const MIN_PLAYABLE_LOCATIONS = 5;

export interface EditableLocation {
  panoId?: string | null;
  lat: number;
  lng: number;
  heading?: number;
  pitch?: number;
  zoom?: number;
}

export interface MapLocationDto {
  id: number;
  panoId: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  zoom: number;
}

/** Resolves a lat/lng to the nearest official Street View pano (server-side metadata lookup). */
export type PanoResolver = (loc: { lat: number; lng: number }) => Promise<{ panoId: string; lat: number; lng: number } | null>;

export function googlePanoResolver(key: string): PanoResolver {
  return async ({ lat, lng }) => {
    if (!key) return null;
    const url = new URL('https://maps.googleapis.com/maps/api/streetview/metadata');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', '50');
    url.searchParams.set('source', 'outdoor');
    url.searchParams.set('key', key);
    const res = await fetch(url);
    if (!res.ok) return null;
    const m = (await res.json()) as { status: string; pano_id?: string; location?: { lat: number; lng: number }; copyright?: string };
    if (m.status !== 'OK' || !m.pano_id || !m.location) return null;
    if ((m.copyright ?? '').replace(/\s+/g, '') !== '©Google') return null;
    return { panoId: m.pano_id, lat: m.location.lat, lng: m.location.lng };
  };
}

async function ownedMap(db: Db, id: string, userId: string): Promise<MapRow> {
  const map = await db.one<MapRow>(`select ${MAP_COLUMNS} from ${MAP_FROM} where m.id = $1`, [id]);
  if (!map) throw notFound('Map');
  if (map.kind !== 'custom' || map.owner_id !== userId) throw forbidden('You can only edit your own maps');
  return map;
}

function validateMeta(input: { name?: string; description?: string; visibility?: MapVisibility }) {
  const out: { name?: string; description?: string; visibility?: MapVisibility } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if ([...name].length < 2 || [...name].length > 40) throw badRequest('Map name must be 2–40 characters', 'invalid_name');
    out.name = name;
  }
  if (input.description !== undefined) {
    if ([...input.description].length > 300) throw badRequest('Description is too long', 'invalid_description');
    out.description = input.description.trim();
  }
  if (input.visibility !== undefined) {
    if (!['public', 'unlisted', 'private'].includes(input.visibility)) throw badRequest('Invalid visibility');
    out.visibility = input.visibility;
  }
  return out;
}

export async function createMap(db: Db, userId: string, input: { name: string; description?: string; visibility?: MapVisibility }): Promise<MapSummary> {
  const meta = validateMeta({ description: '', visibility: 'private', ...input });
  const count = await db.one<{ n: number }>(`select count(*)::int as n from public.maps where owner_id = $1`, [userId]);
  if ((count?.n ?? 0) >= 50) throw conflict('You have too many maps', 'too_many_maps');
  for (let i = 0; i < 5; i++) {
    const row = await db.one<{ id: string }>(
      `insert into public.maps (slug, name, name_en, description, kind, owner_id, visibility, bbox, diagonal_km, location_count)
       values ($1, $2, $2, $3, 'custom', $4, $5, $6::double precision[], $7, 0) on conflict (slug) do nothing returning id`,
      [`m-${randomCode(8).toLowerCase()}`, meta.name, meta.description, userId, meta.visibility, `{${TAIPEI_BBOX.join(',')}}`, bboxDiagonalKm(TAIPEI_BBOX)],
    );
    if (row) return toMapSummary((await db.one<MapRow>(`select ${MAP_COLUMNS} from ${MAP_FROM} where m.id = $1`, [row.id]))!);
  }
  throw new Error('Could not allocate a map slug');
}

export async function updateMap(db: Db, userId: string, id: string, input: { name?: string; description?: string; visibility?: MapVisibility }) {
  const map = await ownedMap(db, id, userId);
  const meta = validateMeta(input);
  if (meta.visibility === 'public' && map.location_count < MIN_PLAYABLE_LOCATIONS) {
    throw conflict(`A public map needs at least ${MIN_PLAYABLE_LOCATIONS} locations`, 'too_few_locations');
  }
  await db.query(
    `update public.maps set name = coalesce($2, name), name_en = coalesce($2, name_en), description = coalesce($3, description),
       visibility = coalesce($4, visibility), updated_at = now() where id = $1`,
    [id, meta.name ?? null, meta.description ?? null, meta.visibility ?? null],
  );
  if (meta.visibility === 'public') await award(db, userId, ['map_maker']);
  return toMapSummary((await db.one<MapRow>(`select ${MAP_COLUMNS} from ${MAP_FROM} where m.id = $1`, [id]))!);
}

export async function deleteMap(db: Db, userId: string, id: string) {
  await ownedMap(db, id, userId);
  await db.query('delete from public.maps where id = $1', [id]);
}

export async function getMapLocations(db: Db, userId: string, id: string): Promise<MapLocationDto[]> {
  await ownedMap(db, id, userId);
  return db.query<MapLocationDto>(
    `select id, pano_id as "panoId", lat, lng, heading, pitch, zoom from public.map_locations
     where map_id = $1 and not disabled order by id`,
    [id],
  );
}

/**
 * Replaces a custom map's locations. Locations outside Taipei are dropped; ones without a
 * pano id are snapped to the nearest official Street View pano.
 */
export async function saveMapLocations(
  db: Db,
  userId: string,
  id: string,
  locations: EditableLocation[],
  resolvePano: PanoResolver,
): Promise<{ map: MapSummary; saved: number; skipped: number }> {
  const map = await ownedMap(db, id, userId);
  if (locations.length > MAX_MAP_LOCATIONS) throw badRequest(`At most ${MAX_MAP_LOCATIONS} locations per map`, 'too_many_locations');

  const resolved: Required<EditableLocation>[] = [];
  let skipped = 0;
  const queue = [...locations];
  const workers = Array.from({ length: 8 }, async () => {
    for (let loc = queue.shift(); loc; loc = queue.shift()) {
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
        skipped++;
        continue;
      }
      let { panoId, lat, lng } = loc;
      if (!panoId) {
        const hit = await resolvePano({ lat, lng }).catch(() => null);
        if (!hit) {
          skipped++;
          continue;
        }
        ({ panoId, lat, lng } = hit);
      }
      if (!isInTaipei({ lat, lng })) {
        skipped++;
        continue;
      }
      resolved.push({
        panoId,
        lat,
        lng,
        heading: ((Number(loc.heading) || 0) % 360 + 360) % 360,
        pitch: Math.max(-90, Math.min(90, Number(loc.pitch) || 0)),
        zoom: Math.max(0, Math.min(4, Number(loc.zoom) || 0)),
      });
    }
  });
  await Promise.all(workers);

  // De-duplicate by pano id (the table has a unique constraint per map).
  const unique = [...new Map(resolved.map((l) => [l.panoId, l])).values()];
  skipped += resolved.length - unique.length;

  await db.tx(async (tx) => {
    await tx.query('delete from public.map_locations where map_id = $1', [id]);
    const rows = unique.map((l) => ({
      ...l,
      district: findDistrict(l)?.code ?? null,
      village: findVillage(l)?.code ?? null,
    }));
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.query(
        `insert into public.map_locations (map_id, pano_id, lat, lng, heading, pitch, zoom, district_code, village_code)
         select $1, r."panoId", r.lat, r.lng, r.heading, r.pitch, r.zoom, r.district, r.village
         from jsonb_to_recordset($2::jsonb) as r("panoId" text, lat float8, lng float8, heading real, pitch real, zoom real, district text, village text)`,
        [id, JSON.stringify(rows.slice(i, i + 1000))],
      );
    }
    const bbox = unique.length >= 2 ? bboxOfPoints(unique) : TAIPEI_BBOX;
    // Maps that are tiny (e.g. one street) still get a sensible scoring scale.
    const diag = Math.max(1, bboxDiagonalKm(bbox));
    const visibility = unique.length < MIN_PLAYABLE_LOCATIONS && map.visibility === 'public' ? 'unlisted' : map.visibility;
    await tx.query(
      `update public.maps set location_count = $2, bbox = $3::double precision[], diagonal_km = $4, visibility = $5, updated_at = now() where id = $1`,
      [id, unique.length, `{${bbox.join(',')}}`, diag, visibility],
    );
  });
  const updated = await db.one<MapRow>(`select ${MAP_COLUMNS} from ${MAP_FROM} where m.id = $1`, [id]);
  return { map: toMapSummary(updated!), saved: unique.length, skipped };
}

export type MapSort = 'popular' | 'new' | 'liked';

export async function listMaps(db: Db, opts: { sort: MapSort; q?: string; ownerId?: string; viewerId: string | null; limit?: number }): Promise<(MapSummary & { likedByMe: boolean })[]> {
  const order = { popular: 'm.plays desc', new: 'm.created_at desc', liked: 'm.likes desc' }[opts.sort];
  const params: unknown[] = [opts.viewerId];
  let where = `m.kind = 'custom'`;
  if (opts.ownerId) {
    params.push(opts.ownerId);
    // Owners see all their maps; others only public/unlisted ones via direct link — listing shows public only.
    where += ` and m.owner_id = $${params.length}` + (opts.ownerId === opts.viewerId ? '' : ` and m.visibility = 'public'`);
  } else where += ` and m.visibility = 'public' and m.location_count >= ${MIN_PLAYABLE_LOCATIONS}`;
  if (opts.q?.trim()) {
    params.push(`%${opts.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    where += ` and (m.name ilike $${params.length} or m.description ilike $${params.length})`;
  }
  const rows = await db.query<MapRow & { liked: boolean }>(
    `select ${MAP_COLUMNS}, exists(select 1 from public.map_likes l where l.map_id = m.id and l.user_id = $1) as liked
     from ${MAP_FROM} where ${where} order by ${order} limit ${Math.min(opts.limit ?? 60, 100)}`,
    params,
  );
  return rows.map((r) => ({ ...toMapSummary(r), likedByMe: r.liked }));
}

export async function setLike(db: Db, userId: string, mapId: string, like: boolean) {
  const map = await db.one<{ kind: string; visibility: string; owner_id: string | null }>('select kind, visibility, owner_id from public.maps where id = $1', [mapId]);
  if (!map) throw notFound('Map');
  if (map.visibility === 'private' && map.owner_id !== userId) throw forbidden();
  if (like) await db.query('insert into public.map_likes (map_id, user_id) values ($1, $2) on conflict do nothing', [mapId, userId]);
  else await db.query('delete from public.map_likes where map_id = $1 and user_id = $2', [mapId, userId]);
  const row = await db.one<{ likes: number }>(
    `update public.maps set likes = (select count(*) from public.map_likes where map_id = $1) where id = $1 returning likes`,
    [mapId],
  );
  return { likes: row!.likes, liked: like };
}

export async function isLiked(db: Db, userId: string, mapId: string): Promise<boolean> {
  return !!(await db.one('select 1 from public.map_likes where map_id = $1 and user_id = $2', [mapId, userId]));
}
