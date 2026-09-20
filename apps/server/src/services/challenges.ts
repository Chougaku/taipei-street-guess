import {
  levelFromXp,
  dailySettingsFor,
  randomCode,
  ROUNDS_PER_GAME,
  type ChallengeInfo,
  type ChallengeResults,
  type GameSettings,
  type GameView,
  type LeaderboardEntry,
  type MovementMode,
} from '@tg/shared';
import type { Db } from '../db.ts';
import { conflict, notFound } from '../errors.ts';
import { CITY_MAP_SLUG } from '../seed.ts';
import { award } from './achievements.ts';
import { getGame, insertGame, snapshotOf, validateSettings, type LocationSnapshot } from './games.ts';
import { getMapById, getMapBySlug, pickLocations, toMapSummary } from './maps.ts';
import { taipeiDay } from './progression.ts';

interface ChallengeRow {
  id: string;
  code: string;
  kind: 'challenge' | 'daily';
  creator_id: string | null;
  map_id: string;
  time_limit_sec: number;
  movement: MovementMode;
  round_count: number;
  locations: LocationSnapshot[];
  day: string | null;
}

const CHALLENGE_SELECT = `select c.*, d.day::text as day from public.challenges c
  left join public.daily_challenges d on d.challenge_id = c.id`;

async function insertChallenge(
  db: Db,
  args: { kind: 'challenge' | 'daily'; creatorId: string | null; mapId: string; settings: GameSettings; locations: LocationSnapshot[] },
): Promise<ChallengeRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(8);
    const row = await db.one<{ id: string }>(
      `insert into public.challenges (code, kind, creator_id, map_id, time_limit_sec, movement, round_count, locations)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) on conflict (code) do nothing returning id`,
      [code, args.kind, args.creatorId, args.mapId, args.settings.timeLimitSec, args.settings.movement, args.locations.length, JSON.stringify(args.locations)],
    );
    if (row) return (await db.one<ChallengeRow>(`${CHALLENGE_SELECT} where c.id = $1`, [row.id]))!;
  }
  throw new Error('Could not allocate a challenge code');
}

export async function createChallenge(db: Db, userId: string, req: { mapSlug: string; settings: GameSettings }): Promise<ChallengeInfo> {
  const settings = validateSettings(req.settings);
  const map = await getMapBySlug(db, req.mapSlug, userId);
  const locations = (await pickLocations(db, map, ROUNDS_PER_GAME)).map(snapshotOf);
  if (locations.length === 0) throw conflict('This map has no playable locations', 'map_empty');
  const ch = await insertChallenge(db, { kind: 'challenge', creatorId: userId, mapId: map.id, settings, locations });
  await award(db, userId, ['challenge_creator']);
  return challengeInfo(db, ch, userId);
}

/** "Challenge a friend" from a finished game: same locations and settings. */
export async function createChallengeFromGame(db: Db, userId: string, gameId: string): Promise<ChallengeInfo> {
  const game = await db.one<{ user_id: string; map_id: string; time_limit_sec: number; movement: MovementMode; challenge_id: string | null; status: string }>(
    'select user_id, map_id, time_limit_sec, movement, challenge_id, status from public.games where id = $1',
    [gameId],
  );
  if (!game || game.user_id !== userId) throw notFound('Game');
  if (game.status !== 'finished') throw conflict('Finish the game first', 'game_not_finished');
  if (game.challenge_id) {
    const existing = await db.one<ChallengeRow>(`${CHALLENGE_SELECT} where c.id = $1`, [game.challenge_id]);
    return challengeInfo(db, existing!, userId);
  }
  const locations = await db.query<{
    location_id: number | null;
    pano_id: string;
    lat: number;
    lng: number;
    heading: number;
    pitch: number;
    zoom: number;
    district_code: string | null;
  }>('select * from public.game_rounds where game_id = $1 order by round_no', [gameId]);
  const snapshot: LocationSnapshot[] = locations.map((l) => ({
    locationId: l.location_id,
    panoId: l.pano_id,
    lat: l.lat,
    lng: l.lng,
    heading: l.heading,
    pitch: l.pitch,
    zoom: l.zoom,
    district: l.district_code,
  }));
  const ch = await insertChallenge(db, {
    kind: 'challenge',
    creatorId: userId,
    mapId: game.map_id,
    settings: { timeLimitSec: game.time_limit_sec, movement: game.movement },
    locations: snapshot,
  });
  // The creator's own game counts as their entry.
  await db.query('update public.games set challenge_id = $2, mode = \'challenge\' where id = $1 and mode = \'classic\'', [gameId, ch.id]);
  await award(db, userId, ['challenge_creator']);
  return challengeInfo(db, ch, userId);
}

