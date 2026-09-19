import {
  BR_REGION_ATTEMPTS,
  brDistanceLosers,
  DUEL_START_HP,
  duelMultiplier,
  duelRoundDamage,
  eloUpdate,
  findDistrict,
  haversineMeters,
  isDuelMode,
  isRegionBr,
  roundScore,
  XP,
  type LatLng,
  type MatchConfig,
  type MatchGuess,
  type MatchMode,
  type MatchPlayer,
  type MatchRoundResult,
  type MatchState,
  type RoundPhase,
  type TeamId,
  type UserRef,
} from '@tg/shared';
import { findVillage } from '@tg/shared/villages';
import type { Db } from '../db.ts';
import { award, levelCodes, rankCodes } from '../services/achievements.ts';
import { pickLocations, type LocationRow, type MapRow } from '../services/maps.ts';
import { addXp } from '../services/progression.ts';

export interface MatchTimings {
  countdownMs: number;
  resultMs: number;
  /** After the first player guesses, the others get this long. */
  afterFirstGuessMs: number;
  maxRounds: number;
}

export const DEFAULT_TIMINGS: MatchTimings = { countdownMs: 3000, resultMs: 7000, afterFirstGuessMs: 15_000, maxRounds: 40 };

export interface MatchPlayerInit extends UserRef {
  team: TeamId | null;
  rating: number;
  rankedGames: number;
}

interface RoundGuess {
  guess: LatLng | null;
  distanceM: number | null;
  score: number;
  regions: string[];
  correct: boolean | null;
  done: boolean;
}

interface PlayerRuntime extends MatchPlayerInit {
  connected: boolean;
  left: boolean;
  lives: number | null;
  eliminated: boolean;
  placement: number | null;
}

interface RoundRuntime {
  roundNo: number;
  phase: RoundPhase;
  loc: LocationRow;
  answerRegion: string | null;
  startsAt: number;
  deadline: number | null;
  nextAt: number | null;
  guesses: Map<string, RoundGuess>;
  result: MatchRoundResult | null;
}

export interface MatchDeps {
  db: Db;
  timings: MatchTimings;
  /** Called whenever players should receive a fresh state. */
  broadcast(match: Match): void;
  onFinish(match: Match): void;
  log?(msg: string, err?: unknown): void;
}

export class MatchError extends Error {}

export class Match {
  readonly players = new Map<string, PlayerRuntime>();
  readonly teamHp = new Map<TeamId, number>();
  readonly history: MatchRoundResult[] = [];
  status: 'playing' | 'finished' = 'playing';
  round: RoundRuntime | null = null;
  winner: MatchState['winner'] = null;
  ratingChanges: MatchState['ratingChanges'] = null;
  xp: Record<string, number> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private usedLocations: number[] = [];
  private panoReplacements = 0;
  private finishing = false;

  constructor(
    readonly id: string,
    readonly mode: MatchMode,
    readonly ranked: boolean,
    readonly partyCode: string | null,
    readonly map: MapRow,
    readonly config: MatchConfig,
    players: MatchPlayerInit[],
    private readonly deps: MatchDeps,
  ) {
    for (const p of players) {
      this.players.set(p.id, {
        ...p,
        connected: true,
        left: false,
        lives: isDuelMode(mode) ? null : config.lives,
        eliminated: false,
        placement: null,
      });
    }
    if (isDuelMode(mode)) {
      this.teamHp.set('red', DUEL_START_HP);
      this.teamHp.set('blue', DUEL_START_HP);
    }
  }

  get alive(): PlayerRuntime[] {
    return [...this.players.values()].filter((p) => !p.eliminated && !p.left);
  }

