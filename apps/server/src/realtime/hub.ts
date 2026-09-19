import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import {
  BR_MAX_PLAYERS,
  DEFAULT_MATCH_CONFIG,
  EMOTES,
  INITIAL_RATING,
  isDuelMode,
  levelFromXp,
  MATCH_MODES,
  randomCode,
  type Ack,
  type ClientToServer,
  type MatchConfig,
  type PartyState,
  type QueueStatus,
  type ServerToClient,
  type TeamId,
  type UserRef,
} from '@tg/shared';
import { Server, type Socket } from 'socket.io';
import type { Auth } from '../auth.ts';
import type { Db } from '../db.ts';
import { HttpError } from '../errors.ts';
import { CITY_MAP_SLUG } from '../seed.ts';
import { getMapBySlug } from '../services/maps.ts';
import { DEFAULT_TIMINGS, Match, MatchError, type MatchPlayerInit, type MatchTimings } from './match.ts';

interface SocketData {
  user: UserRef & { rating: number; rankedGames: number };
}
type IoSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

interface Party {
  code: string;
  hostId: string;
  members: Map<string, { ref: SocketData['user']; team: TeamId | null; connected: boolean; dropTimer?: ReturnType<typeof setTimeout> }>;
  config: MatchConfig;
  matchId: string | null;
}

export interface HubOptions {
  timings?: Partial<MatchTimings>;
  /** How long a disconnected party member keeps their seat. */
  partyGraceMs?: number;
  matchmakingIntervalMs?: number;
  corsOrigins?: string[] | true;
  log?(msg: string, err?: unknown): void;
}

const PARTY_MAX = BR_MAX_PLAYERS;

/** Wraps a handler so errors become `{ ok: false }` acks instead of crashing the socket. */
function handle<T>(ack: Ack<T> | undefined, fn: () => Promise<T> | T) {
  Promise.resolve()
    .then(fn)
    .then((data) => ack?.({ ok: true, data }))
    .catch((err: unknown) => {
      const known = err instanceof MatchError || err instanceof HttpError;
      ack?.({ ok: false, error: known ? (err as Error).message : 'Internal error' });
    });
}

export class RealtimeHub {
  readonly io: Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
  private readonly sockets = new Map<string, Set<IoSocket>>();
  private readonly parties = new Map<string, Party>();
  private readonly userParty = new Map<string, string>();
  private readonly matches = new Map<string, Match>();
  private readonly userMatch = new Map<string, string>();
  private readonly queue = new Map<string, { since: number; user: SocketData['user'] }>();
  private readonly timings: MatchTimings;
  private readonly partyGraceMs: number;
  private readonly mmTimer: ReturnType<typeof setInterval>;

