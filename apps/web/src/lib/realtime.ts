/** Socket.IO connection + realtime state (parties, matches, queue, invites, emotes). */
import type { ClientToServer, Invite, MatchState, PartyState, QueueStatus, ServerToClient, UserRef } from '@tg/shared';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { setServerClockOffset } from './api.ts';
import { getToken } from './auth.ts';
import { env } from './env.ts';

interface EmoteEvent {
  id: number;
  from: UserRef;
  emoji: string;
}

interface RealtimeState {
  connected: boolean;
  userId: string | null;
  party: PartyState | null;
  matches: Record<string, MatchState>;
  activeMatchId: string | null;
  queue: QueueStatus;
  invites: Invite[];
  emotes: EmoteEvent[];
}

export const useRealtime = create<RealtimeState>(() => ({
  connected: false,
  userId: null,
  party: null,
  matches: {},
  activeMatchId: null,
  queue: { searching: false, since: null, mode: null },
  invites: [],
  emotes: [],
}));

type IoClient = Socket<ServerToClient, ClientToServer>;
let socket: IoClient | null = null;
let emoteId = 1;

/** Navigation requests from realtime events (handled by the router in App). */
const navigate = (path: string) => window.dispatchEvent(new CustomEvent('tg:deeplink', { detail: path }));

export function connectRealtime(): IoClient {
  if (socket) return socket;
  const s: IoClient = io(env.apiBase || undefined, {
    transports: ['websocket'],
    auth: (cb) => {
      void getToken().then(
        (token) => cb({ token }),
        () => cb({}),
      );
    },
    reconnectionDelayMax: 5000,
  });
  socket = s;
  const set = useRealtime.setState;

  s.on('connect', () => set({ connected: true }));
  s.on('disconnect', () => set({ connected: false }));
  s.on('hello', (h) => {
    setServerClockOffset(Date.parse(h.serverNow) - Date.now());
    set({ userId: h.userId, activeMatchId: h.matchId });
    if (!h.partyCode) set({ party: null });
  });
  s.on('party:state', (party) => {
    const prev = useRealtime.getState().party;
    set({ party });
    // Everyone in the lobby follows the party into its match.
    if (party?.matchId && party.matchId !== prev?.matchId) navigate(`/match/${party.matchId}`);
  });
  s.on('match:found', ({ matchId }) => {
    set({ activeMatchId: matchId });
    navigate(`/match/${matchId}`);
  });
  s.on('match:state', (m) => {
    setServerClockOffset(Date.parse(m.serverNow) - Date.now());
    set((st) => ({
      matches: { ...st.matches, [m.id]: m },
      activeMatchId: m.status === 'finished' && st.activeMatchId === m.id ? null : st.activeMatchId,
    }));
  });
  s.on('queue:status', (queue) => set({ queue }));
  s.on('party:invited', (inv) =>
    set((st) => ({ invites: [...st.invites.filter((i) => i.code !== inv.code), inv].slice(-3) })),
  );
  s.on('emote', ({ from, emoji }) => {
    const id = emoteId++;
    set((st) => ({ emotes: [...st.emotes, { id, from, emoji }].slice(-12) }));
    setTimeout(() => set((st) => ({ emotes: st.emotes.filter((e) => e.id !== id) })), 3500);
  });
  s.on('notify', ({ event }) => window.dispatchEvent(new CustomEvent('tg:notify', { detail: event })));
  return s;
}

export class RealtimeError extends Error {}

/** Emits an event and resolves with its acknowledgement. */
export function call<T>(event: keyof ClientToServer, payload?: unknown, timeoutMs = 10_000): Promise<T> {
  const s = connectRealtime();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RealtimeError('timeout')), timeoutMs);
    const ack = (res: { ok: true; data: T } | { ok: false; error: string }) => {
      clearTimeout(timer);
      if (res.ok) resolve(res.data);
      else reject(new RealtimeError(res.error));
    };
    const emit = s.emit as unknown as (...args: unknown[]) => void;
    if (payload === undefined) emit.call(s, event, ack);
    else emit.call(s, event, payload, ack);
  });
}

export function dismissInvite(code: string) {
  useRealtime.setState((st) => ({ invites: st.invites.filter((i) => i.code !== code) }));
}
