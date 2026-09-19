import {
  DISTRICTS,
  XP,
  type GameSettings,
  type LatLng,
  type MovementMode,
  type StreakLevel,
  type StreakRoundResult,
  type StreakView,
} from '@tg/shared';
import type { Db } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { award, levelCodes, streakCodes } from './achievements.ts';
import { GRACE_MS, validateSettings } from './games.ts';
import { randomPoolLocation, type LocationRow } from './maps.ts';
import { addXp } from './progression.ts';

interface StreakLocation {
  locationId: number;
  panoId: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  zoom: number;
  district: string;
  village: string | null;
}

interface RunRow {
  id: string;
  user_id: string;
  level: StreakLevel;
  time_limit_sec: number;
  movement: MovementMode;
  status: 'playing' | 'finished';
  streak: number;
  round_no: number;
  current: StreakLocation | null;
  history: (StreakRoundResult & { locationId: number })[];
  round_started_at: Date | null;
  deadline: Date | null;
}

const toStreakLocation = (l: LocationRow): StreakLocation => ({
  locationId: l.id,
  panoId: l.pano_id,
  lat: l.lat,
  lng: l.lng,
  heading: l.heading,
  pitch: l.pitch,
  zoom: l.zoom,
  district: l.district_code!,
  village: l.village_code,
});

/** Picks the next location: a random district first (equal odds), then a spot inside it. */
async function nextLocation(db: Db, level: StreakLevel, exclude: number[]): Promise<StreakLocation> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const district = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)]!.code;
    const loc = await randomPoolLocation(db, { district, requireVillage: level === 'village', exclude });
    if (loc) return toStreakLocation(loc);
  }
  const any = await randomPoolLocation(db, { requireVillage: level === 'village', exclude });
  if (!any) throw conflict('No locations available', 'map_empty');
  return toStreakLocation(any);
}

async function bestStreak(db: Db, userId: string, level: StreakLevel): Promise<number> {
  const row = await db.one<{ best: number }>(
    `select ${level === 'district' ? 'best_district_streak' : 'best_village_streak'} as best from public.profiles where id = $1`,
    [userId],
  );
  return row?.best ?? 0;
}

async function toView(db: Db, run: RunRow, extras: { xpGained?: number | null; newAchievements?: string[] } = {}): Promise<StreakView> {
  const guessing = run.status === 'playing' && run.current && run.round_started_at;
  return {
    id: run.id,
    level: run.level,
    settings: { timeLimitSec: run.time_limit_sec, movement: run.movement },
    status: run.status,
    streak: run.streak,
    roundNo: run.round_no,
    current: guessing
      ? {
          roundNo: run.round_no,
          pano: { panoId: run.current!.panoId, heading: run.current!.heading, pitch: run.current!.pitch, zoom: run.current!.zoom },
          startedAt: run.round_started_at!.toISOString(),
          deadline: run.deadline ? run.deadline.toISOString() : null,
        }
      : null,
    history: run.history.map(({ locationId: _omit, ...h }) => h),
    best: await bestStreak(db, run.user_id, run.level),
    xpGained: extras.xpGained ?? null,
    newAchievements: extras.newAchievements ?? [],
  };
}

async function loadRun(db: Db, id: string, userId: string, lock = false): Promise<RunRow> {
  const run = await db.one<RunRow>(`select * from public.streak_runs where id = $1 ${lock ? 'for update' : ''}`, [id]);
  if (!run || run.user_id !== userId) throw notFound('Streak');
  return run;
}

export async function createStreak(db: Db, userId: string, req: { level: StreakLevel; settings: GameSettings }): Promise<StreakView> {
  const settings = validateSettings(req.settings);
  const first = await nextLocation(db, req.level, []);
  const run = await db.one<RunRow>(
    `insert into public.streak_runs (user_id, level, time_limit_sec, movement, current, round_started_at, deadline)
     values ($1, $2, $3, $4, $5::jsonb, now(), case when $3::int > 0 then now() + make_interval(secs => $3::int) else null end)
     returning *`,
    [userId, req.level, settings.timeLimitSec, settings.movement, JSON.stringify(first)],
  );
  return toView(db, run!);
}

export async function getStreak(db: Db, id: string, userId: string): Promise<StreakView> {
  const run = await loadRun(db, id, userId);
  if (run.status === 'playing' && run.round_started_at && run.deadline && Date.now() > run.deadline.getTime() + GRACE_MS) {
    return guessStreak(db, id, userId, { roundNo: run.round_no, region: null, guess: null });
  }
  return toView(db, run);
}

