import { TIME_LIMIT_OPTIONS, type GameSettings, type MovementMode } from '@tg/shared';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

const MOVEMENTS: MovementMode[] = ['moving', 'nomove', 'nmpz'];

export function formatTimeLimit(t: TFunction, sec: number) {
  if (sec === 0) return t('mapPage.unlimited');
  if (sec < 60) return t('mapPage.seconds', { count: sec });
  if (sec % 60 === 0) return t('mapPage.minutes', { count: sec / 60 });
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function GameSettingsForm({ value, onChange }: { value: GameSettings; onChange(v: GameSettings): void }) {
  const { t } = useTranslation();
  const idx = Math.max(0, TIME_LIMIT_OPTIONS.indexOf(value.timeLimitSec as (typeof TIME_LIMIT_OPTIONS)[number]));
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-muted">{t('mapPage.movement')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {MOVEMENTS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={value.movement === m}
              onClick={() => onChange({ ...value, movement: m })}
              className={`rounded-xl p-3 text-left ring-1 transition ${
                value.movement === m ? 'bg-accent/15 ring-accent' : 'bg-panel-2 ring-line hover:ring-muted'
              }`}
            >
              <span className="block font-bold">{t(`mapPage.${m}`)}</span>
              <span className="block text-xs leading-snug text-muted">{t(`mapPage.${m}Desc`)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-2 flex justify-between text-sm font-semibold text-muted">
          {t('mapPage.timeLimit')}
          <span className="text-text">{formatTimeLimit(t, value.timeLimitSec)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={TIME_LIMIT_OPTIONS.length - 1}
          value={idx}
          onChange={(e) => onChange({ ...value, timeLimitSec: TIME_LIMIT_OPTIONS[Number(e.target.value)]! })}
          className="w-full accent-[var(--color-accent)]"
        />
      </label>
    </div>
  );
}
