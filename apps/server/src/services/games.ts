import {
  findDistrict,
  haversineMeters,
  roundScore,
  ROUNDS_PER_GAME,
  type GameMode,
  type GameSettings,
  type GameView,
  type GuessResponse,
  type LatLng,
  type MovementMode,
  type RoundResult,
  type RoundStart,
} from '@tg/shared';
import type { Db } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { getMapById, getMapBySlug, pickLocations, pickReplacement, toMapSummary, type LocationRow, type MapRow } from './maps.ts';
import { onGameFinished } from './progression.ts';

/** Allowance for network latency and panorama loading on top of the round time limit. */
export const GRACE_MS = 5000;
const MAX_REPLACEMENTS_PER_GAME = 5;

export interface LocationSnapshot {
  locationId: number | null;
  panoId: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  zoom: number;
  district: string | null;
}

export const snapshotOf = (l: LocationRow): LocationSnapshot => ({
  locationId: l.id,
  panoId: l.pano_id,
  lat: l.lat,
  lng: l.lng,
  heading: l.heading,
  pitch: l.pitch,
  zoom: l.zoom,
  district: l.district_code,
});

interface GameRow {
  id: string;
  user_id: string;
  map_id: string;
  mode: GameMode;
  challenge_id: string | null;
  challenge_code: string | null;
  time_limit_sec: number;
  movement: MovementMode;
  round_count: number;
  current_round: number;
  status: 'playing' | 'finished';
  total_score: number;
  xp_gained: number | null;
  replacements: number;
  daily_day: string | null;
}

interface RoundRow {
  round_no: number;
  location_id: number | null;
  pano_id: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  zoom: number;
  district_code: string | null;
  started_at: Date | null;
  deadline: Date | null;
  guess_lat: number | null;
  guess_lng: number | null;
  distance_m: number | null;
  score: number | null;
  timed_out: boolean;
  time_ms: number | null;
  guessed_at: Date | null;
}

export function validateSettings(s: GameSettings): GameSettings {
  if (!['moving', 'nomove', 'nmpz'].includes(s.movement)) throw badRequest('Invalid movement mode');
  const t = Math.round(Number(s.timeLimitSec));
  if (!Number.isFinite(t) || t < 0 || t > 600 || (t > 0 && t < 10)) throw badRequest('Time limit must be 0 or 10–600 seconds');
  return { movement: s.movement, timeLimitSec: t };
}

