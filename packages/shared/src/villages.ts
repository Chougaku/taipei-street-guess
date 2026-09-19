/** Village (里) boundaries are ~190 KiB, so they live in their own entry point for lazy loading. */
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import villagesJson from './data/taipei-villages.geo.json' with { type: 'json' };
import { createRegionIndex, type LatLng } from './geo.ts';

export interface VillageProps {
  code: string;
  name: string;
  nameEn: string;
  /** District TOWNCODE */
  district: string;
}

export const villageFeatures = villagesJson as unknown as FeatureCollection<Polygon | MultiPolygon, VillageProps>;
export const VILLAGE_BY_CODE = new Map(villageFeatures.features.map((f) => [f.properties.code, f.properties]));

const villageIndex = createRegionIndex(villageFeatures);

export function findVillage(p: LatLng): VillageProps | null {
  return villageIndex.find(p);
}
