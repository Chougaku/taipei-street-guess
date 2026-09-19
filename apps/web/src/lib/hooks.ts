import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phone-sized or landscape phone: use the bottom-sheet guess map. */
export const useIsCompact = () => useMediaQuery('(max-width: 767px), (max-height: 500px) and (pointer: coarse)');

type KeyHandler = (e: KeyboardEvent) => void;

/** Global keyboard shortcuts; ignored while typing in inputs. */
export function useHotkeys(map: Record<string, KeyHandler>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const handler = ref.current[e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    // Capture phase: the Google Map / Street View swallow key events once focused.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}

/** Re-renders every `ms` while enabled; returns the current time. */
export function useNow(ms: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}
