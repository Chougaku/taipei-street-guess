import { divisionForRating, type PartyState } from '@tg/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { IconSwords, IconUsers } from '../components/icons.tsx';
import { useMe } from '../components/Layout.tsx';
import { Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { api } from '../lib/api.ts';
import { useNow } from '../lib/hooks.ts';
import { call, RealtimeError, useRealtime } from '../lib/realtime.ts';

function elapsed(since: string | null, now: number) {
  if (!since) return '0:00';
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function MultiplayerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const queue = useRealtime((s) => s.queue);
  const connected = useRealtime((s) => s.connected);
  const party = useRealtime((s) => s.party);
  const now = useNow(1000, queue.searching);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: friends } = useQuery({ queryKey: ['friends'], queryFn: api.friends, refetchInterval: 30_000 });
  const online = friends?.friends.filter((f) => f.online) ?? [];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof RealtimeError ? e.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">{t('mp.title')}</h1>
      {!connected && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-4" /> {t('mp.connecting')}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card relative overflow-hidden p-6">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-fuchsia-500/20 blur-2xl" />
          <div className="relative">
            <div className="mb-3 grid size-12 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-500 text-white">
              <IconSwords />
            </div>
            <h2 className="text-xl font-black">{t('mp.ranked')}</h2>
            <p className="mt-1 text-sm text-muted">{t('mp.rankedDesc')}</p>
            {me && (
              <p className="mt-3 text-sm">
                {t('profile.rating')}：<span className="font-black">{me.rating}</span> ·{' '}
                <span className="text-accent-2">{t(`division.${divisionForRating(me.rating)}`)}</span>
              </p>
            )}
            {queue.searching ? (
              <div className="mt-4 flex items-center gap-3">
                <Spinner className="size-6" />
                <span className="flex-1 font-semibold">{t('mp.searching', { time: elapsed(queue.since, now) })}</span>
                <button className="btn-secondary" disabled={busy} onClick={() => run(() => call('queue:leave'))}>
                  {t('mp.cancel')}
                </button>
              </div>
            ) : (
              <button className="btn-primary mt-4 w-full" disabled={busy || !connected} onClick={() => run(() => call('queue:join'))}>
                {t('mp.findMatch')}
              </button>
            )}
          </div>
        </section>

        <section className="card relative overflow-hidden p-6">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-amber-500/20 blur-2xl" />
          <div className="relative">
            <div className="mb-3 grid size-12 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-red-500 text-white">
              <IconUsers />
            </div>
            <h2 className="text-xl font-black">{t('mp.party')}</h2>
            <p className="mt-1 text-sm text-muted">{t('mp.partyDesc')}</p>
            {party ? (
              <Link to={`/party/${party.code}`} className="btn-primary mt-4 w-full">
                {t('mp.lobby')} · {party.code}
              </Link>
            ) : (
              <>
                <button
                  className="btn-primary mt-4 w-full"
                  disabled={busy || !connected}
                  onClick={() =>
                    run(async () => {
                      const p = await call<PartyState>('party:create');
                      navigate(`/party/${p.code}`);
                    })
                  }
                >
                  {t('mp.createParty')}
                </button>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.trim()) navigate(`/party/${code.trim().toUpperCase()}`);
                  }}
                >
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder={t('mp.codePlaceholder')}
                    maxLength={8}
                    className="min-w-0 flex-1 rounded-xl bg-panel-2 px-3 py-2 font-mono tracking-widest ring-1 ring-line focus:outline-none focus:ring-accent"
                  />
                  <button className="btn-secondary px-4">{t('mp.joinParty')}</button>
                </form>
              </>
            )}
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-2 font-black">{t('mp.onlineFriends')}</h2>
        {online.length === 0 ? (
          <p className="text-sm text-muted">{t('mp.noOnlineFriends')}</p>
        ) : (
          <div className="divide-y divide-line">
            {online.map((f) => (
              <div key={f.id} className="flex items-center gap-3 py-2">
                <Avatar id={f.avatar} size={36} />
                <span className="flex-1 font-bold">{f.nickname}</span>
                {party && (
                  <button className="btn-secondary px-3 py-2 text-sm" onClick={() => run(async () => {
                    await call('party:invite', { userId: f.id });
                    toast(t('mp.invited'));
                  })}>
                    {t('mp.invite')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
