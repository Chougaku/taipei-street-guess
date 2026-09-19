import type { DistanceUnit, GameSettings } from '@tg/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'zh-TW' | 'en';

interface SettingsState {
  language: Language;
  units: DistanceUnit;
  sound: boolean;
  volume: number;
  haptics: boolean;
  /** Use the device gyroscope to look around in Street View (mobile). */
  motionControl: boolean;
  lastGameSettings: GameSettings;
  set(patch: Partial<Omit<SettingsState, 'set'>>): void;
}

const defaultLanguage = (): Language => (navigator.language?.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en');

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      language: defaultLanguage(),
      units: 'metric',
      sound: true,
      volume: 0.6,
      haptics: true,
      motionControl: false,
      lastGameSettings: { timeLimitSec: 0, movement: 'moving' },
      set: (patch) => set(patch),
    }),
    { name: 'tg.settings', version: 1 },
  ),
);
