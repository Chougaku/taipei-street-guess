import type { BBox, LatLng } from '@tg/shared';
import { AdvancedMarker, Map, Polyline, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { env } from '../lib/env.ts';

export interface ResultLine {
  key: string | number;
  answer: LatLng;
  guess: LatLng | null;
  label?: string;
  color?: string;
}

interface Props {
  id: string;
  bbox: BBox;
  pin: LatLng | null;
  onPin?(p: LatLng): void;
  /** When set, the map shows answers/guesses and fits to them. */
  results?: ResultLine[];
  /** Other players' guesses (multiplayer results). */
  extraGuesses?: { key: string; position: LatLng; color: string; label: string }[];
  interactive?: boolean;
  children?: ReactNode;
  className?: string;
  /** Changes whenever the map container is resized, to re-fit results. */
  layoutKey?: string;
  /** Changes when a new round starts, to reset the guess map to the whole map area. */
  resetKey?: string;
  /** Whether the map is currently on screen (the mobile sheet can hide it). */
  visible?: boolean;
  /** Padding for fitting results, given the map size (room for overlays). */
  fitPadding?: (w: number, h: number) => google.maps.Padding | number;
}

const defaultFitPadding = (_w: number, h: number): google.maps.Padding => ({
  top: 70,
  left: 40,
  right: 40,
  bottom: Math.min(300, Math.round(h * 0.45)),
});

const bboxToBounds = (b: BBox): google.maps.LatLngBoundsLiteral => ({ west: b[0], south: b[1], east: b[2], north: b[3] });

export function GuessPinIcon({ color = '#ff5a36', label }: { color?: string; label?: string }) {
  return (
    <div className="relative -translate-y-1 animate-pop">
      <svg width="30" height="40" viewBox="0 0 30 40" aria-hidden>
        <path
          d="M15 1C7.3 1 1 7.1 1 14.7 1 24.5 13.4 37.6 14.1 38.3a1.2 1.2 0 0 0 1.8 0C16.6 37.6 29 24.5 29 14.7 29 7.1 22.7 1 15 1z"
          fill={color}
          stroke="#fff"
          strokeWidth="2"
        />
        <circle cx="15" cy="14.5" r="5.5" fill="#fff" />
      </svg>
      {label && (
        <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-ink/80 px-1.5 text-[11px] font-bold text-white">
          {label}
        </span>
      )}
    </div>
  );
}

export function AnswerFlagIcon({ label }: { label?: string }) {
  return (
    <div className="relative grid size-8 place-items-center rounded-full border-2 border-white bg-good shadow-lg animate-pop">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden>
        <path d="M5 3v18h2v-7h9l-1-3 1-3H7V3z" />
      </svg>
      {label && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-ink text-[10px] font-bold">{label}</span>}
    </div>
  );
}

/**
 * Shows the whole map area at the start of each round and whenever the map becomes visible
 * (e.g. the mobile bottom sheet opens) — until the player pans or zooms it themselves.
 */
function FitBBox({ bbox, resetKey, visible }: { bbox: BBox; resetKey?: string; visible: boolean }) {
  const map = useMap();
  const interacted = useRef(false);
  const lastReset = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!map) return;
    const div = map.getDiv();
    const mark = () => {
      interacted.current = true;
    };
    div.addEventListener('pointerdown', mark);
    div.addEventListener('wheel', mark, { passive: true });
    return () => {
      div.removeEventListener('pointerdown', mark);
      div.removeEventListener('wheel', mark);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !visible) return;
    if (lastReset.current !== resetKey) {
      lastReset.current = resetKey;
      interacted.current = false;
    }
    const fit = () => {
      if (!interacted.current) map.fitBounds(bboxToBounds(bbox), 8);
    };
    fit();
    // A map that was hidden applies its initial camera on the first rendered frame; fit again then.
    const idle = google.maps.event.addListenerOnce(map, 'idle', fit);
    const tiles = google.maps.event.addListenerOnce(map, 'tilesloaded', fit);
    const stop = setTimeout(() => {
      idle.remove();
      tiles.remove();
    }, 2500);
    return () => {
      idle.remove();
      tiles.remove();
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, resetKey, visible, bbox[0], bbox[1], bbox[2], bbox[3]]);
  return null;
}

