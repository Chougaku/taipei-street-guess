/**
 * Serverless game engine: the same rules as the server, running in the browser.
 * Used by the GitHub Pages build, where there is no backend at all.
 */
import {
  dailySettingsFor,
  DISTRICTS,
  haversineMeters,
  levelFromXp,
  medalForScore,
  medalRank,
  previousDay,
  roundScore,
  ROUNDS_PER_GAME,
  seededRandom,
  taipeiDay,
  XP,
  type ChallengeInfo,
  type ChallengeResults,
  type GameMode,
  type GameSettings,
  type GameView,
  type GuessResponse,
  type LatLng,
  type LeaderboardEntry,
  type MapSummary,
  type Medal,
  type MovementMode,
  type Profile,
  type ProfilePage,
  type RoundResult,
  type StreakLevel,
  type StreakView,
  type UserRef,
} from '@tg/shared';
import { findVillage } from '@tg/shared/villages';
import { ApiError } from '../api.ts';
import { OFFLINE_ACHIEVEMENTS } from './achievements.ts';
import { CITY_SLUG, customMapInfo, findMap, officialMaps, type LocalMapInfo } from './maps.ts';
import { at, pickMany, pickOne, type PoolLocation } from './pool.ts';
import { load, newId, update, type LocalGame, type LocalMap, type LocalRound, type LocalStreak } from './store.ts';

const GRACE_MS = 5000;
const MAX_REPLACEMENTS = 5;

