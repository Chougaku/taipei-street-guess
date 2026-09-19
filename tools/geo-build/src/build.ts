/**
 * Extracts Taipei City's 12 districts and 456 villages (里) from the
 * Ministry of the Interior boundaries published in `taiwan-atlas`, simplifies
 * them, and writes compact GeoJSON into packages/shared/src/data.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import simplify from '@turf/simplify';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { feature, merge } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

const TAIPEI_COUNTY_CODE = '63000';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../packages/shared/src/data');

type Props = Record<string, string>;
type Geom = Polygon | MultiPolygon;

function loadTopology(file: string): Topology {
  return JSON.parse(readFileSync(require.resolve(`taiwan-atlas/${file}`), 'utf8')) as Topology;
}

function roundCoords(geom: Geom, digits = 5): Geom {
  const f = 10 ** digits;
  const r = (p: Position): Position => [Math.round(p[0]! * f) / f, Math.round(p[1]! * f) / f];
  const ring = (rg: Position[]) => {
    const out: Position[] = [];
    for (const p of rg.map(r)) {
      const last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
    return out;
  };
  if (geom.type === 'Polygon') return { type: 'Polygon', coordinates: geom.coordinates.map(ring) };
  return { type: 'MultiPolygon', coordinates: geom.coordinates.map((poly) => poly.map(ring)) };
}

function extract(
  topo: Topology,
  objectName: string,
  tolerance: number,
  mapProps: (p: Props) => Props,
): FeatureCollection<Geom, Props> {
  const obj = topo.objects[objectName] as GeometryCollection<Props>;
  const fc = feature(topo, obj) as FeatureCollection<Geom, Props>;
  const features = fc.features
    .filter((f) => f.properties.COUNTYCODE === TAIPEI_COUNTY_CODE)
    .map((f): Feature<Geom, Props> => {
      const simplified = simplify(f, { tolerance, highQuality: true }) as Feature<Geom, Props>;
      return { type: 'Feature', properties: mapProps(f.properties), geometry: roundCoords(simplified.geometry) };
    });
  return { type: 'FeatureCollection', features };
}

const towns = loadTopology('towns-10t.json');
const districts = extract(towns, 'towns', 0.00003, (p) => ({
  code: p.TOWNCODE!,
  name: p.TOWNNAME!,
  nameEn: p.TOWNENG!.replace(/ District$/, ''),
}));
districts.features.sort((a, b) => a.properties.code.localeCompare(b.properties.code));

// City outline = union of all Taipei district geometries.
const townObj = towns.objects.towns as GeometryCollection<Props>;
const cityGeom = merge(
  towns,
  townObj.geometries.filter((g) => g.properties?.COUNTYCODE === TAIPEI_COUNTY_CODE) as never,
) as MultiPolygon;
const city: FeatureCollection<Geom, Props> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { code: TAIPEI_COUNTY_CODE, name: '臺北市', nameEn: 'Taipei City' },
      geometry: roundCoords(
        (simplify({ type: 'Feature', properties: {}, geometry: cityGeom }, { tolerance: 0.00003, highQuality: true })
          .geometry as Geom),
      ),
    },
  ],
};

const villagesTopo = loadTopology('villages-10t.json');
const villages = extract(villagesTopo, 'villages', 0.00002, (p) => ({
  code: p.VILLCODE!,
  name: p.VILLNAME!,
  nameEn: p.VILLENG!,
  district: p.TOWNCODE!,
}));
villages.features.sort((a, b) => a.properties.code.localeCompare(b.properties.code));

function write(name: string, data: unknown) {
  const path = resolve(outDir, name);
  const json = JSON.stringify(data);
  writeFileSync(path, json);
  console.log(`${name}: ${(json.length / 1024).toFixed(1)} KiB`);
}

write('taipei-city.geo.json', city);
write('taipei-districts.geo.json', districts);
write('taipei-villages.geo.json', villages);
console.log(`districts=${districts.features.length} villages=${villages.features.length}`);