  async start() {
    await this.deps.db.query(
      `insert into public.matches (id, mode, ranked, party_code, map_id, settings) values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [this.id, this.mode, this.ranked, this.partyCode, this.map.id, JSON.stringify(this.config)],
    );
    await this.startRound();
  }

  private schedule(ms: number, fn: () => void | Promise<void>) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      Promise.resolve(fn()).catch((err) => this.deps.log?.(`match ${this.id} timer failed`, err));
    }, ms);
  }

  private async pickLocation(): Promise<LocationRow> {
    const [loc] = await pickLocations(this.deps.db, this.map, 1, { exclude: this.usedLocations });
    if (!loc) throw new MatchError('No locations available');
    this.usedLocations.push(loc.id);
    return loc;
  }

  private answerRegionOf(loc: LocationRow): string | null {
    if (this.mode === 'br_district') return loc.district_code ?? findDistrict(loc)?.code ?? null;
    if (this.mode === 'br_village') return loc.village_code ?? findVillage(loc)?.code ?? null;
    return null;
  }

  private async startRound() {
    if (this.status !== 'playing') return;
    let loc = await this.pickLocation();
    // Region modes need a location whose region is known (e.g. custom maps just outside boundaries).
    for (let i = 0; i < 5 && isRegionBr(this.mode) && !this.answerRegionOf(loc); i++) loc = await this.pickLocation();
    const now = Date.now();
    this.round = {
      roundNo: (this.round?.roundNo ?? 0) + 1,
      phase: 'countdown',
      loc,
      answerRegion: this.answerRegionOf(loc),
      startsAt: now + this.deps.timings.countdownMs,
      deadline: null,
      nextAt: null,
      guesses: new Map(),
      result: null,
    };
    this.deps.broadcast(this);
    this.schedule(this.deps.timings.countdownMs, () => this.openGuessing());
  }

  private openGuessing() {
    const r = this.round;
    if (!r || r.phase !== 'countdown') return;
    r.phase = 'guessing';
    r.startsAt = Date.now();
    r.deadline = this.config.timeLimitSec > 0 ? r.startsAt + this.config.timeLimitSec * 1000 : null;
    this.deps.broadcast(this);
    if (r.deadline) this.schedule(r.deadline - Date.now(), () => this.resolveRound());
    // Everyone already gone (e.g. all disconnected players left) — nothing to wait for.
    if (this.alive.length === 0) void this.resolveRound();
  }

  /** Players whose guesses still count this round. */
  private get participants(): PlayerRuntime[] {
    return this.alive;
  }

  guess(userId: string, roundNo: number, guess: LatLng | null, region: string | null | undefined) {
    const r = this.round;
    const p = this.players.get(userId);
    if (!p) throw new MatchError('Not in this match');
    if (this.status !== 'playing' || !r || r.phase !== 'guessing' || r.roundNo !== roundNo) throw new MatchError('Round is not open');
    if (p.eliminated || p.left) throw new MatchError('You are out');
    const existing = r.guesses.get(userId);
    if (existing?.done) throw new MatchError('Already guessed');
    if (guess && !(Math.abs(guess.lat) <= 90 && Math.abs(guess.lng) <= 180)) throw new MatchError('Invalid guess');

    if (isRegionBr(this.mode)) {
      const maxAttempts = BR_REGION_ATTEMPTS[this.mode === 'br_district' ? 'district' : 'village'];
      const g: RoundGuess = existing ?? { guess: null, distanceM: null, score: 0, regions: [], correct: false, done: false };
      if (region && g.regions.includes(region)) throw new MatchError('Already tried that region');
      if (region) g.regions.push(region);
      g.guess = guess;
      g.correct = !!region && region === r.answerRegion;
      g.done = g.correct || g.regions.length >= maxAttempts || !region;
      r.guesses.set(userId, g);
    } else {
      const distanceM = guess ? haversineMeters(guess, r.loc) : null;
      r.guesses.set(userId, {
        guess,
        distanceM,
        score: distanceM === null ? 0 : roundScore(distanceM, this.map.diagonal_km),
        regions: [],
        correct: null,
        done: true,
      });
    }

    const doneCount = this.participants.filter((x) => r.guesses.get(x.id)?.done).length;
    if (doneCount >= this.participants.length) {
      void this.resolveRound();
      return;
    }
    // First finished guess starts the short countdown for everyone else.
    if (r.guesses.get(userId)?.done) {
      const cutoff = Date.now() + this.deps.timings.afterFirstGuessMs;
      if (r.deadline === null || cutoff < r.deadline) {
        r.deadline = cutoff;
        this.schedule(cutoff - Date.now(), () => this.resolveRound());
      }
    }
    this.deps.broadcast(this);
  }

  /** Swap the round's location if its panorama doesn't load (limited, and only early in the round). */
  async replacePano(userId: string, roundNo: number) {
    const r = this.round;
    if (!r || r.roundNo !== roundNo || !this.players.has(userId)) return;
    if (r.phase === 'result' || r.guesses.size > 0 || this.panoReplacements >= 3) return;
    this.panoReplacements++;
    await this.deps.db.query(
      `insert into public.location_reports (location_id, pano_id, user_id, reason, note) values ($1, $2, $3, 'no_coverage', 'auto: failed to load (match)')`,
      [r.loc.id, r.loc.pano_id, userId],
    );
    r.loc = await this.pickLocation();
    r.answerRegion = this.answerRegionOf(r.loc);
    this.deps.broadcast(this);
  }

  private async resolveRound() {
    const r = this.round;
    if (!r || r.phase !== 'guessing') return;
    r.phase = 'result';
    const guesses: MatchGuess[] = [...this.players.values()]
      .filter((p) => !p.eliminated || r.guesses.has(p.id))
      .map((p) => {
        const g = r.guesses.get(p.id);
        return {
          playerId: p.id,
          guess: g?.guess ?? null,
          distanceM: g?.distanceM ?? null,
          score: g?.score ?? 0,
          regions: g?.regions ?? [],
          correct: isRegionBr(this.mode) ? (g?.correct ?? false) : null,
        };
      });

    let damage: MatchRoundResult['damage'] = null;
    let livesLost: string[] = [];

    if (isDuelMode(this.mode)) {
      const best = (team: TeamId) =>
        Math.max(0, ...guesses.filter((g) => this.players.get(g.playerId)?.team === team).map((g) => g.score));
      const out = duelRoundDamage(r.roundNo, { red: best('red'), blue: best('blue') });
      if (out.loser) {
        const team = out.loser as TeamId;
        this.teamHp.set(team, Math.max(0, this.teamHp.get(team)! - out.damage));
        damage = { team, amount: out.damage, multiplier: duelMultiplier(r.roundNo) };
      }
    } else {
      const alive = this.alive;
      if (this.mode === 'br_distance') {
        const losers = brDistanceLosers(alive.map((p) => ({ id: p.id, lives: p.lives ?? 0, distanceM: r.guesses.get(p.id)?.distanceM ?? null })));
        livesLost = [...losers];
      } else {
        const failed = alive.filter((p) => !r.guesses.get(p.id)?.correct).map((p) => p.id);
        // If everyone failed, nobody loses a life — otherwise a single hard round could end the game with no winner.
        livesLost = failed.length === alive.length ? [] : failed;
      }
      const aliveBefore = alive.length;
      const eliminated: PlayerRuntime[] = [];
      for (const id of livesLost) {
        const p = this.players.get(id)!;
        p.lives = Math.max(0, (p.lives ?? 1) - 1);
        if (p.lives === 0) eliminated.push(p);
      }
      for (const p of eliminated) {
        p.eliminated = true;
        p.placement = aliveBefore - eliminated.length + 1;
      }
    }

    r.result = {
      roundNo: r.roundNo,
      pano: { panoId: r.loc.pano_id, heading: r.loc.heading, pitch: r.loc.pitch, zoom: r.loc.zoom },
      answer: { lat: r.loc.lat, lng: r.loc.lng },
      answerRegion: r.answerRegion,
      guesses,
      damage,
      livesLost,
    };
    this.history.push(r.result);
    r.nextAt = Date.now() + this.deps.timings.resultMs;

    const over = this.isOver();
    this.deps.broadcast(this);
    this.schedule(this.deps.timings.resultMs, () => (over ? this.finish() : this.startRound()));
  }

  private isOver(): boolean {
    if (isDuelMode(this.mode)) return [...this.teamHp.values()].some((hp) => hp <= 0) || this.activeTeams().length < 2;
    return this.alive.length <= 1 || (this.round?.roundNo ?? 0) >= this.deps.timings.maxRounds;
  }

  private activeTeams(): TeamId[] {
    return [...new Set(this.alive.map((p) => p.team).filter((t): t is TeamId => t !== null))];
  }

  /** A player quits: in duels their team forfeits once nobody is left on it; in BR they're eliminated. */
  async leave(userId: string) {
    const p = this.players.get(userId);
    if (!p || p.left || this.status !== 'playing') return;
    p.left = true;
    p.connected = false;
    if (!isDuelMode(this.mode) && !p.eliminated) {
      p.eliminated = true;
      p.placement = this.alive.length + 1;
    }
    if (this.isOver()) {
      if (this.timer) clearTimeout(this.timer);
      await this.finish();
      return;
    }
    const r = this.round;
    if (r?.phase === 'guessing' && this.participants.every((x) => r.guesses.get(x.id)?.done)) await this.resolveRound();
    else this.deps.broadcast(this);
  }

  setConnected(userId: string, connected: boolean) {
    const p = this.players.get(userId);
    if (!p || p.left) return;
    p.connected = connected;
    this.deps.broadcast(this);
  }

  private async finish() {
    if (this.finishing) return;
    this.finishing = true;
    this.status = 'finished';
    if (this.timer) clearTimeout(this.timer);

    const players = [...this.players.values()];
    if (isDuelMode(this.mode)) {
      const teams = this.activeTeams();
      const winnerTeam: TeamId | null =
        teams.length === 1
          ? teams[0]!
          : (this.teamHp.get('red') ?? 0) === (this.teamHp.get('blue') ?? 0)
            ? null
            : (this.teamHp.get('red') ?? 0) > (this.teamHp.get('blue') ?? 0)
              ? 'red'
              : 'blue';
      this.winner = { team: winnerTeam, playerId: null };
      for (const p of players) p.placement = winnerTeam === null ? 1 : p.team === winnerTeam ? 1 : 2;
    } else {
      // Survivors are ranked by lives left, then by total score as a tiebreak.
      const totals = new Map(players.map((p) => [p.id, this.history.reduce((s, h) => s + (h.guesses.find((g) => g.playerId === p.id)?.score ?? 0), 0)]));
      const survivors = this.alive.sort((a, b) => (b.lives ?? 0) - (a.lives ?? 0) || totals.get(b.id)! - totals.get(a.id)!);
      survivors.forEach((p, i) => (p.placement = i + 1));
      this.winner = { team: null, playerId: survivors[0]?.id ?? null };
    }

    try {
      await this.persist();
    } catch (err) {
      this.deps.log?.(`match ${this.id} persist failed`, err);
    }
    this.round = this.round && { ...this.round, nextAt: null };
    this.deps.broadcast(this);
    this.deps.onFinish(this);
  }

  private async persist() {
    const db = this.deps.db;
    const players = [...this.players.values()];
    const xp: Record<string, number> = {};
    const ratings = new Map<string, { before: number; after: number }>();

    if (this.ranked && this.mode === 'duels' && players.length === 2) {
      const [a, b] = players as [PlayerRuntime, PlayerRuntime];
      const result = (p: PlayerRuntime): 0 | 0.5 | 1 => (this.winner?.team === null ? 0.5 : p.team === this.winner?.team ? 1 : 0);
      ratings.set(a.id, { before: a.rating, after: eloUpdate(a.rating, b.rating, result(a), a.rankedGames) });
      ratings.set(b.id, { before: b.rating, after: eloUpdate(b.rating, a.rating, result(b), b.rankedGames) });
      this.ratingChanges = [...ratings].map(([playerId, r]) => ({ playerId, ...r }));
    }

    await db.tx(async (tx) => {
      await tx.query(`update public.matches set rounds = $2::jsonb, result = $3::jsonb, finished_at = now() where id = $1`, [
        this.id,
        JSON.stringify(this.history),
        JSON.stringify({ winner: this.winner, teams: Object.fromEntries(this.teamHp) }),
      ]);
      for (const p of players) {
        const won = p.placement === 1 && (this.winner?.team !== null || this.winner?.playerId !== null);
        xp[p.id] = p.left ? 0 : isDuelMode(this.mode) ? (won ? XP.duelWin : XP.duelLoss) : won ? XP.brWin : XP.brPlacement;
        const r = ratings.get(p.id);
        await tx.query(
          `insert into public.match_players (match_id, user_id, team, placement, rating_before, rating_after, xp_gained)
           values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing`,
          [this.id, p.id, p.team, p.placement, r?.before ?? null, r?.after ?? null, xp[p.id]],
        );
        if (r) await tx.query('update public.profiles set rating = $2, ranked_games = ranked_games + 1 where id = $1', [p.id, r.after]);
        await addXp(tx, p.id, xp[p.id]!);

        const stats = await tx.one<{ duel_wins: number; br_wins: number; xp: number; rating: number }>(
          `select
             (select count(*)::int from public.match_players mp join public.matches m on m.id = mp.match_id
                where mp.user_id = $1 and m.mode in ('duels', 'team_duels') and mp.placement = 1) as duel_wins,
             (select count(*)::int from public.match_players mp join public.matches m on m.id = mp.match_id
                where mp.user_id = $1 and m.mode like 'br_%' and mp.placement = 1) as br_wins,
             p.xp, p.rating
           from public.profiles p where p.id = $1`,
          [p.id],
        );
        if (stats) {
          const codes = [
            ...(stats.duel_wins >= 1 ? ['duel_win'] : []),
            ...(stats.duel_wins >= 10 ? ['duel_wins_10'] : []),
            ...(stats.br_wins >= 1 ? ['br_win'] : []),
            ...levelCodes(stats.xp),
            ...(r ? rankCodes(stats.rating) : []),
          ];
          await award(tx, p.id, codes);
        }
      }
    });
    this.xp = xp;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Per-player view: hides the answer (and other players' guesses) until the round result. */
  stateFor(userId: string): MatchState {
    const r = this.round;
    const me = r?.guesses.get(userId);
    const maxAttempts = isRegionBr(this.mode) ? BR_REGION_ATTEMPTS[this.mode === 'br_district' ? 'district' : 'village'] : null;
    const players: MatchPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      level: p.level,
      team: p.team,
      connected: p.connected,
      done: !!r?.guesses.get(p.id)?.done,
      lives: p.lives,
      eliminated: p.eliminated,
      placement: p.placement,
      rating: this.ranked ? p.rating : null,
    }));
    return {
      id: this.id,
      mode: this.mode,
      ranked: this.ranked,
      partyCode: this.partyCode,
      mapName: this.map.name,
      mapNameEn: this.map.name_en,
      bbox: this.map.bbox as MatchState['bbox'],
      config: this.config,
      status: this.status,
      teams: [...this.teamHp].map(([id, hp]) => ({ id, hp })),
      players,
      round: r
        ? {
            roundNo: r.roundNo,
            phase: r.phase,
            pano: r.phase === 'countdown' ? null : { panoId: r.loc.pano_id, heading: r.loc.heading, pitch: r.loc.pitch, zoom: r.loc.zoom },
            startsAt: new Date(r.startsAt).toISOString(),
            deadline: r.deadline ? new Date(r.deadline).toISOString() : null,
            nextAt: r.nextAt ? new Date(r.nextAt).toISOString() : null,
            multiplier: duelMultiplier(r.roundNo),
            myAttempts: me?.regions ?? [],
            attemptsLeft: maxAttempts === null ? null : me?.done ? 0 : maxAttempts - (me?.regions.length ?? 0),
            result: r.result,
          }
        : null,
      history: this.history,
      winner: this.winner,
      ratingChanges: this.ratingChanges,
      xp: this.xp,
      serverNow: new Date().toISOString(),
    };
  }
}