export async function insertGame(
  db: Db,
  args: {
    userId: string;
    map: MapRow;
    mode: GameMode;
    settings: GameSettings;
    challengeId?: string | null;
    locations: LocationSnapshot[];
  },
): Promise<string> {
  if (args.locations.length === 0) throw conflict('This map has no playable locations', 'map_empty');
  return db.tx(async (tx) => {
    const game = await tx.one<{ id: string }>(
      `insert into public.games (user_id, map_id, mode, challenge_id, time_limit_sec, movement, round_count)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        args.userId,
        args.map.id,
        args.mode,
        args.challengeId ?? null,
        args.settings.timeLimitSec,
        args.settings.movement,
        args.locations.length,
      ],
    );
    await tx.query(
      `insert into public.game_rounds (game_id, round_no, location_id, pano_id, lat, lng, heading, pitch, zoom, district_code)
       select $1, r.n, r."locationId", r."panoId", r.lat, r.lng, r.heading, r.pitch, r.zoom, r.district
       from jsonb_to_recordset($2::jsonb) as r(n int, "locationId" bigint, "panoId" text, lat float8, lng float8,
            heading real, pitch real, zoom real, district text)`,
      [game!.id, JSON.stringify(args.locations.map((l, i) => ({ ...l, n: i + 1 })))],
    );
    await startRound(tx, game!.id, 1, args.settings.timeLimitSec);
    await tx.query('update public.maps set plays = plays + 1 where id = $1', [args.map.id]);
    return game!.id;
  });
}

async function startRound(db: Db, gameId: string, roundNo: number, timeLimitSec: number) {
  await db.query(
    `update public.game_rounds set started_at = now(),
       deadline = case when $3::int > 0 then now() + make_interval(secs => $3::int) else null end
     where game_id = $1 and round_no = $2`,
    [gameId, roundNo, timeLimitSec],
  );
}

export async function createGame(
  db: Db,
  userId: string,
  req: { mapSlug: string; settings: GameSettings; mode?: 'classic' | 'explorer' },
): Promise<GameView> {
  const settings = validateSettings(req.settings);
  const map = await getMapBySlug(db, req.mapSlug, userId);
  const mode = req.mode ?? 'classic';
  if (mode === 'explorer' && !(map.kind === 'official' && map.district_code)) {
    throw badRequest('Explorer mode is only available on district maps');
  }
  const locations = await pickLocations(db, map, ROUNDS_PER_GAME, { userId });
  const id = await insertGame(db, { userId, map, mode, settings, locations: locations.map(snapshotOf) });
  return getGame(db, id, userId);
}

const GAME_COLUMNS = `g.id, g.user_id, g.map_id, g.mode, g.challenge_id, c.code as challenge_code, g.time_limit_sec,
  g.movement, g.round_count, g.current_round, g.status, g.total_score, g.xp_gained, g.replacements,
  (select d.day::text from public.daily_challenges d where d.challenge_id = g.challenge_id) as daily_day`;

async function loadGame(db: Db, gameId: string, userId: string, lock = false) {
  const game = await db.one<GameRow>(
    `select ${GAME_COLUMNS} from public.games g left join public.challenges c on c.id = g.challenge_id
     where g.id = $1 ${lock ? 'for update of g' : ''}`,
    [gameId],
  );
  if (!game || game.user_id !== userId) throw notFound('Game');
  const rounds = await db.query<RoundRow>('select * from public.game_rounds where game_id = $1 order by round_no', [gameId]);
  return { game, rounds };
}

function toRoundResult(r: RoundRow): RoundResult {
  return {
    roundNo: r.round_no,
    pano: { panoId: r.pano_id, heading: r.heading, pitch: r.pitch, zoom: r.zoom },
    guess: r.guess_lat !== null && r.guess_lng !== null ? { lat: r.guess_lat, lng: r.guess_lng } : null,
    answer: { lat: r.lat, lng: r.lng },
    distanceM: r.distance_m,
    score: r.score ?? 0,
    timedOut: r.timed_out,
    timeMs: r.time_ms,
    districtCode: r.district_code,
  };
}

function toRoundStart(r: RoundRow): RoundStart {
  return {
    roundNo: r.round_no,
    pano: { panoId: r.pano_id, heading: r.heading, pitch: r.pitch, zoom: r.zoom },
    startedAt: (r.started_at ?? new Date()).toISOString(),
    deadline: r.deadline ? r.deadline.toISOString() : null,
  };
}

async function buildView(db: Db, game: GameRow, rounds: RoundRow[], newAchievements: string[] = []): Promise<GameView> {
  const map = await getMapById(db, game.map_id);
  const current = rounds.find((r) => r.round_no === game.current_round);
  return {
    id: game.id,
    mode: game.mode,
    map: toMapSummary(map),
    settings: { timeLimitSec: game.time_limit_sec, movement: game.movement },
    status: game.status,
    roundCount: game.round_count,
    currentRound: game.current_round,
    rounds: rounds.filter((r) => r.guessed_at).map(toRoundResult),
    // The answer of the current round is only revealed once it has been guessed.
    current: game.status === 'playing' && current && !current.guessed_at ? toRoundStart(current) : null,
    totalScore: game.total_score,
    challengeCode: game.challenge_code,
    xpGained: game.xp_gained,
    newAchievements,
  };
}

export async function getGame(db: Db, gameId: string, userId: string): Promise<GameView> {
  const { game, rounds } = await loadGame(db, gameId, userId);
  const current = rounds.find((r) => r.round_no === game.current_round);
  if (game.status === 'playing' && current && isExpired(current)) {
    // Player left mid-round and the timer ran out — settle it as a timeout.
    return (await submitGuess(db, gameId, userId, { roundNo: current.round_no, guess: null })).game;
  }
  return buildView(db, game, rounds);
}

const isExpired = (r: RoundRow, now = Date.now()) =>
  !r.guessed_at && r.deadline !== null && now > r.deadline.getTime() + GRACE_MS;

export async function submitGuess(
  db: Db,
  gameId: string,
  userId: string,
  req: { roundNo: number; guess: LatLng | null },
): Promise<GuessResponse> {
  return db.tx(async (tx) => {
    const { game, rounds } = await loadGame(tx, gameId, userId, true);
    if (game.status !== 'playing') throw conflict('Game is already finished', 'game_finished');
    if (req.roundNo !== game.current_round) throw conflict('Not the current round', 'wrong_round');
    const round = rounds.find((r) => r.round_no === req.roundNo)!;
    if (round.guessed_at) throw conflict('Round already guessed', 'already_guessed');

    const now = Date.now();
    const timedOut = round.deadline !== null && now > round.deadline.getTime() + GRACE_MS;
    const guess = timedOut ? null : req.guess;
    if (guess && !(Math.abs(guess.lat) <= 90 && Math.abs(guess.lng) <= 180)) throw badRequest('Invalid guess');
    const map = await getMapById(tx, game.map_id);
    const distance = guess ? haversineMeters(guess, round) : null;
    const score = distance === null ? 0 : roundScore(distance, map.diagonal_km);
    const timeMs = round.started_at ? Math.max(0, now - round.started_at.getTime()) : null;

    const updated = await tx.one<RoundRow>(
      `update public.game_rounds set guess_lat = $3, guess_lng = $4, distance_m = $5, score = $6,
         timed_out = $7, time_ms = $8, guessed_at = now()
       where game_id = $1 and round_no = $2 returning *`,
      [gameId, req.roundNo, guess?.lat ?? null, guess?.lng ?? null, distance, score, guess === null, timeMs],
    );
    const isLast = req.roundNo >= game.round_count;
    game.total_score += score;
    if (isLast) game.status = 'finished';
    await tx.query(
      `update public.games set total_score = $2, status = $3, finished_at = case when $3 = 'finished' then now() else null end
       where id = $1`,
      [gameId, game.total_score, game.status],
    );
    let newAchievements: string[] = [];
    if (isLast) {
      const fin = await onGameFinished(tx, { ...game, map });
      game.xp_gained = fin.xp;
      newAchievements = fin.achievements;
      await tx.query('update public.games set xp_gained = $2 where id = $1', [gameId, game.xp_gained]);
    }
    const allRounds = rounds.map((r) => (r.round_no === req.roundNo ? updated! : r));
    return { result: toRoundResult(updated!), game: await buildView(tx, game, allRounds, newAchievements) };
  });
}

export async function nextRound(db: Db, gameId: string, userId: string): Promise<GameView> {
  return db.tx(async (tx) => {
    const { game, rounds } = await loadGame(tx, gameId, userId, true);
    const current = rounds.find((r) => r.round_no === game.current_round)!;
    if (game.status === 'playing' && current.guessed_at && game.current_round < game.round_count) {
      game.current_round += 1;
      await tx.query('update public.games set current_round = $2 where id = $1', [gameId, game.current_round]);
      await startRound(tx, gameId, game.current_round, game.time_limit_sec);
    }
    return getGame(tx, gameId, userId);
  });
}

/** Swaps the current round's location when its panorama can no longer be loaded. */
export async function replaceRound(db: Db, gameId: string, userId: string, roundNo: number): Promise<GameView> {
  return db.tx(async (tx) => {
    const { game, rounds } = await loadGame(tx, gameId, userId, true);
    const round = rounds.find((r) => r.round_no === roundNo);
    if (game.status !== 'playing' || roundNo !== game.current_round || !round || round.guessed_at) {
      throw conflict('Round cannot be replaced', 'cannot_replace');
    }
    if (game.replacements >= MAX_REPLACEMENTS_PER_GAME) throw conflict('Too many replacements', 'too_many_replacements');
    await tx.query(
      `insert into public.location_reports (location_id, pano_id, user_id, reason, note) values ($1, $2, $3, 'no_coverage', 'auto: failed to load')`,
      [round.location_id, round.pano_id, userId],
    );
    const map = await getMapById(tx, game.map_id);
    const exclude = rounds.map((r) => r.location_id).filter((id): id is number => id !== null);
    const loc = await pickReplacement(tx, map, round, exclude);
    if (!loc) throw conflict('No replacement location available', 'no_replacement');
    await tx.query(
      `update public.game_rounds set location_id = $3, pano_id = $4, lat = $5, lng = $6, heading = $7, pitch = $8,
         zoom = $9, district_code = $10
       where game_id = $1 and round_no = $2`,
      [gameId, roundNo, loc.id, loc.pano_id, loc.lat, loc.lng, loc.heading, loc.pitch, loc.zoom, loc.district_code ?? findDistrict(loc)?.code ?? null],
    );
    await tx.query('update public.games set replacements = replacements + 1 where id = $1', [gameId]);
    await startRound(tx, gameId, roundNo, game.time_limit_sec);
    return getGame(tx, gameId, userId);
  });
}
