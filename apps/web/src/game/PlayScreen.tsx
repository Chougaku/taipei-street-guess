import type { BBox, LatLng, MovementMode, PanoView } from '@tg/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconClose, IconExpand, IconFlag, IconMap, IconMinus, IconPin, IconPlus, IconShrink, IconUndo } from '../components/icons.tsx';
import { Spinner } from '../components/Status.tsx';
import { useHotkeys, useIsCompact } from '../lib/hooks.ts';
import { haptic, keepScreenAwake } from '../lib/native.ts';
import { sfx } from '../lib/sound.ts';
import { useSettings } from '../stores/settings.ts';
import { GameMap, type ResultLine } from './GameMap.tsx';
import { Compass, RoundTimer } from './HudParts.tsx';
import { StreetView, type StreetViewHandle } from './StreetView.tsx';

export interface PlayScreenProps {
  /** Unique id for the Google Map instance (reused across mounts). */
  mapId?: string;
  pano: PanoView;
  movement: MovementMode;
  bbox: BBox;
  phase: 'guess' | 'result';
  deadline: string | null;
  pin: LatLng | null;
  onPin(p: LatLng): void;
  /** Called with the current pin (or null) when the player guesses or time runs out. */
  onGuess(pin: LatLng | null, reason: 'guess' | 'timeout'): void;
  guessing?: boolean;
  /** Text on the guess button, e.g. the selected district in streak mode. */
  guessLabel?: string;
  canGuess?: boolean;
  onPanoFailed?(): void;
  /** Continue from the result screen (Space / Enter). */
  onContinue?(): void;
  results?: ResultLine[];
  extraGuesses?: { key: string; position: LatLng; color: string; label: string }[];
  resultPanel?: ReactNode;
  /** Show the result panel as a side column on wide screens (game summary). */
  panelSide?: boolean;
  hud?: ReactNode;
  topLeft?: ReactNode;
  mapChildren?: ReactNode;
  /** Shown over Street View once the player has guessed, while waiting for others (multiplayer). */
  waitingOverlay?: ReactNode;
}

type DockSize = 0 | 1 | 2 | 3;
const DOCK_SIZES: Record<DockSize, string> = {
  0: 'w-[280px] h-[190px]',
  1: 'w-[380px] h-[260px]',
  2: 'w-[560px] h-[400px] max-w-[60vw] max-h-[65vh]',
  3: 'w-[900px] h-[640px] max-w-[80vw] max-h-[80vh]',
};

