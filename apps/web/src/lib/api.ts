import type {
  ChallengeInfo,
  ChallengeResults,
  CreateGameRequest,
  FriendshipState,
  GameSettings,
  GameView,
  GuessRequest,
  GuessResponse,
  LeaderboardEntry,
  MapSummary,
  MapVisibility,
  Medal,
  StreakGuessRequest,
  StreakLevel,
  StreakView,
  Profile,
  ProfilePage,
  PublicProfile,
  UserRef,
} from '@tg/shared';
import { getToken, resetSession } from './auth.ts';
import { env } from './env.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Offset between the server clock and ours (serverNow − clientNow), in ms. */
export let serverClockOffset = 0;

export function setServerClockOffset(ms: number) {
  serverClockOffset = ms;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const token = await getToken();
  const sentAt = Date.now();
  const res = await fetch(`${env.apiBase}/api${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const serverTime = res.headers.get('x-server-time');
  if (serverTime) serverClockOffset = Number(serverTime) - (sentAt + Date.now()) / 2;

  if (res.status === 401 && retry) {
    await resetSession();
    return request<T>(method, path, body, false);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? res.statusText);
  return data as T;
}

export const serverNow = () => Date.now() + serverClockOffset;

const serverApi = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),

  me: () => request<Profile>('GET', '/me'),
  updateMe: (patch: { nickname?: string; avatar?: string }) => request<Profile>('PATCH', '/me', patch),
  officialMaps: () => request<MapSummary[]>('GET', '/maps/official'),
  map: (slug: string) => request<MapSummary>('GET', `/maps/${encodeURIComponent(slug)}`),
  createGame: (req: CreateGameRequest) => request<GameView>('POST', '/games', req),
  game: (id: string) => request<GameView>('GET', `/games/${id}`),
  guess: (id: string, req: GuessRequest) => request<GuessResponse>('POST', `/games/${id}/guess`, req),
  nextRound: (id: string) => request<GameView>('POST', `/games/${id}/next`),
  replaceRound: (id: string, roundNo: number) => request<GameView>('POST', `/games/${id}/rounds/${roundNo}/replace`),

  user: (id: string) => request<ProfilePage>('GET', `/users/${id}`),
  createChallenge: (mapSlug: string, settings: GameSettings) => request<ChallengeInfo>('POST', '/challenges', { mapSlug, settings }),
  challengeFromGame: (gameId: string) => request<ChallengeInfo>('POST', `/games/${gameId}/challenge`),
  challenge: (code: string) => request<ChallengeInfo>('GET', `/challenges/${encodeURIComponent(code)}`),
  playChallenge: (code: string) => request<GameView>('POST', `/challenges/${encodeURIComponent(code)}/play`),
  challengeResults: (code: string) => request<ChallengeResults>('GET', `/challenges/${encodeURIComponent(code)}/results`),
  daily: () => request<ChallengeInfo>('GET', '/daily'),
  playDaily: () => request<GameView>('POST', '/daily/play'),
  dailyResults: (day?: string) => request<ChallengeResults>('GET', `/daily/results${day ? `?day=${day}` : ''}`),
  createStreak: (level: StreakLevel, settings: GameSettings) => request<StreakView>('POST', '/streaks', { level, settings }),
  streak: (id: string) => request<StreakView>('GET', `/streaks/${id}`),
  streakGuess: (id: string, body: StreakGuessRequest) => request<StreakView>('POST', `/streaks/${id}/guess`, body),
  streakNext: (id: string) => request<StreakView>('POST', `/streaks/${id}/next`),
  streakReplace: (id: string) => request<StreakView>('POST', `/streaks/${id}/replace`),
  explorer: () => request<{ districtCode: string; medal: Medal | null; bestScore: number; games: number }[]>('GET', '/explorer'),
  listMaps: (params: { sort?: 'popular' | 'new' | 'liked'; q?: string; owner?: string }) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<(MapSummary & { likedByMe: boolean })[]>('GET', `/maps?${q}`);
  },
  mapDetail: (slug: string) => request<MapSummary & { likedByMe: boolean }>('GET', `/maps/${encodeURIComponent(slug)}`),
  createMap: (body: { name: string; description?: string }) => request<MapSummary>('POST', '/maps', body),
  updateMap: (id: string, body: { name?: string; description?: string; visibility?: MapVisibility }) => request<MapSummary>('PATCH', `/maps/${id}`, body),
  deleteMap: (id: string) => request<{ ok: true }>('DELETE', `/maps/${id}`),
  mapLocations: (id: string) => request<EditorLocation[]>('GET', `/maps/${id}/locations`),
  saveMapLocations: (id: string, locations: EditorLocation[]) =>
    request<{ map: MapSummary; saved: number; skipped: number }>('PUT', `/maps/${id}/locations`, { locations }),
  likeMap: (id: string, like: boolean) => request<{ likes: number; liked: boolean }>(like ? 'POST' : 'DELETE', `/maps/${id}/like`),
  report: (body: { gameId?: string; roundNo?: number; panoId?: string; reason: string; note?: string }) => request<{ ok: true }>('POST', '/reports', body),
  adminReports: () => request<AdminReport[]>('GET', '/admin/reports'),
  resolveReport: (panoId: string, action: 'disable' | 'dismiss') => request<{ ok: true }>('POST', '/admin/reports/resolve', { panoId, action }),
  friends: () => request<FriendsList>('GET', '/friends'),
  addFriend: (id: string) => request<{ state: FriendshipState }>('POST', `/friends/${id}`),
  addFriendByCode: (code: string) => request<{ userId: string; state: FriendshipState }>('POST', '/friends/by-code', { code }),
  removeFriend: (id: string) => request<{ state: FriendshipState }>('DELETE', `/friends/${id}`),
  searchPlayers: (q: string) => request<UserRef[]>('GET', `/players/search?q=${encodeURIComponent(q)}`),
  leaderboard: (path: string, params: Record<string, string | boolean | undefined> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== false) q.set(k, v === true ? '1' : v);
    return request<Leaderboard>('GET', `/leaderboards/${path}${q.size ? `?${q}` : ''}`);
  },
};

export type Api = typeof serverApi;

/** Serverless build: the same API surface, backed by the in-browser engine. */
const engine = () => import('./local/engine.ts');
const offline = (what: string) => () => Promise.reject(new ApiError(501, 'offline', `${what} needs the online version`));

const staticApi: Api = {
  get: offline('This') as Api['get'],
  post: offline('This') as Api['post'],
  patch: offline('This') as Api['patch'],
  del: offline('This') as Api['del'],

  me: async () => (await engine()).me(),
  updateMe: async (patch) => (await engine()).updateMe(patch),
  officialMaps: async () => (await import('./local/maps.ts')).officialMaps(),
  map: async (slug) => (await engine()).mapDetail(slug),
  createGame: async (req) => (await engine()).createGame(req),
  game: async (id) => (await engine()).getGame(id),
  guess: async (id, req) => (await engine()).submitGuess(id, req),
  nextRound: async (id) => (await engine()).nextRound(id),
  replaceRound: async (id, roundNo) => (await engine()).replaceRound(id, roundNo),

  user: async () => (await engine()).profilePage(),
  createChallenge: async (mapSlug, settings) => (await engine()).createChallenge(mapSlug, settings),
  challengeFromGame: async (gameId) => (await engine()).challengeFromGame(gameId),
  challenge: async (code) => (await engine()).getChallenge(code),
  playChallenge: async (code) => (await engine()).playChallenge(code),
  challengeResults: async (code) => (await engine()).challengeResults(code),
  daily: async () => (await engine()).daily(),
  playDaily: async () => (await engine()).playDaily(),
  dailyResults: async (day) => (await engine()).dailyResults(day),
  createStreak: async (level, settings) => (await engine()).createStreak(level, settings),
  streak: async (id) => (await engine()).getStreak(id),
  streakGuess: async (id, body) => (await engine()).guessStreak(id, body),
  streakNext: async (id) => (await engine()).nextStreakRound(id),
  streakReplace: async (id) => (await engine()).replaceStreakRound(id),
  explorer: async () => (await engine()).explorer(),
  listMaps: async (params) => (await engine()).listMaps(params),
  mapDetail: async (slug) => (await engine()).mapDetail(slug),
  createMap: async (body) => (await engine()).createMap(body),
  updateMap: async (id, body) => (await engine()).updateMap(id, body),
  deleteMap: async (id) => (await engine()).deleteMap(id),
  mapLocations: async (id) => (await engine()).mapLocations(id),
  saveMapLocations: async (id, locations) => (await engine()).saveMapLocations(id, locations),
  likeMap: async (id, like) => (await engine()).likeMap(id, like),
  leaderboard: async (path) => (await engine()).leaderboard(path),

  // Not available without a server.
  report: offline('Reporting'),
  adminReports: offline('The report queue'),
  resolveReport: offline('The report queue'),
  friends: offline('Friends'),
  addFriend: offline('Friends'),
  addFriendByCode: offline('Friends'),
  removeFriend: offline('Friends'),
  searchPlayers: offline('Player search'),
};

export const api: Api = env.staticMode ? staticApi : serverApi;

export interface EditorLocation {
  panoId: string | null;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  zoom: number;
}

export interface AdminReport {
  locationId: number | null;
  panoId: string;
  lat: number | null;
  lng: number | null;
  heading: number;
  mapName: string | null;
  disabled: boolean;
  reports: number;
  reasons: Record<string, number>;
  notes: string[];
  lastReportedAt: string;
}

export interface FriendsList {
  friends: PublicProfile[];
  incoming: UserRef[];
  outgoing: UserRef[];
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}