async function loadChallenge(db: Db, code: string): Promise<ChallengeRow> {
  const ch = await db.one<ChallengeRow>(`${CHALLENGE_SELECT} where c.code = $1`, [code.toUpperCase()]);
  if (!ch) throw notFound('Challenge');
  return ch;
}

async function challengeInfo(db: Db, ch: ChallengeRow, userId: string | null): Promise<ChallengeInfo> {
  const map = await getMapById(db, ch.map_id);
  const creator = ch.creator_id
    ? await db.one<{ id: string; nickname: string; avatar: string; xp: number }>('select id, nickname, avatar, xp from public.profiles where id = $1', [ch.creator_id])
    : null;
  const counts = await db.one<{ players: number }>(
    `select count(*)::int as players from public.games where challenge_id = $1 and status = 'finished'`,
    [ch.id],
  );
  const mine = userId
    ? await db.one<{ id: string; status: 'playing' | 'finished' }>('select id, status from public.games where challenge_id = $1 and user_id = $2', [ch.id, userId])
    : null;
  return {
    code: ch.code,
    kind: ch.kind,
    day: ch.day,
    map: toMapSummary(map),
    settings: { timeLimitSec: ch.time_limit_sec, movement: ch.movement },
    roundCount: ch.round_count,
    creator: creator ? { id: creator.id, nickname: creator.nickname, avatar: creator.avatar, level: levelFromXp(creator.xp) } : null,
    players: counts?.players ?? 0,
    myGameId: mine?.id ?? null,
    myStatus: mine?.status ?? 'none',
  };
}

export async function getChallenge(db: Db, code: string, userId: string | null): Promise<ChallengeInfo> {
  return challengeInfo(db, await loadChallenge(db, code), userId);
}

async function playChallengeRow(db: Db, ch: ChallengeRow, userId: string): Promise<GameView> {
  const existing = await db.one<{ id: string }>('select id from public.games where challenge_id = $1 and user_id = $2', [ch.id, userId]);
  if (existing) return getGame(db, existing.id, userId);
  const map = await getMapById(db, ch.map_id);
  try {
    const id = await insertGame(db, {
      userId,
      map,
      mode: ch.kind === 'daily' ? 'daily' : 'challenge',
      settings: { timeLimitSec: ch.time_limit_sec, movement: ch.movement },
      challengeId: ch.id,
      locations: ch.locations,
    });
    return getGame(db, id, userId);
  } catch (err) {
    // Double click / two tabs: the unique index already has this player's game.
    const again = await db.one<{ id: string }>('select id from public.games where challenge_id = $1 and user_id = $2', [ch.id, userId]);
    if (again) return getGame(db, again.id, userId);
    throw err;
  }
}

export async function playChallenge(db: Db, code: string, userId: string): Promise<GameView> {
  return playChallengeRow(db, await loadChallenge(db, code), userId);
}

