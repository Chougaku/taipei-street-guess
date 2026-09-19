import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bboxDiagonalKm,
  bboxOfGeometry,
  DISTRICTS,
  districtFeatures,
  TAIPEI_BBOX,
  TAIPEI_DIAGONAL_KM,
  type BBox,
} from '@tg/shared';
import type { Db } from './db.ts';
import { SERVER_DIR } from './env.ts';

export const CITY_MAP_SLUG = 'taipei';

export interface PoolLocation {
  panoId: string;
  lat: number;
  lng: number;
  heading: number;
  district: string;
  village: string | null;
  captureDate: string | null;
}

export function loadLocationPool(file = resolve(SERVER_DIR, 'data/locations.json')): PoolLocation[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as PoolLocation[]) : [];
}

interface OfficialMap {
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  districtCode: string | null;
  bbox: BBox;
  diagonalKm: number;
  sortOrder: number;
}

function officialMaps(): OfficialMap[] {
  return [
    {
      slug: CITY_MAP_SLUG,
      name: '臺北市全區',
      nameEn: 'Taipei City',
      description: '走遍臺北 12 區的大街小巷。',
      districtCode: null,
      bbox: TAIPEI_BBOX,
      diagonalKm: TAIPEI_DIAGONAL_KM,
      sortOrder: 0,
    },
    ...DISTRICTS.map((d, i) => {
      const geom = districtFeatures.features.find((f) => f.properties.code === d.code)!.geometry;
      const bbox = bboxOfGeometry(geom);
      return {
        slug: d.slug,
        name: d.name,
        nameEn: `${d.nameEn} District`,
        description: `只在${d.name}出題，計分更嚴格。`,
        districtCode: d.code,
        bbox,
        diagonalKm: bboxDiagonalKm(bbox),
        sortOrder: i + 1,
      };
    }),
  ];
}

const BATCH = 1000;

/** Idempotently creates the official maps and loads the location pool into the city map. */
export async function seed(db: Db, pool: PoolLocation[] = loadLocationPool(), log: (msg: string) => void = () => {}) {
  for (const m of officialMaps()) {
    await db.query(
      `insert into public.maps (slug, name, name_en, description, kind, district_code, bbox, diagonal_km, sort_order)
       values ($1, $2, $3, $4, 'official', $5, $6::double precision[], $7, $8)
       on conflict (slug) do update set name = excluded.name, name_en = excluded.name_en,
         description = excluded.description, district_code = excluded.district_code,
         bbox = excluded.bbox, diagonal_km = excluded.diagonal_km, sort_order = excluded.sort_order`,
      [m.slug, m.name, m.nameEn, m.description, m.districtCode, `{${m.bbox.join(',')}}`, m.diagonalKm, m.sortOrder],
    );
  }
  const city = await db.one<{ id: string }>('select id from public.maps where slug = $1', [CITY_MAP_SLUG]);
  let inserted = 0;
  for (let i = 0; i < pool.length; i += BATCH) {
    const rows = pool.slice(i, i + BATCH);
    const res = await db.query<{ id: number }>(
      `insert into public.map_locations (map_id, pano_id, lat, lng, heading, district_code, village_code, capture_date)
       select $1, r."panoId", r.lat, r.lng, r.heading, r.district, r.village, r."captureDate"
       from jsonb_to_recordset($2::jsonb) as r("panoId" text, lat float8, lng float8, heading real,
            district text, village text, "captureDate" text)
       on conflict (map_id, pano_id) do nothing
       returning id`,
      [city!.id, JSON.stringify(rows)],
    );
    inserted += res.length;
  }
  await refreshOfficialCounts(db);
  if (inserted) log(`seeded ${inserted} new locations`);
}

export async function refreshOfficialCounts(db: Db) {
  await db.exec(`
    update public.maps m set location_count = (
      select count(*) from public.map_locations l
      join public.maps c on c.id = l.map_id and c.slug = '${CITY_MAP_SLUG}'
      where not l.disabled and (m.district_code is null or l.district_code = m.district_code)
    ) where m.kind = 'official';
  `);
}
