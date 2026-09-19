import { BR_MAX_PLAYERS, MATCH_MODES, TIME_LIMIT_OPTIONS, type MatchConfig, type MovementMode, type PartyState, type TeamId } from '@tg/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { formatTimeLimit } from '../components/GameSettingsForm.tsx';
import { IconShare } from '../components/icons.tsx';
import { EmoteBar } from '../components/Realtime.tsx';
import { ErrorView, Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { mapName } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { shareUrl } from '../lib/env.ts';
import { share } from '../lib/native.ts';
import { call, RealtimeError, useRealtime } from '../lib/realtime.ts';

const TEAM_STYLE: Record<TeamId, string> = { red: 'bg-red-500/15 ring-red-500/60', blue: 'bg-sky-500/15 ring-sky-500/60' };

export default function PartyPage() {
  const { code } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const party = useRealtime((s) => s.party);
  const connected = useRealtime((s) => s.connected);
  const userId = useRealtime((s) => s.userId);
  const [error, setError] = useState<string | null>(null);
  const { data: maps } = useQuery({ queryKey: ['maps', 'official'], queryFn: api.officialMaps, staleTime: 5 * 60_000 });
  const { data: friends } = useQuery({ queryKey: ['friends'], queryFn: api.friends });

  useEffect(() => {
    if (!connected || !code) return;
    if (party?.code === code.toUpperCase()) return;
    call<PartyState>('party:join', { code }).catch((e) => setError(e instanceof RealtimeError ? e.message : 'error'));
  }, [connected, code, party?.code]);

  const act = (event: Parameters<typeof call>[0], payload?: unknown) =>
    call(event, payload).catch((e) => toast(e instanceof RealtimeError ? e.message : t('errors.generic')));

  if (error) return <ErrorView error={new Error(error)} />;
  if (!party || party.code !== code?.toUpperCase())
    return (
      <div className="grid h-64 place-items-center">
        <Spinner />
      </div>
    );

  const isHost = party.hostId === userId;
  const cfg = party.config;
  const me = party.members.find((m) => m.id === userId);
  const teams = cfg.mode === 'team_duels';
  const setConfig = (patch: Partial<MatchConfig>) => act('party:config', patch);
  const canStart =
    cfg.mode === 'duels' ? party.members.length === 2 : party.members.length >= 2 && (!teams || new Set(party.members.map((m) => m.team)).size === 2);
  const onlineFriends = friends?.friends.filter((f) => f.online && !party.members.some((m) => m.id === f.id)) ?? [];

  const member = (m: PartyState['members'][number]) => (
    <div key={m.id} className={`flex items-center gap-3 rounded-xl p-2 ${m.connected ? '' : 'opacity-50'}`}>
      <Avatar id={m.avatar} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">
          {m.nickname} {m.id === userId && <span className="text-xs text-muted">({t('mp.you')})</span>}
        </span>
        <span className="text-xs text-muted">
          Lv.{m.level} {m.id === party.hostId && `· 👑 ${t('mp.host')}`}
        </span>
      </span>
      {isHost && m.id !== userId && (
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => act('party:kick', { userId: m.id })}>
          {t('mp.kick')}
        </button>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="card flex flex-wrap items-center gap-3 p-5">
          <div className="flex-1">
            <p className="text-sm text-muted">{t('mp.lobby')}</p>
            <p className="font-mono text-3xl font-black tracking-widest">{party.code}</p>
          </div>
          <button
            className="btn-secondary"
            onClick={async () => {
              const r = await share({ title: t('app.name'), text: t('mp.partyDesc'), url: shareUrl(`/party/${party.code}`) });
              if (r === 'copied') toast(t('app.copied'));
            }}
          >
            <IconShare width={18} height={18} /> {t('mp.shareLink')}
          </button>
          <button
            className="btn-ghost"
            onClick={async () => {
              await act('party:leave');
              navigate('/multiplayer');
            }}
          >
            {t('mp.leave')}
          </button>
        </div>

        <div className="card p-5">
          <h2 className="mb-2 font-black">{t('mp.members', { count: party.members.length, max: cfg.mode === 'duels' ? 2 : BR_MAX_PLAYERS })}</h2>
          {teams ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(['red', 'blue'] as const).map((team) => (
                <div key={team} className={`rounded-2xl p-2 ring-1 ${TEAM_STYLE[team]}`}>
                  <div className="mb-1 flex items-center justify-between px-2">
                    <span className="font-black">{t(`mp.${team}`)}</span>
                    {me?.team !== team && (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => act('party:team', { team })}>
                        {t('mp.joinTeam', { team: t(`mp.${team}`) })}
                      </button>
                    )}
                  </div>
                  {party.members.filter((m) => m.team === team).map(member)}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-1 sm:grid-cols-2">{party.members.map(member)}</div>
          )}
          <div className="mt-3">
            <EmoteBar compact />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-muted">{t('mp.mode')}</span>
            <select disabled={!isHost} value={cfg.mode} onChange={(e) => setConfig({ mode: e.target.value as MatchConfig['mode'] })} className="w-full rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line disabled:opacity-70">
              {MATCH_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`mp.modes.${m}`)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">{t(`mp.modeDesc.${cfg.mode}`)}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-muted">{t('mp.map')}</span>
            <select disabled={!isHost} value={cfg.mapSlug} onChange={(e) => setConfig({ mapSlug: e.target.value })} className="w-full rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line disabled:opacity-70">
              {maps?.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {mapName(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-muted">{t('mapPage.movement')}</span>
              <select disabled={!isHost} value={cfg.movement} onChange={(e) => setConfig({ movement: e.target.value as MovementMode })} className="w-full rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line disabled:opacity-70">
                {(['moving', 'nomove', 'nmpz'] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`mapPage.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-muted">{t('mapPage.timeLimit')}</span>
              <select disabled={!isHost} value={cfg.timeLimitSec} onChange={(e) => setConfig({ timeLimitSec: Number(e.target.value) })} className="w-full rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line disabled:opacity-70">
                {TIME_LIMIT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {formatTimeLimit(t, s)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {cfg.mode.startsWith('br_') && (
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-muted">{t('mp.lives')}</span>
              <select disabled={!isHost} value={cfg.lives} onChange={(e) => setConfig({ lives: Number(e.target.value) })} className="w-full rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line disabled:opacity-70">
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {'❤️'.repeat(n)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isHost ? (
            <>
              <button className="btn-primary w-full py-4 text-lg" disabled={!canStart} onClick={() => act('party:start')}>
                {t('mp.start')}
              </button>
              {!canStart && <p className="text-center text-xs text-muted">{cfg.mode === 'duels' ? t('mp.needPlayers.duels') : t('mp.needPlayers.default')}</p>}
            </>
          ) : (
            <p className="text-center text-sm text-muted">{t('mp.waitingHost')}</p>
          )}
        </div>

        {onlineFriends.length > 0 && (
          <div className="card p-5">
            <h2 className="mb-2 font-black">{t('mp.onlineFriends')}</h2>
            {onlineFriends.map((f) => (
              <div key={f.id} className="flex items-center gap-3 py-1.5">
                <Avatar id={f.avatar} size={32} />
                <span className="flex-1 truncate font-semibold">{f.nickname}</span>
                <button
                  className="btn-secondary px-3 py-1.5 text-sm"
                  onClick={async () => {
                    await act('party:invite', { userId: f.id });
                    toast(t('mp.invited'));
                  }}
                >
                  {t('mp.invite')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
