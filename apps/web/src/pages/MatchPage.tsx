import {
  DUEL_START_HP,
  formatDistance,
  isDuelMode,
  isRegionBr,
  type LatLng,
  type MatchPlayer,
  type MatchState,
  type PanoView,
  type TeamId,
} from '@tg/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { IconClose } from '../components/icons.tsx';
import { EmoteBar, EmoteFloat } from '../components/Realtime.tsx';
import { ErrorView, FullScreenLoader } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import type { ResultLine } from '../game/GameMap.tsx';
import { ScorePill } from '../game/HudParts.tsx';
import { PlayScreen } from '../game/PlayScreen.tsx';
import { RegionLayer, type RegionStyle } from '../game/RegionLayer.tsx';
import { useRegions } from '../game/regions.ts';
import { serverNow } from '../lib/api.ts';
import { useNow } from '../lib/hooks.ts';
import { haptic } from '../lib/native.ts';
import { call, RealtimeError, useRealtime } from '../lib/realtime.ts';
import { sfx } from '../lib/sound.ts';
import { useSettings } from '../stores/settings.ts';

const COLORS = ['#3b82f6', '#a855f7', '#eab308', '#ec4899', '#14b8a6', '#f97316', '#22c55e', '#64748b', '#ef4444', '#0ea5e9'];
const TEAM_COLOR: Record<TeamId, string> = { red: '#ef4444', blue: '#3b82f6' };

export default function MatchRoute() {
  const { id } = useParams();
  return <MatchPage key={id} id={id!} />;
}

function secondsUntil(iso: string | null, now: number): number {
  return iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0;
}

function TeamHp({ match, meTeam }: { match: MatchState; meTeam: TeamId | null }) {
  return (
    <div className="flex w-[min(460px,60vw)] gap-2">
      {match.teams.map((team) => (
        <div key={team.id} className={`flex-1 rounded-xl bg-ink/70 p-1.5 ring-1 backdrop-blur ${team.id === meTeam ? 'ring-white/40' : 'ring-white/10'}`}>
          <div className="mb-1 flex justify-between px-1 text-[11px] font-bold">
            <span style={{ color: TEAM_COLOR[team.id] }}>{match.players.filter((p) => p.team === team.id).map((p) => p.nickname).join(', ')}</span>
            <span className="tabular-nums">{team.hp.toLocaleString()}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(team.hp / DUEL_START_HP) * 100}%`, background: TEAM_COLOR[team.id] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PlayerChip({ p, extra }: { p: MatchPlayer; extra?: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${p.eliminated ? 'opacity-40' : ''}`}>
      <Avatar id={p.avatar} size={28} />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.nickname}</span>
      {extra}
    </div>
  );
}

function MatchPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const units = useSettings((s) => s.units);
  const match = useRealtime((s) => s.matches[id]);
  const userId = useRealtime((s) => s.userId);
  const connected = useRealtime((s) => s.connected);
  const partyCode = useRealtime((s) => s.party?.code ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [sending, setSending] = useState(false);
  const lastPano = useRef<PanoView | null>(null);
  // Re-render a few times a second for countdowns.
  useNow(250);
  const regions = useRegions(match?.mode === 'br_village' ? 'village' : 'district');

  useEffect(() => {
    if (!connected) return;
    call<MatchState>('match:sync', { matchId: id })
      .then((s) => useRealtime.setState((st) => ({ matches: { ...st.matches, [s.id]: s } })))
      .catch((e) => !useRealtime.getState().matches[id] && setError(e instanceof RealtimeError ? e.message : 'error'));
  }, [connected, id]);

  const roundNo = match?.round?.roundNo;
  const phase = match?.round?.phase;
  useEffect(() => setPin(null), [roundNo]);
  useEffect(() => {
    if (phase === 'result') sfx.result(3000);
    if (phase === 'guessing') haptic('light');
  }, [phase, roundNo]);
  useEffect(() => {
    if (match?.status === 'finished') {
      sfx.finish();
      void qc.invalidateQueries({ queryKey: ['me'] });
    }
  }, [match?.status, qc]);

  const regionMode = !!match && isRegionBr(match.mode);
  const pickedRegion = regionMode && pin && regions ? regions.find(pin) : null;
  const colors = useMemo(() => {
    const m = new Map<string, string>();
    match?.players.forEach((p, i) => m.set(p.id, p.team ? TEAM_COLOR[p.team] : COLORS[i % COLORS.length]!));
    return m;
  }, [match?.players]);

  const result = match?.round?.phase === 'result' ? match.round.result : null;
  const lines = useMemo<ResultLine[]>(() => {
    if (!result) return [];
    const mine = result.guesses.find((g) => g.playerId === userId);
    return [{ key: result.roundNo, answer: result.answer, guess: mine?.guess ?? null, color: colors.get(userId ?? '') }];
  }, [result, userId, colors]);
  const extra = useMemo(() => {
    if (!result || !match) return [];
    return result.guesses
      .filter((g) => g.playerId !== userId && g.guess)
      .map((g) => ({ key: g.playerId, position: g.guess!, color: colors.get(g.playerId)!, label: match.players.find((p) => p.id === g.playerId)?.nickname ?? '' }));
  }, [result, match, userId, colors]);
  const regionStyles = useMemo<Record<string, RegionStyle>>(() => {
    const styles: Record<string, RegionStyle> = {};
    for (const r of match?.round?.myAttempts ?? []) styles[r] = { fill: '#ef4444', fillOpacity: 0.3, stroke: '#dc2626' };
    if (result?.answerRegion) styles[result.answerRegion] = { fill: '#22c55e', fillOpacity: 0.35, stroke: '#16a34a', strokeWeight: 3 };
    else if (pickedRegion) styles[pickedRegion] = { fill: '#ff5a36', fillOpacity: 0.3, stroke: '#ff5a36', strokeWeight: 3 };
    return styles;
  }, [match?.round?.myAttempts, result?.answerRegion, pickedRegion]);

  if (error) return <ErrorView error={new Error(error)} />;
  if (!match || !userId || (regionMode && !regions)) return <FullScreenLoader />;

  const round = match.round;
  const me = match.players.find((p) => p.id === userId);
  const finished = match.status === 'finished';
  if (round?.pano) lastPano.current = round.pano;
  const pano = round?.pano ?? lastPano.current;
  const serverTime = serverNow();

  const guess = async (p: LatLng | null) => {
    if (!round || sending || !me || me.done || me.eliminated) return;
    if (!p && regionMode) return;
    setSending(true);
    try {
      const s = await call<MatchState>('match:guess', { matchId: id, roundNo: round.roundNo, guess: p, region: regionMode ? pickedRegion : undefined });
      useRealtime.setState((st) => ({ matches: { ...st.matches, [s.id]: s } }));
      // Region modes: a wrong attempt keeps the round open — clear the pin for the next try.
      if (regionMode) setPin(null);
    } catch (e) {
      toast(e instanceof RealtimeError ? e.message : t('errors.generic'));
    } finally {
      setSending(false);
    }
  };

  const leave = async () => {
    if (!finished && !confirm(t('mp.leaveConfirm'))) return;
    if (!finished) await call('match:leave', { matchId: id }).catch(() => {});
    navigate(partyCode ? `/party/${partyCode}` : '/multiplayer');
  };

  const alive = match.players.filter((p) => !p.eliminated);
  const hud = isDuelMode(match.mode) ? (
    <>
      <TeamHp match={match} meTeam={me?.team ?? null} />
      {round && round.multiplier > 1 && <ScorePill label="×" value={String(round.multiplier)} />}
    </>
  ) : (
    <>
      <ScorePill label={t('mp.alive', { count: alive.length })} value={`${alive.length}/${match.players.length}`} />
      {me?.lives !== null && <ScorePill label={t('mp.lives')} value={me?.eliminated ? '💀' : '❤️'.repeat(me?.lives ?? 0)} />}
      {regionMode && round?.attemptsLeft !== null && round?.phase === 'guessing' && !me?.done && (
        <ScorePill label={t('mp.attemptsLeft', { count: round?.attemptsLeft ?? 0 })} value={String(round?.attemptsLeft ?? 0)} />
      )}
    </>
  );

  const topLeft = (
    <button className="icon-btn" aria-label={t('mp.leaveMatch')} onClick={leave}>
      <IconClose />
    </button>
  );

  // ── Round 1 countdown: nothing to show yet ──
  if (!pano || (round?.phase === 'countdown' && !lastPano.current)) {
    return (
      <div className="game-screen grid place-items-center bg-ink">
        <EmoteFloat />
        <div className="absolute left-4 top-4">{topLeft}</div>
        <div className="text-center">
          <p className="text-lg font-bold text-muted">{t(`mp.modes.${match.mode}`)}</p>
          <p className="mt-2 text-5xl font-black">{t('mp.roundStarting', { n: round?.roundNo ?? 1 })}</p>
          <p className="mt-6 animate-pulse text-7xl font-black text-accent">{secondsUntil(round?.startsAt ?? null, serverTime) || '…'}</p>
        </div>
      </div>
    );
  }

  const waiting =
    round?.phase === 'guessing' && me && (me.done || me.eliminated) ? (
      <div className="rounded-2xl bg-ink/80 px-5 py-3 text-center font-bold shadow-xl ring-1 ring-white/10 backdrop-blur">
        {me.eliminated ? `💀 ${t('mp.eliminated')} · ${t('mp.spectating')}` : t('mp.waitingOthers', { done: alive.filter((p) => p.done).length, total: alive.length })}
      </div>
    ) : undefined;

  const roundPanel = result && (
    <div className="card max-h-[50dvh] overflow-y-auto p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-black">{t('game.roundResult', { n: result.roundNo })}</span>
        {!finished && round?.nextAt && <span className="text-xs text-muted">{t('mp.nextRoundIn', { s: secondsUntil(round.nextAt, serverTime) })}</span>}
      </div>
      {result.damage ? (
        <p className="mb-2 font-bold" style={{ color: TEAM_COLOR[result.damage.team] }}>
          {t('mp.damage', { team: t(`mp.${result.damage.team}`), amount: result.damage.amount.toLocaleString() })}
          {result.damage.multiplier > 1 && <span className="ml-2 text-xs text-muted">×{result.damage.multiplier}</span>}
        </p>
      ) : isDuelMode(match.mode) ? (
        <p className="mb-2 text-muted">{t('mp.noDamage')}</p>
      ) : null}
      {regionMode && result.answerRegion && regions && <p className="mb-2 font-semibold">{t('streak.answerWas', { name: regions.name(result.answerRegion) })}</p>}
      <div className="space-y-0.5">
        {[...result.guesses]
          .sort((a, b) => b.score - a.score || (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
          .map((g) => {
            const p = match.players.find((x) => x.id === g.playerId)!;
            const lost = result.livesLost.includes(g.playerId);
            return (
              <PlayerChip
                key={g.playerId}
                p={p}
                extra={
                  <span className="flex items-center gap-2 text-sm tabular-nums">
                    {lost && <span title={t('mp.livesLost', { names: '' })}>💔</span>}
                    {regionMode ? (
                      <span className={g.correct ? 'text-good' : 'text-bad'}>{g.correct ? '✓' : '✗'}</span>
                    ) : (
                      <>
                        <span className="text-muted">{g.distanceM === null ? '—' : formatDistance(g.distanceM, units)}</span>
                        <span className="w-12 text-right font-black">{g.score.toLocaleString()}</span>
                      </>
                    )}
                  </span>
                }
              />
            );
          })}
      </div>
      <div className="mt-3">
        <EmoteBar matchId={id} compact />
      </div>
    </div>
  );

  const won = finished && (match.winner?.team ? me?.team === match.winner.team : match.winner?.playerId === userId);
  const draw = finished && isDuelMode(match.mode) && match.winner?.team === null;
  const rating = match.ratingChanges?.find((r) => r.playerId === userId);
  const finalPanel = finished && (
    <div className="card max-h-[60dvh] overflow-y-auto p-5 md:max-h-[calc(100dvh-7rem)]">
      <p className={`text-3xl font-black ${draw ? 'text-muted' : won ? 'text-good' : 'text-bad'}`}>
        {draw ? t('mp.draw') : won ? `🏆 ${t('mp.victory')}` : t('mp.defeat')}
      </p>
      {rating && (
        <p className="mt-1 font-bold">
          {t('mp.ratingChange', { before: rating.before, after: rating.after })}{' '}
          <span className={rating.after >= rating.before ? 'text-good' : 'text-bad'}>
            ({rating.after >= rating.before ? '+' : ''}
            {rating.after - rating.before})
          </span>
        </p>
      )}
      {match.xp?.[userId] ? <p className="text-sm font-bold text-teal">{t('game.xpGained', { xp: match.xp[userId] })}</p> : null}
      <div className="mt-3 space-y-0.5">
        {[...match.players]
          .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
          .map((p) => (
            <PlayerChip key={p.id} p={{ ...p, eliminated: false }} extra={<span className="text-sm font-black">{t('mp.placement', { n: p.placement ?? '—' })}</span>} />
          ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {match.partyCode ? (
          <button className="btn-primary col-span-2" onClick={() => navigate(`/party/${match.partyCode}`)}>
            {t('mp.backToLobby')}
          </button>
        ) : (
          <button
            className="btn-primary col-span-2"
            onClick={async () => {
              await call('queue:join').catch(() => {});
              navigate('/multiplayer');
            }}
          >
            {t('mp.playAgain')}
          </button>
        )}
        <button className="btn-secondary col-span-2" onClick={() => navigate('/')}>
          {t('game.home')}
        </button>
      </div>
    </div>
  );

  const countdownOverlay = round?.phase === 'countdown' && (
    <div className="pointer-events-none fixed inset-0 z-[40] grid place-items-center bg-ink/70">
      <div className="text-center">
        <p className="text-4xl font-black">{t('mp.roundStarting', { n: round.roundNo })}</p>
        {isDuelMode(match.mode) && round.multiplier > 1 && <p className="mt-2 text-xl font-bold text-accent-2">{t('mp.multiplier', { x: round.multiplier })}</p>}
        <p className="mt-4 text-6xl font-black text-accent">{secondsUntil(round.startsAt, serverTime)}</p>
      </div>
    </div>
  );

  return (
    <>
      <PlayScreen
        mapId="match-map"
        pano={pano}
        movement={match.config.movement}
        bbox={match.bbox}
        phase={finished || round?.phase === 'result' ? 'result' : 'guess'}
        deadline={round?.phase === 'guessing' && !me?.done ? round.deadline : null}
        pin={pin}
        onPin={setPin}
        canGuess={regionMode ? pickedRegion !== null && !round?.myAttempts.includes(pickedRegion) : pin !== null}
        guessLabel={regionMode && pickedRegion && regions ? t('streak.guessRegion', { name: regions.name(pickedRegion) }) : undefined}
        guessing={sending}
        onGuess={(p, reason) => (reason === 'timeout' && !p ? undefined : void guess(p))}
        onPanoFailed={() => round && call('match:pano_failed', { matchId: id, roundNo: round.roundNo }).catch(() => {})}
        results={lines}
        extraGuesses={extra}
        resultPanel={finished ? finalPanel : roundPanel}
        panelSide={finished}
        hud={hud}
        topLeft={topLeft}
        waitingOverlay={waiting}
        mapChildren={regionMode && regions ? <RegionLayer features={regions.features} styles={regionStyles} baseOpacity={match.mode === 'br_village' ? 0.25 : 0.5} /> : undefined}
      />
      {countdownOverlay}
      <EmoteFloat />
    </>
  );
}