const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found`);
const conflict = (msg: string, code = 'conflict') => new ApiError(409, code, msg);
const badRequest = (msg: string, code = 'bad_request') => new ApiError(400, code, msg);

function validateSettings(s: GameSettings): GameSettings {
  if (!['moving', 'nomove', 'nmpz'].includes(s.movement)) throw badRequest('Invalid movement mode');
  const t = Math.round(Number(s.timeLimitSec));
  if (!Number.isFinite(t) || t < 0 || t > 600 || (t > 0 && t < 10)) throw badRequest('Invalid time limit');
  return { movement: s.movement as MovementMode, timeLimitSec: t };
}

// ── profile ──────────────────────────────────────────────────────────────────

export function me(): Profile {
  const p = load().profile;
  return {
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    xp: p.xp,
    level: levelFromXp(p.xp),
    rating: 0,
    rankedGames: 0,
    isGuest: true,
    friendCode: '',
    isAdmin: false,
    createdAt: new Date(p.createdAt).toISOString(),
  };
}

export function updateMe(patch: { nickname?: string; avatar?: string }): Profile {
  update((s) => {
    if (patch.nickname !== undefined) {
      const nickname = patch.nickname.trim();
      if ([...nickname].length < 2 || [...nickname].length > 16) throw badRequest('暱稱需為 2–16 個字', 'invalid_nickname');
      s.profile.nickname = nickname;
    }
    if (patch.avatar !== undefined) s.profile.avatar = patch.avatar;
  });
  return me();
}

const userRef = (): UserRef => {
  const p = load().profile;
  return { id: p.id, nickname: p.nickname, avatar: p.avatar, level: levelFromXp(p.xp) };
};

// ── achievements ─────────────────────────────────────────────────────────────


function awardAchievements(codes: string[]): string[] {
  return update((s) => {
    const unlocked: string[] = [];
    for (const code of codes) {
      if (!OFFLINE_ACHIEVEMENTS.has(code) || s.achievements[code]) continue;
      s.achievements[code] = new Date().toISOString();
      unlocked.push(code);
    }
    return unlocked;
  });
}

function gameAchievements(): string[] {
  const s = load();
  const games = Object.values(s.games).filter((g) => g.status === 'finished');
  const rounds = games.flatMap((g) => g.rounds);
  const perfect = rounds.filter((r) => r.score === 5000).length;
  const best = Math.max(0, ...games.map((g) => g.totalScore));
  const bestNmpz = Math.max(0, ...games.filter((g) => g.settings.movement === 'nmpz').map((g) => g.totalScore));
  const speedy = rounds.some((r) => (r.score ?? 0) >= 4000 && (r.timeMs ?? Infinity) <= 10_000);
  const medals = DISTRICTS.map((d) => medalRank(s.explorer[d.code]?.medal ?? null));
  const minMedal = medals.length === DISTRICTS.length ? Math.min(...medals) : 0;
  const level = levelFromXp(s.profile.xp);
  return [
    ...(games.length >= 1 ? ['first_game'] : []),
    ...(games.length >= 10 ? ['games_10'] : []),
    ...(games.length >= 100 ? ['games_100'] : []),
    ...(perfect >= 1 ? ['perfect_round'] : []),
    ...(perfect >= 10 ? ['perfect_10'] : []),
    ...(best >= 20_000 ? ['score_20k'] : []),
    ...(best >= 24_000 ? ['score_24k'] : []),
    ...(bestNmpz >= 20_000 ? ['nmpz_20k'] : []),
    ...(speedy ? ['speed_demon'] : []),
    ...(games.some((g) => g.mode === 'daily') ? ['daily_first'] : []),
    ...(s.profile.dailyStreak >= 7 ? ['daily_streak_7'] : []),
    ...(minMedal >= 1 ? ['explorer_all_bronze'] : []),
    ...(minMedal >= 3 ? ['explorer_all_gold'] : []),
    ...(minMedal >= 4 ? ['explorer_all_platinum'] : []),
    ...(level >= 10 ? ['level_10'] : []),
    ...(level >= 25 ? ['level_25'] : []),
  ];
}

// ── games ────────────────────────────────────────────────────────────────────

function roundFromPool(loc: PoolLocation): Omit<LocalRound, 'roundNo' | 'startedAt' | 'deadline'> {
  return {
    locIndex: loc.index,
    pano: { panoId: loc.panoId, heading: loc.heading, pitch: 0, zoom: 0 },
    lat: loc.lat,
    lng: loc.lng,
    district: loc.district,
    guess: null,
    distanceM: null,
    score: null,
    timedOut: false,
    timeMs: null,
    guessedAt: null,
  };
}

function roundFromCustom(l: LocalMap['locations'][number]): Omit<LocalRound, 'roundNo' | 'startedAt' | 'deadline'> {
  return {
    locIndex: null,
    pano: { panoId: l.panoId, heading: l.heading, pitch: l.pitch, zoom: l.zoom },
    lat: l.lat,
    lng: l.lng,
    district: null,
    guess: null,
    distanceM: null,
    score: null,
    timedOut: false,
    timeMs: null,
    guessedAt: null,
  };
}

function pickRounds(map: LocalMapInfo, n: number, rand?: () => number): Omit<LocalRound, 'roundNo' | 'startedAt' | 'deadline'>[] {
  if (map.custom) {
    const picks = [...map.custom.locations];
    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor((rand ?? Math.random)() * (i + 1));
      [picks[i], picks[j]] = [picks[j]!, picks[i]!];
    }
    return picks.slice(0, n).map(roundFromCustom);
  }
  return pickMany(n, { district: map.districtCode, rand }).map(roundFromPool);
}

function startRound(round: LocalRound, settings: GameSettings) {
  round.startedAt = Date.now();
  round.deadline = settings.timeLimitSec > 0 ? round.startedAt + settings.timeLimitSec * 1000 : null;
}

function toRoundResult(r: LocalRound): RoundResult {
  return {
    roundNo: r.roundNo,
    pano: r.pano,
    guess: r.guess,
    answer: { lat: r.lat, lng: r.lng },
    distanceM: r.distanceM,
    score: r.score ?? 0,
    timedOut: r.timedOut,
    timeMs: r.timeMs,
    districtCode: r.district,
  };
}

function toGameView(g: LocalGame, newAchievements: string[] = []): GameView {
  const map = findMap(g.mapSlug);
  const current = g.rounds.find((r) => r.roundNo === g.currentRound);
  return {
    id: g.id,
    mode: g.mode,
    map: (map ?? officialMaps()[0]!) as MapSummary,
    settings: g.settings,
    status: g.status,
    roundCount: g.roundCount,
    currentRound: g.currentRound,
    rounds: g.rounds.filter((r) => r.guessedAt).map(toRoundResult),
    current:
      g.status === 'playing' && current && !current.guessedAt
        ? {
            roundNo: current.roundNo,
            pano: current.pano,
            startedAt: new Date(current.startedAt).toISOString(),
            deadline: current.deadline ? new Date(current.deadline).toISOString() : null,
          }
        : null,
    totalScore: g.totalScore,
    challengeCode: g.challengeCode,
    xpGained: g.xpGained,
    newAchievements,
  };
}

function createLocalGame(args: {
  map: LocalMapInfo;
  mode: GameMode;
  settings: GameSettings;
  challengeCode?: string | null;
  rounds?: Omit<LocalRound, 'roundNo' | 'startedAt' | 'deadline'>[];
  rand?: () => number;
}): LocalGame {
  const picked = args.rounds ?? pickRounds(args.map, ROUNDS_PER_GAME, args.rand);
  if (picked.length === 0) throw conflict('這張地圖還沒有地點', 'map_empty');
  const game: LocalGame = {
    id: newId(),
    mode: args.mode,
    mapSlug: args.map.slug,
    settings: args.settings,
    roundCount: picked.length,
    currentRound: 1,
    status: 'playing',
    totalScore: 0,
    xpGained: null,
    challengeCode: args.challengeCode ?? null,
    createdAt: Date.now(),
    finishedAt: null,
    replacements: 0,
    rounds: picked.map((r, i) => ({ ...r, roundNo: i + 1, startedAt: 0, deadline: null })),
  };
  startRound(game.rounds[0]!, args.settings);
  update((s) => {
    s.games[game.id] = game;
    if (args.map.custom) s.maps[args.map.custom.id]!.plays += 1;
  });
  return game;
}

export function createGame(req: { mapSlug: string; settings: GameSettings; mode?: 'classic' | 'explorer' }): GameView {
  const settings = validateSettings(req.settings);
  const map = findMap(req.mapSlug);
  if (!map) throw notFound('Map');
  const mode = req.mode ?? 'classic';
  if (mode === 'explorer' && !map.districtCode) throw badRequest('Explorer mode is only available on district maps');
  return toGameView(createLocalGame({ map, mode, settings }));
}

function requireGame(id: string): LocalGame {
  const g = load().games[id];
  if (!g) throw notFound('Game');
  return g;
}

export function getGame(id: string): GameView {
  const g = requireGame(id);
  const current = g.rounds.find((r) => r.roundNo === g.currentRound);
  if (g.status === 'playing' && current && !current.guessedAt && current.deadline && Date.now() > current.deadline + GRACE_MS) {
    return submitGuess(id, { roundNo: current.roundNo, guess: null }).game;
  }
  return toGameView(g);
}

function finishGame(g: LocalGame): string[] {
  let xp = XP.classicGame(g.totalScore);
  const map = findMap(g.mapSlug);
  update((s) => {
    if (g.mode === 'explorer' && map?.districtCode) {
      const prev = s.explorer[map.districtCode];
      const medal = medalForScore(g.totalScore);
      const best: Medal | null = medalRank(medal) > medalRank(prev?.medal ?? null) ? medal : (prev?.medal ?? null);
      s.explorer[map.districtCode] = {
        bestScore: Math.max(prev?.bestScore ?? 0, g.totalScore),
        medal: best,
        games: (prev?.games ?? 0) + 1,
      };
    }
    if (g.mode === 'daily') {
      xp += XP.dailyBonus;
      const day = taipeiDay(g.createdAt);
      const last = s.profile.lastDailyDay;
      s.profile.dailyStreak = last === previousDay(day) ? s.profile.dailyStreak + 1 : last === day ? s.profile.dailyStreak : 1;
      s.profile.lastDailyDay = last && last > day ? last : day;
    }
    s.profile.xp += xp;
    g.xpGained = xp;
    g.status = 'finished';
    g.finishedAt = Date.now();
  });
  return awardAchievements(gameAchievements());
}

export function submitGuess(id: string, req: { roundNo: number; guess: LatLng | null }): GuessResponse {
  const g = requireGame(id);
  if (g.status !== 'playing') throw conflict('Game is already finished', 'game_finished');
  if (req.roundNo !== g.currentRound) throw conflict('Not the current round', 'wrong_round');
  const round = g.rounds.find((r) => r.roundNo === req.roundNo)!;
  if (round.guessedAt) throw conflict('Round already guessed', 'already_guessed');

  const now = Date.now();
  const timedOut = round.deadline !== null && now > round.deadline + GRACE_MS;
  const guess = timedOut ? null : req.guess;
  const map = findMap(g.mapSlug);
  const distance = guess ? haversineMeters(guess, { lat: round.lat, lng: round.lng }) : null;
  const score = distance === null ? 0 : roundScore(distance, map?.diagonalKm ?? 35);

  update(() => {
    round.guess = guess;
    round.distanceM = distance;
    round.score = score;
    round.timedOut = guess === null;
    round.timeMs = round.startedAt ? Math.max(0, now - round.startedAt) : null;
    round.guessedAt = now;
    g.totalScore += score;
  });

  const newAchievements = req.roundNo >= g.roundCount ? finishGame(g) : [];
  return { result: toRoundResult(round), game: toGameView(g, newAchievements) };
}

export function nextRound(id: string): GameView {
  const g = requireGame(id);
  const current = g.rounds.find((r) => r.roundNo === g.currentRound)!;
  if (g.status === 'playing' && current.guessedAt && g.currentRound < g.roundCount) {
    update(() => {
      g.currentRound += 1;
      startRound(g.rounds.find((r) => r.roundNo === g.currentRound)!, g.settings);
    });
  }
  return getGame(id);
}

export function replaceRound(id: string, roundNo: number): GameView {
  const g = requireGame(id);
  const round = g.rounds.find((r) => r.roundNo === roundNo);
  if (g.status !== 'playing' || roundNo !== g.currentRound || !round || round.guessedAt) throw conflict('Round cannot be replaced', 'cannot_replace');
  if (g.replacements >= MAX_REPLACEMENTS) throw conflict('Too many replacements', 'too_many_replacements');
  const map = findMap(g.mapSlug);
  const exclude = new Set(g.rounds.map((r) => r.locIndex).filter((i): i is number => i !== null));
  const replacement = map?.custom
    ? map.custom.locations.filter((l) => !g.rounds.some((r) => r.pano.panoId === l.panoId))[0]
    : pickOne({ district: map?.districtCode ?? round.district, exclude });
  if (!replacement) throw conflict('No replacement location available', 'no_replacement');
  update(() => {
    const next = 'index' in replacement ? roundFromPool(replacement) : roundFromCustom(replacement);
    Object.assign(round, next, { roundNo: round.roundNo });
    g.replacements += 1;
    startRound(round, g.settings);
  });
  return getGame(id);
}

// ── challenges (the locations travel inside the link) ────────────────────────

interface ChallengePayload {
  m: string;
  t: number;
  v: MovementMode;
  /** Pool indexes (official maps). */
  i?: number[];
  /** Inline locations (custom maps). */
  p?: [string, number, number, number][];
}

const encode = (p: ChallengePayload) => btoa(JSON.stringify(p)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (code: string): ChallengePayload => {
  try {
    return JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/'))) as ChallengePayload;
  } catch {
    throw notFound('Challenge');
  }
};

function challengeRounds(p: ChallengePayload) {
  if (p.i) return p.i.map((i) => at(i)).filter((l): l is PoolLocation => !!l).map(roundFromPool);
  return (p.p ?? []).map(([panoId, lat, lng, heading]) =>
    roundFromCustom({ panoId, lat, lng, heading, pitch: 0, zoom: 0 }),
  );
}

function challengeInfo(code: string, p: ChallengePayload): ChallengeInfo {
  const map = findMap(p.m) ?? officialMaps()[0]!;
  const gameId = load().challengePlayed[code] ?? null;
  const game = gameId ? load().games[gameId] : null;
  return {
    code,
    kind: 'challenge',
    day: null,
    map: map as MapSummary,
    settings: { timeLimitSec: p.t, movement: p.v },
    roundCount: (p.i ?? p.p ?? []).length,
    creator: null,
    players: game?.status === 'finished' ? 1 : 0,
    myGameId: gameId,
    myStatus: game ? game.status : 'none',
  };
}

function payloadFromGame(g: LocalGame): ChallengePayload {
  const indexes = g.rounds.map((r) => r.locIndex);
  const base = { m: g.mapSlug, t: g.settings.timeLimitSec, v: g.settings.movement };
  return indexes.every((i) => i !== null)
    ? { ...base, i: indexes as number[] }
    : { ...base, p: g.rounds.map((r) => [r.pano.panoId, Number(r.lat.toFixed(5)), Number(r.lng.toFixed(5)), Math.round(r.pano.heading)] as [string, number, number, number]) };
}

export function createChallenge(mapSlug: string, settings: GameSettings): ChallengeInfo {
  const map = findMap(mapSlug);
  if (!map) throw notFound('Map');
  const rounds = pickRounds(map, ROUNDS_PER_GAME);
  const s = validateSettings(settings);
  const payload: ChallengePayload = {
    m: map.slug,
    t: s.timeLimitSec,
    v: s.movement,
    ...(rounds.every((r) => r.locIndex !== null)
      ? { i: rounds.map((r) => r.locIndex as number) }
      : { p: rounds.map((r) => [r.pano.panoId, Number(r.lat.toFixed(5)), Number(r.lng.toFixed(5)), Math.round(r.pano.heading)] as [string, number, number, number]) }),
  };
  awardAchievements(['challenge_creator']);
  return challengeInfo(encode(payload), payload);
}

export function challengeFromGame(gameId: string): ChallengeInfo {
  const g = requireGame(gameId);
  if (g.status !== 'finished') throw conflict('Finish the game first', 'game_not_finished');
  const payload = payloadFromGame(g);
  const code = encode(payload);
  update((s) => {
    s.challengePlayed[code] = g.id;
    g.challengeCode = code;
  });
  awardAchievements(['challenge_creator']);
  return challengeInfo(code, payload);
}

export const getChallenge = (code: string): ChallengeInfo => challengeInfo(code, decode(code));

export function playChallenge(code: string): GameView {
  const existing = load().challengePlayed[code];
  if (existing && load().games[existing]) return getGame(existing);
  const p = decode(code);
  const map = findMap(p.m) ?? officialMaps()[0]!;
  const rounds = challengeRounds(p);
  const game = createLocalGame({ map, mode: 'challenge', settings: { timeLimitSec: p.t, movement: p.v }, challengeCode: code, rounds });
  update((s) => {
    s.challengePlayed[code] = game.id;
  });
  return toGameView(game);
}

function myEntry(game: LocalGame | null, withRounds: boolean): ChallengeResults['entries'][number] | null {
  if (!game || game.status !== 'finished') return null;
  return {
    rank: 1,
    user: userRef(),
    score: game.totalScore,
    extra: game.rounds.reduce((sum, r) => sum + (r.timeMs ?? 0), 0),
    gameId: game.id,
    rounds: withRounds ? game.rounds.map(toRoundResult) : null,
  };
}

export function challengeResults(code: string): ChallengeResults {
  const gameId = load().challengePlayed[code];
  const entry = myEntry(gameId ? (load().games[gameId] ?? null) : null, true);
  return { entries: entry ? [entry] : [], me: entry };
}

// ── daily challenge ──────────────────────────────────────────────────────────

function dailyPayload(day: string): ChallengePayload {
  const rand = seededRandom(`taipei-daily-${day}`);
  const rounds = pickMany(ROUNDS_PER_GAME, { rand });
  const settings = dailySettingsFor(day);
  return { m: CITY_SLUG, t: settings.timeLimitSec, v: settings.movement, i: rounds.map((r) => r.index) };
}

export function daily(day = taipeiDay()): ChallengeInfo {
  const gameId = load().dailyPlayed[day] ?? null;
  const game = gameId ? load().games[gameId] : null;
  const settings = dailySettingsFor(day);
  return {
    code: `daily-${day}`,
    kind: 'daily',
    day,
    map: (findMap(CITY_SLUG) ?? officialMaps()[0]!) as MapSummary,
    settings,
    roundCount: ROUNDS_PER_GAME,
    creator: null,
    players: game?.status === 'finished' ? 1 : 0,
    myGameId: gameId,
    myStatus: game ? game.status : 'none',
  };
}

export function playDaily(day = taipeiDay()): GameView {
  const existing = load().dailyPlayed[day];
  if (existing && load().games[existing]) return getGame(existing);
  const p = dailyPayload(day);
  const game = createLocalGame({
    map: findMap(CITY_SLUG)!,
    mode: 'daily',
    settings: { timeLimitSec: p.t, movement: p.v },
    challengeCode: `daily-${day}`,
    rounds: challengeRounds(p),
  });
  update((s) => {
    s.dailyPlayed[day] = game.id;
  });
  return toGameView(game);
}

export function dailyResults(day = taipeiDay()): ChallengeResults {
  const gameId = load().dailyPlayed[day];
  const entry = myEntry(gameId ? (load().games[gameId] ?? null) : null, true);
  return { entries: entry ? [entry] : [], me: entry };
}

// ── streaks ──────────────────────────────────────────────────────────────────

function streakView(run: LocalStreak): StreakView {
  const s = load();
  return {
    id: run.id,
    level: run.level,
    settings: run.settings,
    status: run.status,
    streak: run.streak,
    roundNo: run.roundNo,
    current:
      run.status === 'playing' && run.current && run.roundStartedAt
        ? {
            roundNo: run.roundNo,
            pano: run.current.pano,
            startedAt: new Date(run.roundStartedAt).toISOString(),
            deadline: run.deadline ? new Date(run.deadline).toISOString() : null,
          }
        : null,
    history: run.history.map((h) => ({
      roundNo: h.roundNo,
      pano: h.pano,
      answer: { lat: h.lat, lng: h.lng },
      answerRegion: h.answerRegion,
      guessRegion: h.guessRegion,
      guess: h.guess,
      correct: h.correct,
      timedOut: h.timedOut,
    })),
    best: run.level === 'district' ? s.profile.bestDistrictStreak : s.profile.bestVillageStreak,
    xpGained: run.xpGained,
    newAchievements: [],
  };
}

function nextStreakLocation(level: StreakLevel, exclude: Set<number>): PoolLocation {
  for (let i = 0; i < 5; i++) {
    const district = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)]!.code;
    const loc = pickOne({ district, requireVillage: level === 'village', exclude });
    if (loc) return loc;
  }
  const any = pickOne({ requireVillage: level === 'village', exclude });
  if (!any) throw conflict('No locations available', 'map_empty');
  return any;
}

function setStreakLocation(run: LocalStreak, loc: PoolLocation, start: boolean) {
  run.current = {
    locIndex: loc.index,
    pano: { panoId: loc.panoId, heading: loc.heading, pitch: 0, zoom: 0 },
    lat: loc.lat,
    lng: loc.lng,
    district: loc.district,
    village: loc.village ?? findVillage(loc)?.code ?? null,
  };
  run.roundStartedAt = start ? Date.now() : null;
  run.deadline = start && run.settings.timeLimitSec > 0 ? Date.now() + run.settings.timeLimitSec * 1000 : null;
}

export function createStreak(level: StreakLevel, settings: GameSettings): StreakView {
  const s = validateSettings(settings);
  const run: LocalStreak = {
    id: newId(),
    level,
    settings: s,
    status: 'playing',
    streak: 0,
    roundNo: 1,
    current: null,
    roundStartedAt: null,
    deadline: null,
    history: [],
    xpGained: null,
    createdAt: Date.now(),
  };
  setStreakLocation(run, nextStreakLocation(level, new Set()), true);
  update((st) => {
    st.streaks[run.id] = run;
  });
  return streakView(run);
}

function requireStreak(id: string): LocalStreak {
  const run = load().streaks[id];
  if (!run) throw notFound('Streak');
  return run;
}

export function getStreak(id: string): StreakView {
  const run = requireStreak(id);
  if (run.status === 'playing' && run.roundStartedAt && run.deadline && Date.now() > run.deadline + GRACE_MS) {
    return guessStreak(id, { roundNo: run.roundNo, region: null, guess: null });
  }
  return streakView(run);
}

export function guessStreak(id: string, req: { roundNo: number; region: string | null; guess: LatLng | null }): StreakView {
  const run = requireStreak(id);
  if (run.status !== 'playing') throw conflict('Streak is over', 'game_finished');
  if (!run.current || !run.roundStartedAt) throw conflict('Round not started', 'round_not_started');
  if (req.roundNo !== run.roundNo) throw conflict('Not the current round', 'wrong_round');

  const timedOut = run.deadline !== null && Date.now() > run.deadline + GRACE_MS;
  const region = timedOut ? null : req.region;
  const answerRegion = run.level === 'district' ? run.current.district : (run.current.village ?? '');
  const correct = !!region && region === answerRegion;
  let unlocked: string[] = [];

  update((s) => {
    run.history.push({
      roundNo: run.roundNo,
      locIndex: run.current!.locIndex,
      pano: run.current!.pano,
      lat: run.current!.lat,
      lng: run.current!.lng,
      answerRegion,
      guessRegion: region,
      guess: timedOut ? null : req.guess,
      correct,
      timedOut: timedOut || region === null,
    });
    if (correct) {
      run.streak += 1;
      run.roundNo += 1;
      setStreakLocation(run, nextStreakLocation(run.level, new Set(run.history.map((h) => h.locIndex))), false);
      return;
    }
    run.status = 'finished';
    run.current = null;
    run.roundStartedAt = null;
    run.deadline = null;
    run.xpGained = run.streak * XP.streakCorrect;
    s.profile.xp += run.xpGained;
    if (run.level === 'district') s.profile.bestDistrictStreak = Math.max(s.profile.bestDistrictStreak, run.streak);
    else s.profile.bestVillageStreak = Math.max(s.profile.bestVillageStreak, run.streak);
  });

  if (!correct) {
    const s = load();
    unlocked = awardAchievements([
      ...(run.level === 'district' ? [...(run.streak >= 10 ? ['streak_10'] : []), ...(run.streak >= 25 ? ['streak_25'] : [])] : []),
      ...(run.level === 'village' && run.streak >= 5 ? ['village_streak_5'] : []),
      ...(levelFromXp(s.profile.xp) >= 10 ? ['level_10'] : []),
      ...(levelFromXp(s.profile.xp) >= 25 ? ['level_25'] : []),
    ]);
  }
  return { ...streakView(run), newAchievements: unlocked };
}

export function nextStreakRound(id: string): StreakView {
  const run = requireStreak(id);
  if (run.status === 'playing' && run.current && !run.roundStartedAt) {
    update(() => {
      run.roundStartedAt = Date.now();
      run.deadline = run.settings.timeLimitSec > 0 ? Date.now() + run.settings.timeLimitSec * 1000 : null;
    });
  }
  return streakView(run);
}

export function replaceStreakRound(id: string): StreakView {
  const run = requireStreak(id);
  if (run.status !== 'playing' || !run.current) throw conflict('Nothing to replace', 'cannot_replace');
  update(() => {
    const exclude = new Set([...run.history.map((h) => h.locIndex), run.current!.locIndex]);
    setStreakLocation(run, nextStreakLocation(run.level, exclude), true);
  });
  return streakView(run);
}

// ── explorer, leaderboards, profile ──────────────────────────────────────────

export function explorer() {
  const s = load();
  return DISTRICTS.filter((d) => s.explorer[d.code]).map((d) => ({
    districtCode: d.code,
    medal: s.explorer[d.code]!.medal,
    bestScore: s.explorer[d.code]!.bestScore,
    games: s.explorer[d.code]!.games,
  }));
}

/** Offline "leaderboards" are personal bests from this browser. */
export function leaderboard(path: string): { entries: LeaderboardEntry[]; me: LeaderboardEntry | null } {
  const s = load();
  const user = userRef();
  const entries: LeaderboardEntry[] = [];
  const mapMatch = /^maps\/(.+)$/.exec(path);
  const streakMatch = /^streak\/(district|village)$/.exec(path);

  if (mapMatch) {
    const slug = mapMatch[1]!.split('?')[0]!;
    entries.push(
      ...Object.values(s.games)
        .filter((g) => g.status === 'finished' && g.mapSlug === slug)
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 10)
        .map((g, i) => ({ rank: i + 1, user, score: g.totalScore, extra: g.finishedAt, gameId: g.id })),
    );
  } else if (streakMatch) {
    entries.push(
      ...Object.values(s.streaks)
        .filter((r) => r.status === 'finished' && r.level === streakMatch[1] && r.streak > 0)
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 10)
        .map((r, i) => ({ rank: i + 1, user, score: r.streak, extra: null, gameId: null })),
    );
  } else if (path.startsWith('xp')) {
    entries.push({ rank: 1, user, score: s.profile.xp, extra: null, gameId: null });
  }
  return { entries, me: entries[0] ?? null };
}

export function profilePage(): ProfilePage {
  const s = load();
  const games = Object.values(s.games).filter((g) => g.status === 'finished');
  const rounds = games.flatMap((g) => g.rounds).filter((r) => r.guessedAt);
  const distances = rounds.map((r) => r.distanceM).filter((d): d is number => d !== null);
  return {
    profile: { ...userRef(), xp: s.profile.xp, rating: 0, rankedGames: 0, isGuest: true, createdAt: new Date(s.profile.createdAt).toISOString(), online: true },
    stats: {
      gamesPlayed: games.length,
      roundsPlayed: rounds.length,
      avgScore: games.length ? Math.round(games.reduce((sum, g) => sum + g.totalScore, 0) / games.length) : 0,
      bestScore: Math.max(0, ...games.map((g) => g.totalScore)),
      perfectRounds: rounds.filter((r) => r.score === 5000).length,
      avgDistanceM: distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : null,
      dailyStreak: s.profile.dailyStreak,
      bestDistrictStreak: s.profile.bestDistrictStreak,
      bestVillageStreak: s.profile.bestVillageStreak,
      duelsPlayed: 0,
      duelsWon: 0,
      brPlayed: 0,
      brWon: 0,
    },
    achievements: Object.entries(s.achievements).map(([code, unlockedAt]) => ({ code, unlockedAt })),
    explorer: explorer(),
    recentGames: games
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
      .slice(0, 10)
      .map((g) => {
        const map = findMap(g.mapSlug);
        return {
          id: g.id,
          mode: g.mode,
          mapSlug: g.mapSlug,
          mapName: map?.name ?? g.mapSlug,
          mapNameEn: map?.nameEn ?? g.mapSlug,
          totalScore: g.totalScore,
          finishedAt: new Date(g.finishedAt ?? Date.now()).toISOString(),
        };
      }),
    friendship: 'self',
  };
}

// ── map maker ────────────────────────────────────────────────────────────────

const slugify = () => `m-${Math.random().toString(36).slice(2, 10)}`;

export function listMaps(params: { owner?: string } = {}): (MapSummary & { likedByMe: boolean })[] {
  const s = load();
  const mine = Object.values(s.maps).map(customMapInfo);
  // There is no community server offline: only this browser's maps exist.
  return params.owner ? mine : mine.filter((m) => m.visibility === 'public');
}

export function mapDetail(slug: string): MapSummary & { likedByMe: boolean } {
  const map = findMap(slug);
  if (!map) throw notFound('Map');
  return map;
}

export function createMap(body: { name: string; description?: string }): MapSummary {
  const name = body.name.trim();
  if ([...name].length < 2 || [...name].length > 40) throw badRequest('Map name must be 2–40 characters', 'invalid_name');
  const map: LocalMap = {
    id: newId(),
    slug: slugify(),
    name,
    description: body.description?.trim() ?? '',
    visibility: 'private',
    locations: [],
    plays: 0,
    likes: 0,
    likedByMe: false,
    createdAt: Date.now(),
  };
  update((s) => {
    s.maps[map.id] = map;
  });
  return customMapInfo(map);
}

function requireMap(id: string): LocalMap {
  const map = load().maps[id];
  if (!map) throw notFound('Map');
  return map;
}

export function updateMap(id: string, body: { name?: string; description?: string; visibility?: LocalMap['visibility'] }): MapSummary {
  const map = requireMap(id);
  if (body.visibility === 'public' && map.locations.length < 5) throw conflict('A public map needs at least 5 locations', 'too_few_locations');
  update(() => {
    if (body.name !== undefined) map.name = body.name.trim();
    if (body.description !== undefined) map.description = body.description.trim();
    if (body.visibility !== undefined) map.visibility = body.visibility;
  });
  return customMapInfo(map);
}

export function deleteMap(id: string) {
  update((s) => {
    delete s.maps[id];
  });
  return { ok: true as const };
}

export function mapLocations(id: string) {
  return requireMap(id).locations.map((l, i) => ({ id: i, panoId: l.panoId, lat: l.lat, lng: l.lng, heading: l.heading, pitch: l.pitch, zoom: l.zoom }));
}

export function saveMapLocations(id: string, locations: { panoId: string | null; lat: number; lng: number; heading: number; pitch: number; zoom: number }[]) {
  const map = requireMap(id);
  // Without a server there is no metadata lookup, so only snapped locations can be saved.
  const withPano = locations.filter((l): l is typeof l & { panoId: string } => !!l.panoId);
  const unique = [...new Map(withPano.map((l) => [l.panoId, l])).values()];
  update(() => {
    map.locations = unique.map((l) => ({ panoId: l.panoId, lat: l.lat, lng: l.lng, heading: l.heading, pitch: l.pitch, zoom: l.zoom }));
    if (map.visibility === 'public' && map.locations.length < 5) map.visibility = 'unlisted';
  });
  return { map: customMapInfo(map), saved: unique.length, skipped: locations.length - unique.length };
}

export function likeMap(id: string, like: boolean) {
  const map = requireMap(id);
  update(() => {
    map.likedByMe = like;
    map.likes = like ? 1 : 0;
  });
  return { likes: map.likes, liked: like };
}
