import { DISTRICTS, sample, type LatLng } from '@tg/shared';
import data from 'virtual:tg-location-pool';

export interface PoolLocation extends LatLng {
  /** Index in the bundled pool — stable, so challenge links can reference it. */
  index: number;
  panoId: string;
  heading: number;
  district: string;
  village: string | null;
}

const expanded: PoolLocation[] = (data?.l ?? []).map(([panoId, lat, lng, heading, di, vi], index) => ({
  index,
  panoId,
  lat: lat / 1e5,
  lng: lng / 1e5,
  heading,
  district: data!.d[di]!,
  village: vi >= 0 ? (data!.v[vi] ?? null) : null,
}));

const byDistrict = new Map<string, PoolLocation[]>();
for (const loc of expanded) {
  const list = byDistrict.get(loc.district);
  if (list) list.push(loc);
  else byDistrict.set(loc.district, [loc]);
}

export const pool = expanded;
export const poolSize = expanded.length;
export const countIn = (district: string | null) => (district ? (byDistrict.get(district)?.length ?? 0) : expanded.length);
export const at = (index: number): PoolLocation | null => expanded[index] ?? null;
export const byPanoId = (panoId: string) => expanded.find((l) => l.panoId === panoId) ?? null;

interface PickOptions {
  district?: string | null;
  requireVillage?: boolean;
  exclude?: Set<number>;
  rand?: () => number;
}

/** One random location, optionally restricted to a district. */
export function pickOne({ district = null, requireVillage = false, exclude, rand = Math.random }: PickOptions = {}): PoolLocation | null {
  const candidates = district ? (byDistrict.get(district) ?? []) : expanded;
  if (candidates.length === 0) return null;
  for (let i = 0; i < 60; i++) {
    const loc = candidates[Math.floor(rand() * candidates.length)]!;
    if (exclude?.has(loc.index)) continue;
    if (requireVillage && !loc.village) continue;
    return loc;
  }
  return candidates.find((l) => !exclude?.has(l.index) && (!requireVillage || l.village)) ?? null;
}

/**
 * Picks `n` locations for a map. The whole-city map weights all 12 districts equally
 * (matching the server), so games don't drift towards the mountains.
 */
export function pickMany(n: number, opts: { district?: string | null; exclude?: Set<number>; rand?: () => number } = {}): PoolLocation[] {
  const rand = opts.rand ?? Math.random;
  const exclude = new Set(opts.exclude ?? []);
  const out: PoolLocation[] = [];
  if (opts.district) {
    for (let i = 0; i < n; i++) {
      const loc = pickOne({ district: opts.district, exclude, rand });
      if (!loc) break;
      exclude.add(loc.index);
      out.push(loc);
    }
    return out;
  }
  const districts: string[] = [];
  while (districts.length < n) districts.push(...sample(DISTRICTS, Math.min(DISTRICTS.length, n - districts.length), rand).map((d) => d.code));
  for (const district of districts) {
    const loc = pickOne({ district, exclude, rand });
    if (!loc) continue;
    exclude.add(loc.index);
    out.push(loc);
  }
  return out;
}
