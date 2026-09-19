/** Realtime (Socket.IO) protocol shared by the game server and clients. */
import type { BBox, LatLng } from './geo.ts';
import type { MovementMode, PanoView, UserRef } from './types.ts';

export type MatchMode = 'duels' | 'team_duels' | 'br_distance' | 'br_district' | 'br_village';
export type TeamId = 'red' | 'blue';

export const MATCH_MODES: MatchMode[] = ['duels', 'team_duels', 'br_distance', 'br_district', 'br_village'];
export const isDuelMode = (m: MatchMode) => m === 'duels' || m === 'team_duels';
export const isRegionBr = (m: MatchMode) => m === 'br_district' || m === 'br_village';

export interface MatchConfig {
  mode: MatchMode;
  mapSlug: string;
  movement: MovementMode;
  /** Max seconds per round (0 = no cap until someone guesses). */
  timeLimitSec: number;
  /** Starting lives for Battle Royale. */
  lives: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  mode: 'duels',
  mapSlug: 'taipei',
  movement: 'moving',
  timeLimitSec: 120,
  lives: 3,
};

export interface PartyMember extends UserRef {
  team: TeamId | null;
  connected: boolean;
}

export interface PartyState {
  code: string;
  hostId: string;
  members: PartyMember[];
  config: MatchConfig;
  /** Set while the party is in a match. */
  matchId: string | null;
}

export interface MatchPlayer extends UserRef {
  team: TeamId | null;
  connected: boolean;
  /** Has guessed (or used all attempts) in the current round. */
  done: boolean;
  lives: number | null;
  eliminated: boolean;
  placement: number | null;
  rating: number | null;
}

export interface MatchGuess {
  playerId: string;
  guess: LatLng | null;
  distanceM: number | null;
  score: number;
  /** Region modes: every attempted region, in order. */
  regions: string[];
  correct: boolean | null;
}

export interface MatchRoundResult {
  roundNo: number;
  pano: PanoView;
  answer: LatLng;
  answerRegion: string | null;
  guesses: MatchGuess[];
  /** Duels: the team that took damage and how much. */
  damage: { team: TeamId; amount: number; multiplier: number } | null;
  /** Battle Royale: players who lost a life this round. */
  livesLost: string[];
}

export type RoundPhase = 'countdown' | 'guessing' | 'result';

export interface MatchRound {
  roundNo: number;
  phase: RoundPhase;
  /** Hidden during the countdown. */
  pano: PanoView | null;
  /** When guessing opens (end of countdown). */
  startsAt: string;
  deadline: string | null;
  /** When the result screen ends and the next round starts. */
  nextAt: string | null;
  multiplier: number;
  /** Your own attempts this round (region modes) — wrong ones are shown so you don't repeat them. */
  myAttempts: string[];
  attemptsLeft: number | null;
  result: MatchRoundResult | null;
}

export interface MatchState {
  id: string;
  mode: MatchMode;
  ranked: boolean;
  partyCode: string | null;
  mapName: string;
  mapNameEn: string;
  bbox: BBox;
  config: MatchConfig;
  status: 'playing' | 'finished';
  teams: { id: TeamId; hp: number }[];
  players: MatchPlayer[];
  round: MatchRound | null;
  history: MatchRoundResult[];
  winner: { team: TeamId | null; playerId: string | null } | null;
  ratingChanges: { playerId: string; before: number; after: number }[] | null;
  xp: Record<string, number> | null;
  serverNow: string;
}

export interface QueueStatus {
  searching: boolean;
  since: string | null;
  mode: 'duels' | null;
}

export interface Invite {
  code: string;
  from: UserRef;
}

export type Ack<T = unknown> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

/** Client → server events (all acknowledged). */
export interface ClientToServer {
  'party:create': (ack: Ack<PartyState>) => void;
  'party:join': (p: { code: string }, ack: Ack<PartyState>) => void;
  'party:leave': (ack: Ack) => void;
  'party:config': (p: Partial<MatchConfig>, ack: Ack<PartyState>) => void;
  'party:team': (p: { team: TeamId }, ack: Ack<PartyState>) => void;
  'party:kick': (p: { userId: string }, ack: Ack<PartyState>) => void;
  'party:start': (ack: Ack<{ matchId: string }>) => void;
  'party:invite': (p: { userId: string }, ack: Ack) => void;
  'queue:join': (ack: Ack<QueueStatus>) => void;
  'queue:leave': (ack: Ack<QueueStatus>) => void;
  'match:sync': (p: { matchId: string }, ack: Ack<MatchState>) => void;
  'match:guess': (p: { matchId: string; roundNo: number; guess: LatLng | null; region?: string | null }, ack: Ack<MatchState>) => void;
  'match:pano_failed': (p: { matchId: string; roundNo: number }, ack: Ack) => void;
  'match:leave': (p: { matchId: string }, ack: Ack) => void;
  emote: (p: { emoji: string; matchId?: string }, ack: Ack) => void;
}

/** Server → client events. */
export interface ServerToClient {
  hello: (p: { userId: string; partyCode: string | null; matchId: string | null; serverNow: string }) => void;
  'party:state': (s: PartyState | null) => void;
  'party:invited': (i: Invite) => void;
  'queue:status': (s: QueueStatus) => void;
  'match:found': (p: { matchId: string }) => void;
  'match:state': (s: MatchState) => void;
  emote: (p: { from: UserRef; emoji: string }) => void;
  notify: (p: { event: string; payload?: unknown }) => void;
}

export const EMOTES = ['👋', '👍', '😂', '😮', '😭', '🔥', '🤔', 'GG'] as const;