function FitResults({
  results,
  extra,
  bbox,
  layoutKey,
  padding,
}: {
  results?: ResultLine[];
  extra?: LatLng[];
  bbox: BBox;
  layoutKey?: string;
  padding: (w: number, h: number) => google.maps.Padding | number;
}) {
  const map = useMap();
  const points = [...(results ?? []).flatMap((r) => (r.guess ? [r.answer, r.guess] : [r.answer])), ...(extra ?? [])];
  const pointsKey = JSON.stringify(points);
  useEffect(() => {
    if (!map) return;
    const points = JSON.parse(pointsKey) as LatLng[];
    const fit = () => {
      if (points.length === 0) {
        map.fitBounds(bboxToBounds(bbox), 8);
        return;
      }
      const b = new google.maps.LatLngBounds();
      points.forEach((p) => b.extend(p));
      if (points.length === 1) {
        map.setCenter(points[0]!);
        map.setZoom(15);
        return;
      }
      // Leave room for the HUD and the result card.
      const div = map.getDiv();
      map.fitBounds(b, padding(div.clientWidth, div.clientHeight));
    };
    // The container resizes from mini map to full screen; re-fit whenever its size settles.
    // Before the map has initialised (no projection yet) fitBounds is unreliable, so wait for 'idle'.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: google.maps.MapsEventListener | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!map.getProjection()) {
        idle ??= google.maps.event.addListenerOnce(map, 'idle', () => {
          idle = undefined;
          fit();
        });
        return;
      }
      timer = setTimeout(fit, 120);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(map.getDiv());
    schedule();
    // The Maps API applies its initial camera on the first rendered frame, which can undo an
    // earlier fitBounds (e.g. when the page was loaded in a background tab) — fit again then.
    const tiles = google.maps.event.addListenerOnce(map, 'tilesloaded', fit);
    // Only for the initial load — later tile loads come from the player panning.
    const stopTiles = setTimeout(() => tiles.remove(), 2500);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
      idle?.remove();
      tiles.remove();
      clearTimeout(stopTiles);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pointsKey, bbox, layoutKey]);
  return null;
}

export function GameMap({
  id,
  bbox,
  pin,
  onPin,
  results,
  extraGuesses,
  interactive = true,
  children,
  className,
  layoutKey,
  resetKey,
  visible = true,
  fitPadding = defaultFitPadding,
}: Props) {
  const showingResults = results !== undefined;
  const defaultCenter = useMemo(() => ({ lat: (bbox[1] + bbox[3]) / 2, lng: (bbox[0] + bbox[2]) / 2 }), [bbox]);

  return (
    <Map
      id={id}
      className={className}
      mapId={env.googleMapId}
      reuseMaps
      // No `restriction`/`defaultBounds`: the Maps API re-applies them lazily and they fight with our
      // own fitBounds calls. Start from a centre/zoom and fit explicitly (FitBBox / FitResults).
      defaultCenter={defaultCenter}
      defaultZoom={11}
      gestureHandling="greedy"
      disableDefaultUI
      clickableIcons={false}
      keyboardShortcuts={false}
      minZoom={10}
      draggableCursor={showingResults ? undefined : 'crosshair'}
      onClick={(e: MapMouseEvent) => {
        if (!interactive || showingResults || !e.detail.latLng) return;
        onPin?.(e.detail.latLng);
      }}
    >
      {pin && !showingResults && (
        <AdvancedMarker position={pin} zIndex={10}>
          <GuessPinIcon />
        </AdvancedMarker>
      )}
      {results?.map((r) => (
        <ResultMarkers key={r.key} r={r} />
      ))}
      {extraGuesses?.map((g) => (
        <AdvancedMarker key={g.key} position={g.position} zIndex={5}>
          <GuessPinIcon color={g.color} label={g.label} />
        </AdvancedMarker>
      ))}
      {!showingResults && <FitBBox bbox={bbox} resetKey={resetKey} visible={visible} />}
      {showingResults && (
        <FitResults
          results={results}
          extra={extraGuesses?.map((g) => g.position)}
          bbox={bbox}
          layoutKey={layoutKey}
          padding={fitPadding}
        />
      )}
      {children}
    </Map>
  );
}

function ResultMarkers({ r }: { r: ResultLine }) {
  return (
    <>
      {r.guess && (
        <Polyline
          path={[r.guess, r.answer]}
          strokeOpacity={0}
          icons={[
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#0b1220', strokeWeight: 3, scale: 3 },
              offset: '0',
              repeat: '14px',
            },
          ]}
        />
      )}
      <AdvancedMarker position={r.answer} zIndex={20}>
        <AnswerFlagIcon label={r.label} />
      </AdvancedMarker>
      {r.guess && (
        <AdvancedMarker position={r.guess} zIndex={15}>
          <GuessPinIcon color={r.color} />
        </AdvancedMarker>
      )}
    </>
  );
}