async function dailyChallenge(db: Db, day: string): Promise<ChallengeRow> {
  const existing = await db.one<ChallengeRow>(`${CHALLENGE_SELECT} where d.day = $1::date`, [day]);
  if (existing) return existing;
  return db.tx(async (tx) => {
    // Serialise creation so concurrent first requests of the day agree on one challenge.
    await tx.query("select pg_advisory_xact_lock(hashtext('daily-challenge'))");
    const again = await tx.one<ChallengeRow>(`${CHALLENGE_SELECT} where d.day = $1::date`, [day]);
    if (again) return again;
    const map = await getMapBySlug(tx, CITY_MAP_SLUG, null);
    const locations = (await pickLocations(tx, map, ROUNDS_PER_GAME)).map(snapshotOf);
    const ch = await insertChallenge(tx, { kind: 'daily', creatorId: null, mapId: map.id, settings: dailySettingsFor(day), locations });
    await tx.query('insert into public.daily_challenges (day, challenge_id) values ($1::date, $2)', [day, ch.id]);
    return { ...ch, day };
  });
}

export async function getDaily(db: Db, userId: string | null, day = taipeiDay()): Promise<ChallengeInfo> {
  return challengeInfo(db, await dailyChallenge(db, day), userId);
}

export async function playDaily(db: Db, userId: string, day = taipeiDay()): Promise<GameView> {
  return playChallengeRow(db, await dailyChallenge(db, day), userId);
}

interface ResultRow {
  user_id: string;
  nickname: string;
  avatar: string;
  xp: number;
  total_score: number;
  total_ms: number | null;
  game_id: string;
}

function toEntry(r: ResultRow, rank: number): LeaderboardEntry {
  return {
    rank,
    user: { id: r.user_id, nickname: r.nickname, avatar: r.avatar, level: levelFromXp(r.xp) },
    score: r.total_score,
    extra: r.total_ms,
    gameId: r.game_id,
  };
}

/** Challenge leaderboard; per-round guesses are only revealed to players who have finished it. */
export async function challengeResults(db: Db, codeOrDay: { code?: string; day?: string }, userId: string | null, limit = 100): Promise<ChallengeResults> {
  const ch = codeOrDay.code ? await loadChallenge(db, codeOrDay.code) : await dailyChallenge(db, codeOrDay.day!);
  const rows = await db.query<ResultRow>(
    `select g.user_id, p.nickname, p.avatar, p.xp, g.total_score, g.id as game_id,
       (select sum(r.time_ms)::int from public.game_rounds r where r.game_id = g.id) as total_ms
     from public.games g join public.profiles p on p.id = g.user_id
     where g.challenge_id = $1 and g.status = 'finished'
     order by g.total_score desc, total_ms asc nulls last, g.finished_at asc`,
    [ch.id],
  );
  const myIndex = userId ? rows.findIndex((r) => r.user_id === userId) : -1;
  const revealed = myIndex >= 0;
  const top = rows.slice(0, limit);
  const rounds = revealed
    ? await db.query<{ game_id: string; round_no: number; guess_lat: number | null; guess_lng: number | null; lat: number; lng: number; score: number; distance_m: number | null; time_ms: number | null; timed_out: boolean; district_code: string | null; pano_id: string; heading: number; pitch: number; zoom: number }>(
        `select * from public.game_rounds where game_id = any($1::uuid[]) order by round_no`,
        [`{${top.map((r) => r.game_id).join(',')}}`],
      )
    : [];
  return {
    entries: top.map((r, i) => ({
      ...toEntry(r, i + 1),
      rounds: revealed
        ? rounds
            .filter((x) => x.game_id === r.game_id)
            .map((x) => ({
              roundNo: x.round_no,
              pano: { panoId: x.pano_id, heading: x.heading, pitch: x.pitch, zoom: x.zoom },
              guess: x.guess_lat !== null && x.guess_lng !== null ? { lat: x.guess_lat, lng: x.guess_lng } : null,
              answer: { lat: x.lat, lng: x.lng },
              distanceM: x.distance_m,
              score: x.score ?? 0,
              timedOut: x.timed_out,
              timeMs: x.time_ms,
              districtCode: x.district_code,
            }))
        : null,
    })),
    me: myIndex >= 0 ? toEntry(rows[myIndex]!, myIndex + 1) : null,
  };
}
