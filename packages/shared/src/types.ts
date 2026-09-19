import type { BBox, LatLng } from './geo.ts';

export type MovementMode = 'moving' | 'nomove' | 'nmpz';

export interface GameSettings {
  /** Seconds per round, 0 = unlimited. */
  timeLimitSec: number;
  movement: MovementMode;
}

export const DEFAULT_SETTINGS: GameSettings = { timeLimitSec: 0, movement: 'moving' };
export const TIME_LIMIT_OPTIONS = [0, 10, 20, 30, 45, 60, 90, 120, 180, 300, 600] as const;

export type GameMode = 'classic' | 'challenge' | 'daily' | 'explorer';
export type MapKind = 'official' | 'custom';
export type MapVisibility = 'public' | 'unlisted' | 'private';

export interface MapSummary {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  kind: MapKind;
  /** Set for official per-district maps. */
  districtCode: string | null;
  bbox: BBox;
  diagonalKm: number;
  locationCount: number;
  visibility: MapVisibility;
  ownerId: string | null;
  ownerName: string | null;
  likes: number;
  plays: number;
}

export interface PanoView {
  panoId: string;
  heading: number;
  pitch: number;
  zoom: number;
}

export interface RoundStart {
  roundNo: number;
  pano: PanoView;
  startedAt: string;
  /** ISO timestamp, null when unlimited. */
  deadline: string | null;
}

export interface RoundResult {
  roundNo: number;
  /** Revealed with the answer (lets clients show the scene again after a reload). */
  pano: PanoView;
  guess: LatLng | null;
  answer: LatLng;
  distanceM: number | null;
  score: number;
  timedOut: boolean;
  timeMs: number | null;
  districtCode: string | null;
}

export type GameStatus = 'playing' | 'finished';

export interface GameView {
  id: string;
  mode: GameMode;
  map: MapSummary;
  settings: GameSettings;
  status: GameStatus;
  roundCount: number;
  /** 1-based number of the round being played (or last played when finished). */
  currentRound: number;
  rounds: RoundResult[];
  current: RoundStart | null;
  totalScore: number;
  challengeCode: string | null;
  xpGained: number | null;
  /** Achievement codes unlocked by finishing this game (only in the response that finished it). */
  newAchievements: string[];
}

export interface CreateGameRequest {
  mapSlug: string;
  settings: GameSettings;
  mode?: 'classic' | 'explorer';
}

export interface GuessRequest {
  roundNo: number;
  guess: LatLng | null;
}

export interface GuessResponse {
  result: RoundResult;
  game: GameView;
}

export interface Profile {
  id: string;
  nickname: string;
  avatar: string;
  xp: number;
  level: number;
  rating: number;
  rankedGames: number;
  isGuest: boolean;
  friendCode: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface UserRef {
  id: string;
  nickname: string;
  avatar: string;
  level: number;
}

export interface PublicProfile extends UserRef {
  xp: number;
  rating: number;
  rankedGames: number;
  isGuest: boolean;
  createdAt: string;
  online: boolean;
}

export interface UserStats {
  gamesPlayed: number;
  roundsPlayed: number;
  avgScore: number;
  bestScore: number;
  perfectRounds: number;
  avgDistanceM: number | null;
  dailyStreak: number;
  bestDistrictStreak: number;
  bestVillageStreak: number;
  duelsPlayed: number;
  duelsWon: number;
  brPlayed: number;
  brWon: number;
}

export type FriendshipState = 'self' | 'none' | 'outgoing' | 'incoming' | 'friends';

export interface ProfilePage {
  profile: PublicProfile;
  stats: UserStats;
  achievements: { code: string; unlockedAt: string }[];
  explorer: { districtCode: string; medal: string | null; bestScore: number }[];
  recentGames: { id: string; mode: GameMode; mapSlug: string; mapName: string; mapNameEn: string; totalScore: number; finishedAt: string }[];
  friendship: FriendshipState;
}

export interface ChallengeInfo {
  code: string;
  kind: 'challenge' | 'daily';
  day: string | null;
  map: MapSummary;
  settings: GameSettings;
  roundCount: number;
  creator: UserRef | null;
  players: number;
  myGameId: string | null;
  myStatus: 'none' | 'playing' | 'finished';
}

export interface LeaderboardEntry {
  rank: number;
  user: UserRef;
  score: number;
  /** Mode-specific extra, e.g. total time in ms or games played. */
  extra: number | null;
  gameId: string | null;
}

export interface ChallengeResults {
  entries: (LeaderboardEntry & { rounds: RoundResult[] | null })[];
  me: LeaderboardEntry | null;
}

export type StreakLevel = 'district' | 'village';

export interface StreakRoundResult {
  roundNo: number;
  pano: PanoView;
  answer: LatLng;
  /** The correct district / village code. */
  answerRegion: string;
  /** What the player picked (null = no guess / timeout). */
  guessRegion: string | null;
  guess: LatLng | null;
  correct: boolean;
  timedOut: boolean;
}

export interface StreakView {
  id: string;
  level: StreakLevel;
  settings: GameSettings;
  status: GameStatus;
  streak: number;
  roundNo: number;
  current: RoundStart | null;
  history: StreakRoundResult[];
  best: number;
  xpGained: number | null;
  newAchievements: string[];
}

export interface StreakGuessRequest {
  roundNo: number;
  region: string | null;
  guess: LatLng | null;
}
