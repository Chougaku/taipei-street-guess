import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import cityJson from './data/taipei-city.geo.json' with { type: 'json' };
import districtsJson from './data/taipei-districts.geo.json' with { type: 'json' };
import { bboxDiagonalKm, createRegionIndex, geometryContains, type LatLng } from './geo.ts';

export interface DistrictProps {
  code: string;
  name: string;
  nameEn: string;
}

export interface District extends DistrictProps {
  slug: string;
  /** Accent colour used on maps and badges. */
  color: string;
}

export const TAIPEI_CITY_CODE = '63000';

const META: Record<string, { slug: string; color: string }> = {
  '63000010': { slug: 'songshan', color: '#e76f51' },
  '63000020': { slug: 'xinyi', color: '#f4a261' },
  '63000030': { slug: 'daan', color: '#e9c46a' },
  '63000040': { slug: 'zhongshan', color: '#8ab17d' },
  '63000050': { slug: 'zhongzheng', color: '#2a9d8f' },
  '63000060': { slug: 'datong', color: '#287271' },
  '63000070': { slug: 'wanhua', color: '#b56576' },
  '63000080': { slug: 'wenshan', color: '#6d597a' },
  '63000090': { slug: 'nangang', color: '#355070' },
  '63000100': { slug: 'neihu', color: '#4d908e' },
  '63000110': { slug: 'shilin', color: '#577590' },
  '63000120': { slug: 'beitou', color: '#c9184a' },
};

export const districtFeatures = districtsJson as unknown as FeatureCollection<Polygon | MultiPolygon, DistrictProps>;
export const cityFeature = (cityJson as unknown as FeatureCollection<Polygon | MultiPolygon>).features[0]!;

export const DISTRICTS: District[] = districtFeatures.features.map((f) => ({ ...f.properties, ...META[f.properties.code]! }));
export const DISTRICT_BY_CODE = new Map(DISTRICTS.map((d) => [d.code, d]));
export const DISTRICT_BY_SLUG = new Map(DISTRICTS.map((d) => [d.slug, d]));

const districtIndex = createRegionIndex(districtFeatures);

export function findDistrict(p: LatLng): District | null {
  const props = districtIndex.find(p);
  return props ? DISTRICT_BY_CODE.get(props.code)! : null;
}

export function isInTaipei(p: LatLng): boolean {
  return geometryContains(cityFeature.geometry as Polygon | MultiPolygon, p);
}

export const TAIPEI_BBOX = districtIndex.bbox;
export const TAIPEI_DIAGONAL_KM = bboxDiagonalKm(TAIPEI_BBOX);
export const TAIPEI_CENTER: LatLng = { lat: 25.0478, lng: 121.5319 };
