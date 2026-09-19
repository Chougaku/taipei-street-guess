import { districtFeatures, findDistrict, type LatLng, type StreakLevel } from '@tg/shared';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { useEffect, useState } from 'react';
import i18n from '../i18n/index.ts';

type VillagesModule = typeof import('@tg/shared/villages');
let villages: VillagesModule | null = null;
let loading: Promise<VillagesModule> | null = null;

/** Village boundaries are ~190 KiB, so they're only loaded for village mode. */
export function loadVillages(): Promise<VillagesModule> {
  loading ??= import('@tg/shared/villages').then((m) => (villages = m));
  return loading;
}

export interface RegionData {
  features: FeatureCollection<Polygon | MultiPolygon, { code: string }>;
  find(p: LatLng): string | null;
  name(code: string): string;
}

const districtName = (code: string) => i18n.t(`district.${code}`);

const DISTRICT_DATA: RegionData = {
  features: districtFeatures,
  find: (p) => findDistrict(p)?.code ?? null,
  name: districtName,
};

function villageData(m: VillagesModule): RegionData {
  return {
    features: m.villageFeatures,
    find: (p) => m.findVillage(p)?.code ?? null,
    name: (code) => {
      const v = m.VILLAGE_BY_CODE.get(code);
      if (!v) return code;
      return i18n.language === 'en' ? `${v.nameEn}, ${districtName(v.district)}` : `${districtName(v.district)} ${v.name}`;
    },
  };
}

/** Region lookup + names for a streak level (null while village data is loading). */
export function useRegions(level: StreakLevel): RegionData | null {
  const [data, setData] = useState<RegionData | null>(() =>
    level === 'district' ? DISTRICT_DATA : villages ? villageData(villages) : null,
  );
  useEffect(() => {
    if (level === 'district') {
      setData(DISTRICT_DATA);
      return;
    }
    let alive = true;
    void loadVillages().then((m) => alive && setData(villageData(m)));
    return () => {
      alive = false;
    };
  }, [level]);
  return data;
}
