import {
  bboxDiagonalKm,
  bboxOfGeometry,
  bboxOfPoints,
  DISTRICTS,
  districtFeatures,
  TAIPEI_BBOX,
  TAIPEI_DIAGONAL_KM,
  type BBox,
  type MapSummary,
} from '@tg/shared';
import { countIn } from './pool.ts';
import { load, type LocalMap } from './store.ts';

export const CITY_SLUG = 'taipei';

export interface LocalMapInfo extends MapSummary {
  likedByMe: boolean;
  /** Null for official maps, which draw from the bundled pool. */
  custom: LocalMap | null;
}

const districtBBox = new Map<string, BBox>(
  districtFeatures.features.map((f) => [f.properties.code, bboxOfGeometry(f.geometry)] as const),
);

function officialMap(slug: string): LocalMapInfo | null {
  if (slug === CITY_SLUG) {
    return {
      id: CITY_SLUG,
      slug: CITY_SLUG,
      name: '臺北市全區',
      nameEn: 'Taipei City',
      description: '走遍臺北 12 區的大街小巷。',
      kind: 'official',
      districtCode: null,
      bbox: TAIPEI_BBOX,
      diagonalKm: TAIPEI_DIAGONAL_KM,
      locationCount: countIn(null),
      visibility: 'public',
      ownerId: null,
      ownerName: null,
      likes: 0,
      plays: 0,
      likedByMe: false,
      custom: null,
    };
  }
  const d = DISTRICTS.find((x) => x.slug === slug);
  if (!d) return null;
  const bbox = districtBBox.get(d.code)!;
  return {
    id: d.slug,
    slug: d.slug,
    name: d.name,
    nameEn: `${d.nameEn} District`,
    description: `只在${d.name}出題，計分更嚴格。`,
    kind: 'official',
    districtCode: d.code,
    bbox,
    diagonalKm: bboxDiagonalKm(bbox),
    locationCount: countIn(d.code),
    visibility: 'public',
    ownerId: null,
    ownerName: null,
    likes: 0,
    plays: 0,
    likedByMe: false,
    custom: null,
  };
}

export function officialMaps(): LocalMapInfo[] {
  return [officialMap(CITY_SLUG)!, ...DISTRICTS.map((d) => officialMap(d.slug)!)];
}

export function customMapInfo(map: LocalMap): LocalMapInfo {
  const points = map.locations;
  const bbox = points.length >= 2 ? bboxOfPoints(points) : TAIPEI_BBOX;
  const state = load();
  return {
    id: map.id,
    slug: map.slug,
    name: map.name,
    nameEn: map.name,
    description: map.description,
    kind: 'custom',
    districtCode: null,
    bbox,
    diagonalKm: Math.max(1, bboxDiagonalKm(bbox)),
    locationCount: points.length,
    visibility: map.visibility,
    ownerId: state.profile.id,
    ownerName: state.profile.nickname,
    likes: map.likes,
    plays: map.plays,
    likedByMe: map.likedByMe,
    custom: map,
  };
}

export function findMap(slugOrId: string): LocalMapInfo | null {
  const official = officialMaps().find((m) => m.slug === slugOrId);
  if (official) return official;
  const state = load();
  const custom = Object.values(state.maps).find((m) => m.slug === slugOrId || m.id === slugOrId);
  return custom ? customMapInfo(custom) : null;
}
