/**
 * Builds the pool of playable locations for Taipei City using the (free)
 * Street View metadata endpoint.
 *
 *   npm run locations:gen -- --total 12000 --min-per-district 300
 *   npm run locations:gen -- --district datong --min-per-district 400   # top up one district
 *
 * Results are appended to apps/server/data/locations.json, so the script can be
 * re-run to resume or top up.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  cityFeature,
  DISTRICT_BY_SLUG,
  DISTRICTS,
  districtFeatures,
  findDistrict,
  haversineMeters,
  randomPointInGeometry,
  type LatLng,
} from '@tg/shared';
import { findVillage } from '@tg/shared/villages';
import type { MultiPolygon, Polygon } from 'geojson';

export interface PoolLocation {
  panoId: string;
  lat: number;
  lng: number;
  heading: number;
  district: string;
  village: string | null;
  captureDate: string | null;
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../../apps/server/data/locations.json');

const { values: args } = parseArgs({
  options: {
    total: { type: 'string', default: '12000' },
    'min-per-district': { type: 'string', default: '300' },
    radius: { type: 'string', default: '60' },
    spacing: { type: 'string', default: '80' },
    concurrency: { type: 'string', default: '16' },
    district: { type: 'string' },
    'max-requests': { type: 'string', default: '120000' },
  },
});

const KEY = process.env.GOOGLE_MAPS_SERVER_KEY;
if (!KEY) throw new Error('GOOGLE_MAPS_SERVER_KEY is not set (see .env.example)');

const total = Number(args.total);
const minPerDistrict = Number(args['min-per-district']);
const radius = Number(args.radius);
const spacing = Number(args.spacing);
const concurrency = Number(args.concurrency);
const maxRequests = Number(args['max-requests']);

mkdirSync(dirname(OUT), { recursive: true });
const pool: PoolLocation[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const seenPanos = new Set(pool.map((l) => l.panoId));

// Spatial hash for the minimum-spacing check (cells ≈ spacing metres).
const cellDeg = spacing / 111_000;
const grid = new Map<string, LatLng[]>();
const cellKey = (x: number, y: number) => `${x},${y}`;
function tooClose(p: LatLng): boolean {
  const cx = Math.floor(p.lng / cellDeg);
  const cy = Math.floor(p.lat / cellDeg);
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (const q of grid.get(cellKey(cx + dx, cy + dy)) ?? []) if (haversineMeters(p, q) < spacing) return true;
  return false;
}
function addToGrid(p: LatLng) {
  const k = cellKey(Math.floor(p.lng / cellDeg), Math.floor(p.lat / cellDeg));
  const cell = grid.get(k);
  if (cell) cell.push(p);
  else grid.set(k, [p]);
}
pool.forEach(addToGrid);

interface Metadata {
  status: string;
  copyright?: string;
  date?: string;
  location?: LatLng;
  pano_id?: string;
}

let requests = 0;
const stats = { ok: 0, zero: 0, nonGoogle: 0, outside: 0, dupe: 0, close: 0, error: 0 };

async function lookup(p: LatLng): Promise<Metadata | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/streetview/metadata');
  url.searchParams.set('location', `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('source', 'outdoor');
  url.searchParams.set('key', KEY!);
  for (let attempt = 0; attempt < 4; attempt++) {
    requests++;
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as Metadata;
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt === 3) {
        stats.error++;
        console.warn('lookup failed', String(err));
        return null;
      }
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  return null;
}

function accept(meta: Metadata | null, expectedDistrict: string | null): PoolLocation | null {
  if (!meta || meta.status !== 'OK' || !meta.location || !meta.pano_id) {
    stats.zero++;
    return null;
  }
  // Only official Google coverage — user-contributed photospheres are excluded.
  if ((meta.copyright ?? '').replace(/\s+/g, '') !== '©Google') {
    stats.nonGoogle++;
    return null;
  }
  const loc = meta.location;
  const district = findDistrict(loc);
  if (!district || (expectedDistrict && district.code !== expectedDistrict)) {
    stats.outside++;
    return null;
  }
  if (seenPanos.has(meta.pano_id)) {
    stats.dupe++;
    return null;
  }
  if (tooClose(loc)) {
    stats.close++;
    return null;
  }
  seenPanos.add(meta.pano_id);
  addToGrid(loc);
  stats.ok++;
  return {
    panoId: meta.pano_id,
    lat: Number(loc.lat.toFixed(7)),
    lng: Number(loc.lng.toFixed(7)),
    heading: Math.floor(Math.random() * 360),
    district: district.code,
    village: findVillage(loc)?.code ?? null,
    captureDate: meta.date ?? null,
  };
}

function countByDistrict(): Map<string, number> {
  const m = new Map<string, number>(DISTRICTS.map((d) => [d.code, 0]));
  for (const l of pool) m.set(l.district, (m.get(l.district) ?? 0) + 1);
  return m;
}

const STAGNATION_LIMIT = 3000;

async function fill(geom: Polygon | MultiPolygon, districtCode: string | null, done: () => boolean) {
  let lastLog = Date.now();
  let stagnant = 0;
  const worker = async () => {
    while (!done() && requests < maxRequests && stagnant < STAGNATION_LIMIT) {
      const p = randomPointInGeometry(geom, Math.random);
      const loc = accept(await lookup(p), districtCode);
      if (loc) {
        pool.push(loc);
        stagnant = 0;
      } else stagnant++;
      if (Date.now() - lastLog > 5000) {
        lastLog = Date.now();
        console.log(`  pool=${pool.length} requests=${requests}`, JSON.stringify(stats));
        writeFileSync(OUT, JSON.stringify(pool));
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (stagnant >= STAGNATION_LIMIT) console.warn(`  stopped: nothing new in the last ${STAGNATION_LIMIT} attempts`);
}

const only = args.district ? DISTRICT_BY_SLUG.get(args.district) : null;
if (args.district && !only) throw new Error(`Unknown district slug: ${args.district}`);

if (!only) {
  console.log(`Sampling the whole city until ${total} locations…`);
  await fill(cityFeature.geometry as Polygon | MultiPolygon, null, () => pool.length >= total);
}

for (const d of only ? [only] : DISTRICTS) {
  const feature = districtFeatures.features.find((f) => f.properties.code === d.code)!;
  const have = () => countByDistrict().get(d.code) ?? 0;
  if (have() >= minPerDistrict) continue;
  console.log(`Topping up ${d.name} (${have()} → ${minPerDistrict})…`);
  await fill(feature.geometry, d.code, () => have() >= minPerDistrict);
}

writeFileSync(OUT, JSON.stringify(pool));
console.log(`\nDone. ${pool.length} locations, ${requests} requests`, JSON.stringify(stats));
const counts = countByDistrict();
for (const d of DISTRICTS) console.log(`  ${d.nameEn.padEnd(11)} ${counts.get(d.code)}`);
