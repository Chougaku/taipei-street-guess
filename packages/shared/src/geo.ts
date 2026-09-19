import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

export interface LatLng {
  lat: number;
  lng: number;
}

/** [west, south, east, north] */
export type BBox = [number, number, number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bboxOfPoints(points: Iterable<LatLng>): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
  }
  return [w, s, e, n];
}

export function bboxOfGeometry(geom: Polygon | MultiPolygon): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys)
    for (const ring of poly)
      for (const [x, y] of ring as [number, number][]) {
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
      }
  return [w, s, e, n];
}

export function mergeBBoxes(boxes: BBox[]): BBox {
  return boxes.reduce<BBox>(
    (acc, b) => [Math.min(acc[0], b[0]), Math.min(acc[1], b[1]), Math.max(acc[2], b[2]), Math.max(acc[3], b[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

/** Diagonal of a bounding box in kilometres — the "map size" used for scoring. */
export function bboxDiagonalKm(b: BBox): number {
  return haversineMeters({ lat: b[1], lng: b[0] }, { lat: b[3], lng: b[2] }) / 1000;
}

export function bboxContains(b: BBox, p: LatLng): boolean {
  return p.lng >= b[0] && p.lng <= b[2] && p.lat >= b[1] && p.lat <= b[3];
}

function ringContains(ring: Position[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!, yi = ring[i]![1]!;
    const xj = ring[j]![0]!, yj = ring[j]![1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(poly: Position[][], x: number, y: number): boolean {
  if (!poly[0] || !ringContains(poly[0], x, y)) return false;
  for (let h = 1; h < poly.length; h++) if (ringContains(poly[h]!, x, y)) return false;
  return true;
}

export function geometryContains(geom: Polygon | MultiPolygon, p: LatLng): boolean {
  if (geom.type === 'Polygon') return polygonContains(geom.coordinates, p.lng, p.lat);
  return geom.coordinates.some((poly) => polygonContains(poly, p.lng, p.lat));
}

export interface RegionIndex<P> {
  features: Feature<Polygon | MultiPolygon, P>[];
  find(p: LatLng): P | null;
  bbox: BBox;
}

/** Point-in-polygon lookup with a bbox prefilter. */
export function createRegionIndex<P>(fc: FeatureCollection<Polygon | MultiPolygon, P>): RegionIndex<P> {
  const entries = fc.features.map((f) => ({ f, bbox: bboxOfGeometry(f.geometry) }));
  return {
    features: fc.features,
    bbox: mergeBBoxes(entries.map((e) => e.bbox)),
    find(p) {
      for (const { f, bbox } of entries) if (bboxContains(bbox, p) && geometryContains(f.geometry, p)) return f.properties;
      return null;
    },
  };
}

/** Uniform random point inside a geometry via rejection sampling. */
export function randomPointInGeometry(geom: Polygon | MultiPolygon, rand: () => number, bbox = bboxOfGeometry(geom)): LatLng {
  for (let i = 0; i < 10_000; i++) {
    const p = { lng: bbox[0] + rand() * (bbox[2] - bbox[0]), lat: bbox[1] + rand() * (bbox[3] - bbox[1]) };
    if (geometryContains(geom, p)) return p;
  }
  throw new Error('randomPointInGeometry: failed to sample a point');
}

/** Initial compass bearing from a to b, degrees [0, 360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
