import { forwardRef, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { serverNow } from '../lib/api.ts';
import { useNow } from '../lib/hooks.ts';
import { sfx } from '../lib/sound.ts';

/** Compass needle; StreetView rotates the inner element directly via the ref. */
export const Compass = forwardRef<HTMLDivElement>(function Compass(_, ref) {
  return (
    <div className="relative size-14 rounded-full bg-ink/70 shadow-lg ring-1 ring-white/10 backdrop-blur" aria-hidden>
      <div ref={ref} className="absolute inset-0 transition-transform duration-75">
        <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[11px] font-black text-accent">N</span>
        <svg viewBox="0 0 56 56" className="absolute inset-0">
          <path d="M28 10 32 28H24z" fill="#ff5a36" />
          <path d="M28 46 24 28H32z" fill="#cbd5e1" />
        </svg>
      </div>
    </div>
  );
});

export function ScorePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-ink/70 px-3 py-1.5 shadow-lg ring-1 ring-white/10 backdrop-blur">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-base font-black tabular-nums leading-tight">{value}</span>
    </div>
  );
}

/** Countdown to a server deadline; calls onExpire once when it hits zero. */
export function RoundTimer({ deadline, onExpire }: { deadline: string; onExpire(): void }) {
  const { t } = useTranslation();
  useNow(250);
  const end = new Date(deadline).getTime();
  const remaining = Math.max(0, end - serverNow());
  const secs = Math.ceil(remaining / 1000);
  const fired = useRef(false);
  const lastTick = useRef(secs);

  useEffect(() => {
    fired.current = false;
  }, [deadline]);

  useEffect(() => {
    if (secs !== lastTick.current && secs <= 5 && secs > 0) sfx.tick();
    lastTick.current = secs;
    if (remaining <= 0 && !fired.current) {
      fired.current = true;
      onExpire();
    }
  });

  const urgent = secs <= 10;
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <div
      role="timer"
      aria-label={t('game.time')}
      className={`rounded-xl px-3 py-1.5 text-center font-black tabular-nums shadow-lg ring-1 backdrop-blur ${
        urgent ? 'animate-pulse bg-bad/90 ring-bad' : 'bg-ink/70 ring-white/10'
      }`}
    >
      <span className="text-lg">
        {mm}:{ss}
      </span>
    </div>
  );
}

export function ScoreBar({ score, max = 5000 }: { score: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-panel-2">
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent-2 to-accent transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