const REGION_RE: Record<StreakLevel, RegExp> = { district: /^63000\d{3}$/, village: /^63000\d{6}$/ };

export async function guessStreak(
  db: Db,
  id: string,
  userId: string,
  req: { roundNo: number; region: string | null; guess: LatLng | null },
): Promise<StreakView> {
  return db.tx(async (tx) => {
    const run = await loadRun(tx, id, userId, true);
    if (run.status !== 'playing') throw conflict('Streak is over', 'game_finished');
    if (!run.current || !run.round_started_at) throw conflict('Round not started', 'round_not_started');
    if (req.roundNo !== run.round_no) throw conflict('Not the current round', 'wrong_round');
    if (req.region !== null && !REGION_RE[run.level].test(req.region)) throw badRequest('Invalid region code');

    const timedOut = run.deadline !== null && Date.now() > run.deadline.getTime() + GRACE_MS;
    const region = timedOut ? null : req.region;
    const answerRegion = run.level === 'district' ? run.current.district : run.current.village!;
    const correct = region === answerRegion;
    const result: StreakRoundResult & { locationId: number } = {
      locationId: run.current.locationId,
      roundNo: run.round_no,
      pano: { panoId: run.current.panoId, heading: run.current.heading, pitch: run.current.pitch, zoom: run.current.zoom },
      answer: { lat: run.current.lat, lng: run.current.lng },
      answerRegion,
      guessRegion: region,
      guess: timedOut ? null : req.guess,
      correct,
      timedOut: timedOut || region === null,
    };
    const history = [...run.history, result];

    if (correct) {
      const next = await nextLocation(tx, run.level, history.map((h) => h.locationId));
      const updated = await tx.one<RunRow>(
        `update public.streak_runs set streak = streak + 1, round_no = round_no + 1, current = $2::jsonb,
           history = $3::jsonb, round_started_at = null, deadline = null
         where id = $1 returning *`,
        [id, JSON.stringify(next), JSON.stringify(history)],
      );
      return toView(tx, updated!);
    }

    const updated = await tx.one<RunRow>(
      `update public.streak_runs set status = 'finished', finished_at = now(), current = null,
         history = $2::jsonb, round_started_at = null, deadline = null
       where id = $1 returning *`,
      [id, JSON.stringify(history)],
    );
    const column = run.level === 'district' ? 'best_district_streak' : 'best_village_streak';
    const xp = run.streak * XP.streakCorrect;
    await tx.query(`update public.profiles set ${column} = greatest(${column}, $2) where id = $1`, [userId, run.streak]);
    await addXp(tx, userId, xp);
    const profile = await tx.one<{ xp: number }>('select xp from public.profiles where id = $1', [userId]);
    const achievements = await award(tx, userId, [...streakCodes(run.level, run.streak), ...levelCodes(profile?.xp ?? 0)]);
    return toView(tx, updated!, { xpGained: xp, newAchievements: achievements });
  });
}

export async function nextStreakRound(db: Db, id: string, userId: string): Promise<StreakView> {
  const run = await db.one<RunRow>(
    `update public.streak_runs set round_started_at = now(),
       deadline = case when time_limit_sec > 0 then now() + make_interval(secs => time_limit_sec) else null end
     where id = $1 and user_id = $2 and status = 'playing' and round_started_at is null and current is not null
     returning *`,
    [id, userId],
  );
  return run ? toView(db, run) : getStreak(db, id, userId);
}

/** Swaps the current location when its panorama fails to load (doesn't affect the streak). */
export async function replaceStreakRound(db: Db, id: string, userId: string): Promise<StreakView> {
  return db.tx(async (tx) => {
    const run = await loadRun(tx, id, userId, true);
    if (run.status !== 'playing' || !run.current) throw conflict('Nothing to replace', 'cannot_replace');
    await tx.query(
      `insert into public.location_reports (location_id, pano_id, user_id, reason, note) values ($1, $2, $3, 'no_coverage', 'auto: failed to load')`,
      [run.current.locationId, run.current.panoId, userId],
    );
    const next = await nextLocation(tx, run.level, [...run.history.map((h) => h.locationId), run.current.locationId]);
    const updated = await tx.one<RunRow>(
      `update public.streak_runs set current = $2::jsonb, round_started_at = now(),
         deadline = case when time_limit_sec > 0 then now() + make_interval(secs => time_limit_sec) else null end
       where id = $1 returning *`,
      [id, JSON.stringify(next)],
    );
    return toView(tx, updated!);
  });
}