export function PlayScreen(props: PlayScreenProps) {
  const {
    mapId = 'game-map',
    pano,
    movement,
    bbox,
    phase,
    deadline,
    pin,
    onPin,
    onGuess,
    guessing = false,
    guessLabel,
    canGuess = pin !== null,
    onPanoFailed,
    onContinue,
    results,
    extraGuesses,
    resultPanel,
    panelSide = false,
    hud,
    topLeft,
    mapChildren,
    waitingOverlay,
  } = props;
  const { t } = useTranslation();
  const compact = useIsCompact();
  const motionControl = useSettings((s) => s.motionControl);
  const sv = useRef<StreetViewHandle>(null);
  const compass = useRef<HTMLDivElement>(null);
  // Tracked by pano id rather than a boolean: StreetView can report "ready" before this
  // component's own effects run, which would otherwise leave the loading overlay stuck.
  const [loadedPano, setLoadedPano] = useState<string | null>(null);
  const loaded = loadedPano === pano.panoId;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dockSize, setDockSize] = useState<DockSize>(1);
  const [dockPinned, setDockPinned] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => keepScreenAwake(), []);
  useEffect(() => setSheetOpen(false), [pano.panoId]);

  const inResult = phase === 'result';
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const guess = () => {
    if (inResult || guessing || !canGuess || waitingOverlay) return;
    haptic('medium');
    onGuess(pin, 'guess');
  };

  useHotkeys({
    Space: () => (inResult ? onContinue?.() : guess()),
    Enter: () => (inResult ? onContinue?.() : guess()),
    r: () => sv.current?.returnToStart(),
    z: () => movement === 'moving' && sv.current?.undo(),
    '=': () => movement !== 'nmpz' && sv.current?.zoomBy(1),
    '+': () => movement !== 'nmpz' && sv.current?.zoomBy(1),
    '-': () => movement !== 'nmpz' && sv.current?.zoomBy(-1),
    m: () => setDockSize((s) => (s === 3 ? 1 : ((s + 1) as DockSize))),
  });

  const handlePin = (p: LatLng) => {
    sfx.pin();
    haptic('light');
    onPin(p);
  };

  const expanded = !compact && !inResult && (hover || dockPinned);
  const dockClass = inResult
    ? 'inset-0 rounded-none'
    : compact
      ? `inset-x-0 bottom-0 h-[72dvh] rounded-t-3xl transition-transform duration-300 ${sheetOpen ? 'translate-y-0' : 'translate-y-[105%]'}`
      : `bottom-[max(var(--sab),1.25rem)] right-[max(var(--sar),1.25rem)] rounded-2xl transition-[width,height,opacity] duration-200 ${DOCK_SIZES[expanded ? (Math.max(dockSize, 2) as DockSize) : dockSize]} ${
          hover || dockPinned ? 'opacity-100' : 'opacity-80'
        }`;

  return (
    <div className="game-screen bg-ink">
      <StreetView
        ref={sv}
        pano={pano}
        movement={movement}
        motionControl={motionControl}
        compassRef={compass}
        onReady={() => setLoadedPano(pano.panoId)}
        onFailed={() => onPanoFailed?.()}
      />

      {!loaded && (
        <div className="absolute inset-0 z-[2] grid place-items-center bg-ink/80">
          <div className="flex flex-col items-center gap-3 text-muted">
            <Spinner className="size-10" />
            {t('game.loadingPano')}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[25] flex items-start justify-between gap-2 safe-top safe-x">
        <div className="pointer-events-auto flex items-center gap-2">{topLeft}</div>
        <div className="pointer-events-auto flex items-start gap-2">
          {deadline && !inResult && !waitingOverlay && (
            <RoundTimer
              deadline={deadline}
              onExpire={() => {
                sfx.timeout();
                onGuess(pinRef.current, 'timeout');
              }}
            />
          )}
          {hud}
        </div>
      </div>

      {/* Street View controls */}
      {!inResult && (
        <div
          className={`absolute z-10 flex flex-col items-center gap-2 ${
            compact ? 'left-[max(var(--sal),0.75rem)] top-[calc(max(var(--sat),0.75rem)+3.5rem)]' : 'bottom-[max(var(--sab),1.25rem)] left-[max(var(--sal),1.25rem)]'
          }`}
        >
          <Compass ref={compass} />
          <button className="icon-btn" title={t('game.returnToStart')} aria-label={t('game.returnToStart')} onClick={() => sv.current?.returnToStart()}>
            <IconFlag />
          </button>
          {movement === 'moving' && (
            <button className="icon-btn" title={t('game.undo')} aria-label={t('game.undo')} onClick={() => sv.current?.undo()}>
              <IconUndo />
            </button>
          )}
          {movement !== 'nmpz' && !compact && (
            <>
              <button className="icon-btn" aria-label={t('game.zoomIn')} onClick={() => sv.current?.zoomBy(1)}>
                <IconPlus />
              </button>
              <button className="icon-btn" aria-label={t('game.zoomOut')} onClick={() => sv.current?.zoomBy(-1)}>
                <IconMinus />
              </button>
            </>
          )}
        </div>
      )}

      {waitingOverlay && !inResult && <div className="absolute inset-x-0 bottom-28 z-10 flex justify-center">{waitingOverlay}</div>}

      {/* Mobile: open-map button + floating guess */}
      {compact && !inResult && !sheetOpen && !waitingOverlay && (
        <div className="absolute bottom-[max(var(--sab),1rem)] right-[max(var(--sar),1rem)] z-10 flex items-center gap-2">
          {canGuess && (
            <button className="btn-primary animate-pop" disabled={guessing} onClick={guess}>
              {guessLabel ?? t('game.guess')}
            </button>
          )}
          <button
            className="grid size-16 place-items-center rounded-full bg-accent text-white shadow-xl shadow-accent/30 active:scale-95"
            aria-label={t('game.openMap')}
            onClick={() => setSheetOpen(true)}
          >
            <IconMap width={28} height={28} />
          </button>
        </div>
      )}

      {/* Map dock: mini map (desktop) / bottom sheet (mobile) / full screen (results) */}
      <div
        className={`group absolute z-20 flex flex-col overflow-hidden bg-panel shadow-2xl ring-1 ring-black/40 ${dockClass}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {compact && !inResult && (
          <div className="flex items-center justify-between px-4 py-2">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
            <button className="btn-ghost absolute right-2 top-1 px-3 py-2" onClick={() => setSheetOpen(false)} aria-label={t('game.backToStreet')}>
              <IconClose />
            </button>
          </div>
        )}
        {!compact && !inResult && (
          <div className="absolute left-2 top-2 z-10 flex gap-1 opacity-60 transition-opacity group-hover:opacity-100">
            <button className="icon-btn size-8" aria-label={t('game.expandMap')} onClick={() => setDockSize((s) => Math.min(3, s + 1) as DockSize)}>
              <IconExpand width={16} height={16} />
            </button>
            <button className="icon-btn size-8" aria-label={t('game.shrinkMap')} onClick={() => setDockSize((s) => Math.max(0, s - 1) as DockSize)}>
              <IconShrink width={16} height={16} />
            </button>
            <button
              className={`icon-btn size-8 ${dockPinned ? 'bg-accent' : ''}`}
              aria-label={t('game.pinMap')}
              aria-pressed={dockPinned}
              onClick={() => setDockPinned((v) => !v)}
            >
              <IconPin width={16} height={16} />
            </button>
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          <GameMap
            id={mapId}
            className="absolute inset-0"
            bbox={bbox}
            pin={pin}
            onPin={handlePin}
            interactive={!guessing && !waitingOverlay}
            results={inResult ? results : undefined}
            extraGuesses={inResult ? extraGuesses : undefined}
            layoutKey={`${phase}-${compact}`}
            resetKey={pano.panoId}
            visible={!compact || sheetOpen || inResult}
            fitPadding={(w, h) =>
              panelSide && !compact
                ? { top: 70, left: Math.min(460, w * 0.45), right: 40, bottom: 40 }
                : { top: 70, left: 30, right: 30, bottom: Math.min(compact ? 9999 : 300, Math.round(h * (compact ? 0.55 : 0.45))) }
            }
          >
            {mapChildren}
          </GameMap>
        </div>
        {!inResult && (
          <div className={compact ? 'p-3 safe-bottom' : 'p-2'}>
            <button className="btn-primary w-full" disabled={!canGuess || guessing || !!waitingOverlay} onClick={guess}>
              {canGuess ? (guessLabel ?? t('game.guess')) : t('game.placePin')}
            </button>
          </div>
        )}
      </div>

      {inResult && resultPanel && (
        <div
          className={
            panelSide && !compact
              ? 'pointer-events-none absolute bottom-4 left-4 top-20 z-30 flex w-[min(420px,42vw)] items-end'
              : 'pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-3 safe-bottom'
          }
        >
          <div className="pointer-events-auto w-full max-w-2xl animate-fade-up">{resultPanel}</div>
        </div>
      )}
    </div>
  );
}
