import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { useMap } from '@vis.gl/react-google-maps';
import { useEffect, useRef } from 'react';

export interface RegionStyle {
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWeight?: number;
}

/**
 * Draws district / village outlines with a Data layer (much lighter than hundreds of
 * Polygon components). Features aren't clickable, so map clicks still place the pin.
 */
export function RegionLayer({
  features,
  styles,
  baseStroke = '#0b1220',
  baseOpacity = 0.35,
}: {
  features: FeatureCollection<Polygon | MultiPolygon, { code: string }>;
  /** Per-region overrides keyed by region code. */
  styles: Record<string, RegionStyle>;
  baseStroke?: string;
  baseOpacity?: number;
}) {
  const map = useMap();
  const layer = useRef<google.maps.Data | null>(null);
  const stylesRef = useRef(styles);
  stylesRef.current = styles;

  useEffect(() => {
    if (!map) return;
    const data = new google.maps.Data({ map });
    data.addGeoJson(features, { idPropertyName: 'code' });
    layer.current = data;
    return () => {
      data.setMap(null);
      layer.current = null;
    };
  }, [map, features]);

  useEffect(() => {
    layer.current?.setStyle((f) => {
      const s = stylesRef.current[String(f.getProperty('code'))];
      return {
        clickable: false,
        fillColor: s?.fill ?? '#000000',
        fillOpacity: s ? (s.fillOpacity ?? 0.35) : 0,
        strokeColor: s?.stroke ?? baseStroke,
        strokeOpacity: s ? 0.9 : baseOpacity,
        strokeWeight: s?.strokeWeight ?? (s ? 2 : 1),
        zIndex: s ? 2 : 1,
      };
    });
  }, [styles, baseStroke, baseOpacity, map, features]);

  return null;
}