  constructor(
    http: HttpServer,
    private readonly db: Db,
    private readonly auth: Auth,
    private readonly opts: HubOptions = {},
  ) {
    this.timings = { ...DEFAULT_TIMINGS, ...opts.timings };
    this.partyGraceMs = opts.partyGraceMs ?? 60_000;
    this.io = new Server(http, { cors: { origin: opts.corsOrigins ?? true }, pingInterval: 10_000, pingTimeout: 8_000 });
    this.io.use(async (socket, next) => {
      try {
        const token = (socket.handshake.auth as { token?: string }).token;
        if (!token) throw new Error('no token');
        const { id } = await auth.verify(token);
        socket.data.user = await this.loadUser(id);
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
    this.io.on('connection', (s) => this.onConnection(s));
    this.mmTimer = setInterval(() => void this.matchmake(), opts.matchmakingIntervalMs ?? 1000);
  }

  // ── presence ──
  isOnline = (userId: string) => (this.sockets.get(userId)?.size ?? 0) > 0;

  notify = (userId: string, event: string, payload?: unknown) => {
    this.io.to(`user:${userId}`).emit('notify', { event, payload });
  };

  private async loadUser(id: string): Promise<SocketData['user']> {
    const p = await this.db.one<{ nickname: string; avatar: string; xp: number; rating: number; ranked_games: number }>(
      'select nickname, avatar, xp, rating, ranked_games from public.profiles where id = $1',
      [id],
    );
    if (!p) throw new Error('profile missing');
    return { id, nickname: p.nickname, avatar: p.avatar, level: levelFromXp(p.xp), rating: p.rating ?? INITIAL_RATING, rankedGames: p.ranked_games };
  }

  private onConnection(s: IoSocket) {
    const me = s.data.user;
    let set = this.sockets.get(me.id);
    if (!set) this.sockets.set(me.id, (set = new Set()));
    set.add(s);
    void s.join(`user:${me.id}`);
    void this.db.query('update public.profiles set last_seen_at = now() where id = $1', [me.id]).catch(() => {});

    const partyCode = this.userParty.get(me.id) ?? null;
    const matchId = this.userMatch.get(me.id) ?? null;
    if (partyCode) this.setPartyConnected(partyCode, me.id, true);
    if (matchId) this.matches.get(matchId)?.setConnected(me.id, true);
    s.emit('hello', { userId: me.id, partyCode, matchId, serverNow: new Date().toISOString() });
    if (partyCode) s.emit('party:state', this.partyState(this.parties.get(partyCode)!));
    if (matchId) s.emit('match:state', this.matches.get(matchId)!.stateFor(me.id));

    s.on('party:create', (ack) => handle(ack, () => this.createParty(me)));
    s.on('party:join', (p, ack) => handle(ack, () => this.joinParty(me, String(p?.code ?? ''))));
    s.on('party:leave', (ack) => handle(ack, () => this.leaveParty(me.id)));
    s.on('party:config', (p, ack) => handle(ack, () => this.configureParty(me.id, p ?? {})));
    s.on('party:team', (p, ack) => handle(ack, () => this.setTeam(me.id, p?.team)));
    s.on('party:kick', (p, ack) => handle(ack, () => this.kick(me.id, String(p?.userId ?? ''))));
    s.on('party:start', (ack) => handle(ack, () => this.startParty(me.id)));
    s.on('party:invite', (p, ack) => handle(ack, () => this.invite(me, String(p?.userId ?? ''))));
    s.on('queue:join', (ack) => handle(ack, () => this.joinQueue(me)));
    s.on('queue:leave', (ack) => handle(ack, () => this.leaveQueue(me.id)));
    s.on('match:sync', (p, ack) => handle(ack, () => this.requireMatch(me.id, p?.matchId).stateFor(me.id)));
    s.on('match:guess', (p, ack) =>
      handle(ack, () => {
        const m = this.requireMatch(me.id, p?.matchId);
        m.guess(me.id, Number(p.roundNo), p.guess ?? null, p.region ?? null);
        return m.stateFor(me.id);
      }),
    );
    s.on('match:pano_failed', (p, ack) => handle(ack, () => this.requireMatch(me.id, p?.matchId).replacePano(me.id, Number(p.roundNo))));
    s.on('match:leave', (p, ack) => handle(ack, () => this.leaveMatch(me.id, p?.matchId)));
    s.on('emote', (p, ack) =>
      handle(ack, () => {
        if (!EMOTES.includes(p?.emoji as never)) throw new MatchError('Unknown emote');
        const room = p.matchId && this.userMatch.get(me.id) === p.matchId ? `match:${p.matchId}` : this.userParty.has(me.id) ? `party:${this.userParty.get(me.id)}` : null;
        if (room) this.io.to(room).emit('emote', { from: this.ref(me), emoji: p.emoji });
      }),
    );

    s.on('disconnect', () => {
      set!.delete(s);
      if (set!.size > 0) return;
      this.sockets.delete(me.id);
      this.queue.delete(me.id);
      const code = this.userParty.get(me.id);
      if (code) this.setPartyConnected(code, me.id, false);
      const mid = this.userMatch.get(me.id);
      if (mid) this.matches.get(mid)?.setConnected(me.id, false);
    });
  }

  private ref(u: SocketData['user']): UserRef {
    return { id: u.id, nickname: u.nickname, avatar: u.avatar, level: u.level };
  }

  private emitToUser<E extends keyof ServerToClient>(userId: string, event: E, ...args: Parameters<ServerToClient[E]>) {
    this.io.to(`user:${userId}`).emit(event, ...args);
  }

  // ── parties ──
  private partyState(p: Party): PartyState {
    return {
      code: p.code,
      hostId: p.hostId,
      members: [...p.members.values()].map((m) => ({ ...this.ref(m.ref), team: m.team, connected: m.connected })),
      config: p.config,
      matchId: p.matchId,
    };
  }

  private broadcastParty(p: Party) {
    const state = this.partyState(p);
    for (const id of p.members.keys()) this.emitToUser(id, 'party:state', state);
  }

  private requireParty(userId: string): Party {
    const code = this.userParty.get(userId);
    const p = code ? this.parties.get(code) : undefined;
    if (!p) throw new MatchError('Not in a party');
    return p;
  }

  private async createParty(me: SocketData['user']): Promise<PartyState> {
    if (this.userParty.has(me.id)) this.leaveParty(me.id);
    let code = randomCode(6);
    while (this.parties.has(code)) code = randomCode(6);
    const p: Party = { code, hostId: me.id, members: new Map(), config: { ...DEFAULT_MATCH_CONFIG }, matchId: null };
    this.parties.set(code, p);
    this.addMember(p, me);
    return this.partyState(p);
  }

  private addMember(p: Party, me: SocketData['user']) {
    this.userParty.set(me.id, p.code);
    p.members.set(me.id, { ref: me, team: this.balancedTeam(p), connected: true });
    for (const s of this.sockets.get(me.id) ?? []) void s.join(`party:${p.code}`);
    this.broadcastParty(p);
  }

  private balancedTeam(p: Party): TeamId {
    const red = [...p.members.values()].filter((m) => m.team === 'red').length;
    const blue = [...p.members.values()].filter((m) => m.team === 'blue').length;
    return red <= blue ? 'red' : 'blue';
  }

  private joinParty(me: SocketData['user'], code: string): PartyState {
    const p = this.parties.get(code.toUpperCase());
    if (!p) throw new MatchError('Party not found');
    if (p.members.has(me.id)) {
      this.setPartyConnected(p.code, me.id, true);
      return this.partyState(p);
    }
    if (p.members.size >= PARTY_MAX) throw new MatchError('Party is full');
    if (p.matchId) throw new MatchError('Party is in a match');
    if (this.userParty.has(me.id)) this.leaveParty(me.id);
    this.addMember(p, me);
    return this.partyState(p);
  }

  private leaveParty(userId: string) {
    const code = this.userParty.get(userId);
    const p = code ? this.parties.get(code) : undefined;
    this.userParty.delete(userId);
    if (!p) return;
    const m = p.members.get(userId);
    if (m?.dropTimer) clearTimeout(m.dropTimer);
    p.members.delete(userId);
    for (const s of this.sockets.get(userId) ?? []) void s.leave(`party:${p.code}`);
    this.emitToUser(userId, 'party:state', null);
    if (p.members.size === 0) {
      this.parties.delete(p.code);
      return;
    }
    if (p.hostId === userId) p.hostId = [...p.members.keys()][0]!;
    this.broadcastParty(p);
  }

  private setPartyConnected(code: string, userId: string, connected: boolean) {
    const p = this.parties.get(code);
    const m = p?.members.get(userId);
    if (!p || !m) return;
    m.connected = connected;
    if (m.dropTimer) clearTimeout(m.dropTimer);
    m.dropTimer = undefined;
    if (connected) for (const s of this.sockets.get(userId) ?? []) void s.join(`party:${code}`);
    // Keep the seat for a while so a page reload or flaky mobile network doesn't kick you out.
    else if (!p.matchId) m.dropTimer = setTimeout(() => this.leaveParty(userId), this.partyGraceMs);
    this.broadcastParty(p);
  }

  private async configureParty(userId: string, patch: Partial<MatchConfig>): Promise<PartyState> {
    const p = this.requireParty(userId);
    if (p.hostId !== userId) throw new MatchError('Only the host can change settings');
    if (p.matchId) throw new MatchError('Party is in a match');
    const next = { ...p.config };
    if (patch.mode !== undefined) {
      if (!MATCH_MODES.includes(patch.mode)) throw new MatchError('Unknown mode');
      next.mode = patch.mode;
    }
    if (patch.mapSlug !== undefined) {
      await getMapBySlug(this.db, String(patch.mapSlug), userId);
      next.mapSlug = String(patch.mapSlug);
    }
    if (patch.movement !== undefined) {
      if (!['moving', 'nomove', 'nmpz'].includes(patch.movement)) throw new MatchError('Unknown movement');
      next.movement = patch.movement;
    }
    if (patch.timeLimitSec !== undefined) {
      const t = Math.round(Number(patch.timeLimitSec));
      if (!(t === 0 || (t >= 10 && t <= 600))) throw new MatchError('Invalid time limit');
      next.timeLimitSec = t;
    }
    if (patch.lives !== undefined) {
      const l = Math.round(Number(patch.lives));
      if (!(l >= 1 && l <= 5)) throw new MatchError('Invalid lives');
      next.lives = l;
    }
    p.config = next;
    this.broadcastParty(p);
    return this.partyState(p);
  }

  private setTeam(userId: string, team: TeamId | undefined): PartyState {
    const p = this.requireParty(userId);
    if (team !== 'red' && team !== 'blue') throw new MatchError('Unknown team');
    p.members.get(userId)!.team = team;
    this.broadcastParty(p);
    return this.partyState(p);
  }

  private kick(userId: string, target: string): PartyState {
    const p = this.requireParty(userId);
    if (p.hostId !== userId) throw new MatchError('Only the host can kick');
    if (target === userId || !p.members.has(target)) throw new MatchError('Cannot kick that player');
    this.leaveParty(target);
    return this.partyState(p);
  }

  private invite(me: SocketData['user'], userId: string) {
    const p = this.requireParty(me.id);
    this.emitToUser(userId, 'party:invited', { code: p.code, from: this.ref(me) });
  }

  private async startParty(userId: string): Promise<{ matchId: string }> {
    const p = this.requireParty(userId);
    if (p.hostId !== userId) throw new MatchError('Only the host can start');
    if (p.matchId) throw new MatchError('Already in a match');
    const members = [...p.members.values()].filter((m) => m.connected);
    const mode = p.config.mode;
    if (mode === 'duels' && members.length !== 2) throw new MatchError('Duels need exactly 2 players');
    if (members.length < 2) throw new MatchError('Need at least 2 players');
    if (mode === 'team_duels' && new Set(members.map((m) => m.team)).size < 2) throw new MatchError('Both teams need players');
    const players: MatchPlayerInit[] = members.map((m, i) => ({
      ...m.ref,
      team: mode === 'duels' ? (i === 0 ? 'red' : 'blue') : mode === 'team_duels' ? m.team : null,
    }));
    const match = await this.createMatch(mode, false, p.code, p.config, players);
    p.matchId = match.id;
    this.broadcastParty(p);
    return { matchId: match.id };
  }

  // ── matches ──
  private async createMatch(mode: MatchConfig['mode'], ranked: boolean, partyCode: string | null, config: MatchConfig, players: MatchPlayerInit[]) {
    const map = await getMapBySlug(this.db, config.mapSlug, null).catch(() => getMapBySlug(this.db, CITY_MAP_SLUG, null));
    const match = new Match(randomUUID(), mode, ranked, partyCode, map, { ...config, mode }, players, {
      db: this.db,
      timings: this.timings,
      broadcast: (m) => {
        for (const id of m.players.keys()) this.emitToUser(id, 'match:state', m.stateFor(id));
      },
      onFinish: (m) => this.onMatchFinished(m),
      log: this.opts.log,
    });
    this.matches.set(match.id, match);
    for (const pl of players) {
      this.userMatch.set(pl.id, match.id);
      for (const s of this.sockets.get(pl.id) ?? []) void s.join(`match:${match.id}`);
      this.emitToUser(pl.id, 'match:found', { matchId: match.id });
    }
    await match.start();
    return match;
  }

  private requireMatch(userId: string, matchId: string | undefined): Match {
    const id = this.userMatch.get(userId);
    const m = id ? this.matches.get(id) : undefined;
    if (!m || (matchId && m.id !== matchId)) {
      // Finished matches stay readable for a while (see onMatchFinished).
      const finished = matchId ? this.matches.get(matchId) : undefined;
      if (finished && finished.players.has(userId)) return finished;
      throw new MatchError('Match not found');
    }
    return m;
  }

  private async leaveMatch(userId: string, matchId: string | undefined) {
    const m = this.requireMatch(userId, matchId);
    await m.leave(userId);
    this.userMatch.delete(userId);
  }

  private onMatchFinished(m: Match) {
    for (const id of m.players.keys()) if (this.userMatch.get(id) === m.id) this.userMatch.delete(id);
    if (m.partyCode) {
      const p = this.parties.get(m.partyCode);
      if (p && p.matchId === m.id) {
        p.matchId = null;
        this.broadcastParty(p);
      }
    }
    // Keep the final state around briefly for late `match:sync` calls, then free it.
    setTimeout(() => {
      m.dispose();
      this.matches.delete(m.id);
    }, 10 * 60_000).unref?.();
  }

  // ── ranked matchmaking ──
  private joinQueue(me: SocketData['user']): QueueStatus {
    if (this.userMatch.has(me.id)) throw new MatchError('Already in a match');
    this.queue.set(me.id, { since: Date.now(), user: me });
    const status: QueueStatus = { searching: true, since: new Date().toISOString(), mode: 'duels' };
    this.emitToUser(me.id, 'queue:status', status);
    return status;
  }

  private leaveQueue(userId: string): QueueStatus {
    this.queue.delete(userId);
    const status: QueueStatus = { searching: false, since: null, mode: null };
    this.emitToUser(userId, 'queue:status', status);
    return status;
  }

  /** Pairs queued players whose ratings are close; the allowed gap widens the longer they wait. */
  private async matchmake() {
    if (this.queue.size < 2) return;
    const now = Date.now();
    const waiting = [...this.queue.values()].sort((a, b) => a.since - b.since);
    const taken = new Set<string>();
    for (const a of waiting) {
      if (taken.has(a.user.id)) continue;
      const window = (x: typeof a) => Math.min(800, 100 + 25 * ((now - x.since) / 1000));
      const b = waiting
        .filter((x) => x.user.id !== a.user.id && !taken.has(x.user.id))
        .filter((x) => Math.abs(x.user.rating - a.user.rating) <= Math.min(window(a), window(x)))
        .sort((x, y) => Math.abs(x.user.rating - a.user.rating) - Math.abs(y.user.rating - a.user.rating))[0];
      if (!b) continue;
      taken.add(a.user.id);
      taken.add(b.user.id);
      this.queue.delete(a.user.id);
      this.queue.delete(b.user.id);
      for (const u of [a, b]) this.emitToUser(u.user.id, 'queue:status', { searching: false, since: null, mode: null });
      const config: MatchConfig = { ...DEFAULT_MATCH_CONFIG, mode: 'duels', mapSlug: CITY_MAP_SLUG, timeLimitSec: 0 };
      // Refresh ratings from the DB in case they changed since queueing.
      const [ua, ub] = await Promise.all([this.loadUser(a.user.id), this.loadUser(b.user.id)]);
      await this.createMatch('duels', true, null, config, [
        { ...ua, team: 'red' },
        { ...ub, team: 'blue' },
      ]).catch((err) => this.opts.log?.('matchmaking failed', err));
    }
  }

  close() {
    clearInterval(this.mmTimer);
    for (const m of this.matches.values()) m.dispose();
    for (const p of this.parties.values()) for (const m of p.members.values()) if (m.dropTimer) clearTimeout(m.dropTimer);
    this.io.close();
  }

  /** Test helper. */
  get stats() {
    return { parties: this.parties.size, matches: this.matches.size, queue: this.queue.size, online: this.sockets.size };
  }

  static isDuelMode = isDuelMode;
}
