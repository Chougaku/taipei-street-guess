import { MEDAL_THRESHOLDS } from '@tg/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Taipei101 } from './art/Landmarks.tsx';
import { Baseball, BubbleTea, Lantern } from './art/Stickers.tsx';
import { MrtTrain, Scooter } from './art/Street.tsx';

/** A playful title for a finished 5-round game; the upper tiers line up with the Explorer medals. */
const TIERS: { min: number; key: string; art: ReactNode }[] = [
  { min: MEDAL_THRESHOLDS.platinum, key: 'map', art: <Taipei101 className="h-14" /> },
  { min: MEDAL_THRESHOLDS.gold, key: 'homeRun', art: <Baseball className="size-11 animate-roll" /> },
  // Just the lead car, so the train isn't a thin sliver in a square slot.
  { min: MEDAL_THRESHOLDS.silver, key: 'mrt', art: <MrtTrain viewBox="128 4 132 50" className="w-14" /> },
  { min: MEDAL_THRESHOLDS.bronze, key: 'scooter', art: <Scooter className="w-14" /> },
  { min: 5_000, key: 'tourist', art: <Lantern className="h-13" /> },
  { min: 0, key: 'boba', art: <BubbleTea mood="sad" className="h-13" /> },
];

export function ScoreTitle({ score }: { score: number }) {
  const { t } = useTranslation();
  const tier = TIERS.find((x) => score >= x.min)!;
  return (
    <div className="mt-3 flex animate-pop items-center gap-3 rounded-xl bg-gradient-to-r from-accent/20 to-panel-2/60 p-3 ring-1 ring-accent/30">
      <span className="grid size-14 shrink-0 place-items-center">{tier.art}</span>
      <span>
        <span className="block text-xs text-muted">{t('game.rank.label')}</span>
        <span className="block font-display text-lg font-black leading-tight text-accent-2">{t(`game.rank.${tier.key}`)}</span>
      </span>
    </div>
  );
}
