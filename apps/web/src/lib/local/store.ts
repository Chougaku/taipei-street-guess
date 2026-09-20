/** Local (serverless) save data: everything lives in this browser's localStorage. */
import type { GameMode, GameSettings, LatLng, MapVisibility, Medal, MovementMode, PanoView, StreakLevel } from '@tg/shared';
import { safeStorage } from '../auth.ts';

const KEY = 'tg.local.v1';
const MAX_GAMES = 80;
const MAX_STREAKS = 30;

export interface LocalRound {
  roundNo: number;
  locIndex: number | null;
  pano: PanoView;
  lat: number;
  lng: number;
  district: string | null;
  startedAt: number;
  deadline: number | null;
  guess: LatLng | null;
  distanceM: number | null;
  score: number | null;
  timedOut: boolean;
  timeMs: number | null;
  guessedAt: number | null;
}

export interface LocalGame {
  id: string;
  mode: GameMode;
  mapSlug: string;
  settings: GameSettings;
  roundCount: number;
  currentRound: number;
  status: 'playing' | 'finished';
  totalScore: number;
  xpGained: number | null;
  challengeCode: string | null;
  createdAt: number;
  finishedAt: number | null;
  replacements: number;
  rounds: LocalRound[];
}

export interface LocalStreakRound {
  roundNo: number;
  locIndex: number;
  pano: PanoView;
  lat: number;
  lng: number;
  answerRegion: string;
  guessRegion: string | null;
  guess: LatLng | null;
  correct: boolean;
  timedOut: boolean;
}

export interface LocalStreak {
  id: string;
  level: StreakLevel;
  settings: GameSettings;
  status: 'playing' | 'finished';
  streak: number;
  roundNo: number;
  current: { locIndex: number; pano: PanoView; lat: number; lng: number; district: string; village: string | null } | null;
  roundStartedAt: number | null;
  deadline: number | null;
  history: LocalStreakRound[];
  xpGained: number | null;
  createdAt: number;
}

export interface LocalMapLocation {
  panoId: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  zoom: number;
}

export interface LocalMap {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: MapVisibility;
  locations: LocalMapLocation[];
  plays: number;
  likes: number;
  likedByMe: boolean;
  createdAt: number;
}

export interface LocalState {
  v: 1;
  profile: {
    id: string;
    nickname: string;
    avatar: string;
    xp: number;
    createdAt: number;
    dailyStreak: number;
    lastDailyDay: string | null;
    bestDistrictStreak: number;
    bestVillageStreak: number;
  };
  achievements: Record<string, string>;
  explorer: Record<string, { bestScore: number; medal: Medal | null; games: number }>;
  games: Record<string, LocalGame>;
  streaks: Record<string, LocalStreak>;
  maps: Record<string, LocalMap>;
  dailyPlayed: Record<string, string>;
  challengePlayed: Record<string, string>;
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function initial(): LocalState {
  const id = uuid();
  return {
    v: 1,
    profile: {
      id,
      nickname: `旅人${id.replace(/-/g, '').slice(0, 4)}`,
      avatar: 'pin-red',
      xp: 0,
      createdAt: Date.now(),
      dailyStreak: 0,
      lastDailyDay: null,
      bestDistrictStreak: 0,
      bestVillageStreak: 0,
    },
    achievements: {},
    explorer: {},
    games: {},
    streaks: {},
    maps: {},
    dailyPlayed: {},
    challengePlayed: {},
  };
}

let state: LocalState | null = null;

export function load(): LocalState {
  if (state) return state;
  const raw = safeStorage.get(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as LocalState;
      if (parsed?.v === 1 && parsed.profile?.id) {
        state = parsed;
        return state;
      }
    } catch {
      /* corrupted save — start fresh rather than blocking the game */
    }
  }
  state = initial();
  save();
  return state;
}

export function save() {
  if (state) safeStorage.set(KEY, JSON.stringify(state));
}

/** Mutates the save data and persists it. */
export function update<T>(fn: (s: LocalState) => T): T {
  const s = load();
  const result = fn(s);
  prune(s);
  save();
  return result;
}

function prune(s: LocalState) {
  const trim = <T extends { createdAt: number }>(map: Record<string, T>, max: number) => {
    const ids = Object.keys(map);
    if (ids.length <= max) return;
    ids
      .sort((a, b) => map[a]!.createdAt - map[b]!.createdAt)
      .slice(0, ids.length - max)
      .forEach((id) => delete map[id]);
  };
  trim(s.games, MAX_GAMES);
  trim(s.streaks, MAX_STREAKS);
}

export const newId = uuid;

export { KEY as LOCAL_STORAGE_KEY };

export type { GameMode, GameSettings, MovementMode };
