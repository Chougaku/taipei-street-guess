import type { MovementMode, PanoView } from '@tg/shared';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { forwardRef, useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import { env } from '../lib/env.ts';

export interface StreetViewHandle {
  returnToStart(): void;
  undo(): void;
  zoomBy(delta: number): void;
}

interface Props {
  pano: PanoView;
  movement: MovementMode;
  motionControl?: boolean;
  /** Rotated to match the camera heading on every POV change (imperatively, no re-render). */
  compassRef?: RefObject<HTMLElement | null>;
  onReady?(): void;
  onFailed?(): void;
}

function optionsFor(movement: MovementMode, motion: boolean): google.maps.StreetViewPanoramaOptions {
  const moving = movement === 'moving';
  const frozen = movement === 'nmpz';
  return {
    addressControl: false,
    showRoadLabels: false,
    disableDefaultUI: true,
    fullscreenControl: false,
    panControl: false,
    zoomControl: false,
    enableCloseButton: false,
    imageDateControl: false,
    linksControl: moving,
    clickToGo: moving,
    scrollwheel: !frozen,
    disableDoubleClickZoom: !moving,
    motionTracking: motion && !frozen,
    motionTrackingControl: false,
  };
}

/**
 * One StreetViewPanorama instance for the whole game: rounds swap the pano with
 * setPano() instead of re-creating it, which loads faster on phones.
 */
export const StreetView = forwardRef<StreetViewHandle, Props>(function StreetView(
  { pano, movement, motionControl = false, compassRef, onReady, onFailed },
  ref,
) {
  const lib = useMapsLibrary('streetView');
  const el = useRef<HTMLDivElement>(null);
  const svRef = useRef<google.maps.StreetViewPanorama | null>(null);
  /** Panos visited in this round, for "undo move". */
  const history = useRef<string[]>([]);
  const lastPano = useRef(pano.panoId);
  /** True while we're changing the pano ourselves (so it isn't recorded in history). */
  const programmatic = useRef(false);
  /** One ready/failed callback per round. */
  const settled = useRef(false);
  const start = useRef(pano);
  const callbacks = useRef({ onReady, onFailed });
  callbacks.current = { onReady, onFailed };
  start.current = pano;

  useEffect(() => {
    if (!lib || !el.current || svRef.current || env.streetViewMock) return;
    const sv = new lib.StreetViewPanorama(el.current, {
      ...optionsFor(movement, motionControl),
      pano: pano.panoId,
      pov: { heading: pano.heading, pitch: pano.pitch },
      zoom: pano.zoom,
    });
    svRef.current = sv;

    sv.addListener('status_changed', () => {
      if (settled.current) return;
      settled.current = true;
      if (sv.getStatus() === google.maps.StreetViewStatus.OK) callbacks.current.onReady?.();
      else callbacks.current.onFailed?.();
    });
    sv.addListener('pano_changed', () => {
      const id = sv.getPano();
      if (!id || id === lastPano.current) return;
      if (!programmatic.current) history.current.push(lastPano.current);
      programmatic.current = false;
      lastPano.current = id;
    });
    sv.addListener('pov_changed', () => {
      const c = compassRef?.current;
      if (c) c.style.transform = `rotate(${-sv.getPov().heading}deg)`;
    });
    // Created once per game; later rounds are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib]);

  useEffect(() => {
    if (env.streetViewMock) {
      callbacks.current.onReady?.();
      return;
    }
    const sv = svRef.current;
    history.current = [];
    if (!sv || sv.getPano() === pano.panoId) return;
    settled.current = false;
    programmatic.current = true;
    sv.setPano(pano.panoId);
    sv.setPov({ heading: pano.heading, pitch: pano.pitch });
    sv.setZoom(pano.zoom);
    // status_changed only fires when the status value changes (OK → OK doesn't), so fall back to polling it.
    const fallback = setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      if (sv.getStatus() === google.maps.StreetViewStatus.OK) callbacks.current.onReady?.();
      else callbacks.current.onFailed?.();
    }, 2500);
    return () => clearTimeout(fallback);
  }, [pano.panoId, pano.heading, pano.pitch, pano.zoom]);

  useEffect(() => {
    svRef.current?.setOptions(optionsFor(movement, motionControl));
    if (movement === 'moving') return;
    // Street View walks with the arrow keys; block that when movement is disabled.
    const block = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || (movement === 'nmpz' && e.key.startsWith('Arrow'))) e.stopPropagation();
    };
    window.addEventListener('keydown', block, true);
    return () => window.removeEventListener('keydown', block, true);
  }, [movement, motionControl]);

  useImperativeHandle(
    ref,
    () => ({
      returnToStart() {
        const sv = svRef.current;
        if (!sv) return;
        history.current = [];
        if (sv.getPano() !== start.current.panoId) {
          programmatic.current = true;
          sv.setPano(start.current.panoId);
        }
        sv.setPov({ heading: start.current.heading, pitch: start.current.pitch });
        sv.setZoom(start.current.zoom);
      },
      undo() {
        const sv = svRef.current;
        const prev = history.current.pop();
        if (!sv || !prev) return;
        programmatic.current = true;
        sv.setPano(prev);
      },
      zoomBy(delta) {
        const sv = svRef.current;
        if (sv) sv.setZoom(Math.min(4, Math.max(0, sv.getZoom() + delta)));
      },
    }),
    [],
  );

  if (env.streetViewMock) {
    return (
      <div
        data-testid="streetview-mock"
        className="absolute inset-0 grid place-items-center bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-muted"
      >
        <span className="font-mono text-xs">{pano.panoId}</span>
      </div>
    );
  }

  return (
    <>
      <div ref={el} className="absolute inset-0" />
      {/* NMPZ: swallow all gestures so the view can't be panned or zoomed. */}
      {movement === 'nmpz' && (
        <div className="absolute inset-0 z-[1]" onPointerDown={(e) => e.preventDefault()} onWheel={(e) => e.preventDefault()} />
      )}
    </>
  );
});
