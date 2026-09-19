import type { UserRef } from '@tg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { useMe } from '../components/Layout.tsx';
import { Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { api, ApiError } from '../lib/api.ts';

function PlayerRow({ user, online, children }: { user: UserRef; online?: boolean; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Link to={`/u/${user.id}`} className="relative">
        <Avatar id={user.avatar} size={40} />
        {online !== undefined && (
          <span className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-panel ${online ? 'bg-good' : 'bg-line'}`} />
        )}
      </Link>
      <Link to={`/u/${user.id}`} className="min-w-0 flex-1">
        <span className="block truncate font-bold">{user.nickname}</span>
        <span className="text-xs text-muted">Lv.{user.level}</span>
      </Link>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

export default function FriendsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({ queryKey: ['friends'], queryFn: api.friends, refetchInterval: 30_000 });
  const [code, setCode] = useState('');
  const [q, setQ] = useState('');
  const { data: found } = useQuery({ queryKey: ['player-search', q], queryFn: () => api.searchPlayers(q), enabled: q.trim().length >= 2 });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['friends'] });
  const byCode = useMutation({
    mutationFn: () => api.addFriendByCode(code),
    onSuccess: () => {
      toast(t('friends.sent'));
      setCode('');
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError && e.status === 404 ? t('friends.notFound') : t('errors.generic')),
  });
  const add = useMutation({ mutationFn: api.addFriend, onSuccess: refresh });
  const remove = useMutation({ mutationFn: api.removeFriend, onSuccess: refresh });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-black">{t('friends.title')}</h1>

      <div className="card space-y-3 p-5">
        {me && (
          <p className="text-sm text-muted">
            {t('friends.myCode')}：
            <button
              className="ml-1 rounded-lg bg-panel-2 px-2 py-1 font-mono text-base font-bold text-text ring-1 ring-line"
              onClick={async () => {
                await navigator.clipboard.writeText(me.friendCode);
                toast(t('app.copied'));
              }}
            >
              {me.friendCode}
            </button>
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) byCode.mutate();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t('friends.addByCode')}
            className="min-w-0 flex-1 rounded-xl bg-panel-2 px-3 py-2 font-mono ring-1 ring-line focus:outline-none focus:ring-accent"
          />
          <button className="btn-primary px-4" disabled={byCode.isPending}>
            {t('friends.add')}
          </button>
        </form>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('friends.search')}
          className="w-full rounded-xl bg-panel-2 px-3 py-2 ring-1 ring-line focus:outline-none focus:ring-accent"
        />
        {found && found.length > 0 && (
          <div className="divide-y divide-line">
            {found.map((u) => (
              <PlayerRow key={u.id} user={u}>
                <button className="btn-secondary px-3 py-2 text-sm" onClick={() => add.mutate(u.id, { onSuccess: () => toast(t('friends.sent')) })}>
                  {t('friends.add')}
                </button>
              </PlayerRow>
            ))}
          </div>
        )}
      </div>

      {data && data.incoming.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-2 font-black">{t('friends.incoming')}</h2>
          <div className="divide-y divide-line">
            {data.incoming.map((u) => (
              <PlayerRow key={u.id} user={u}>
                <button className="btn-primary px-3 py-2 text-sm" onClick={() => add.mutate(u.id)}>
                  {t('friends.accept')}
                </button>
                <button className="btn-secondary px-3 py-2 text-sm" onClick={() => remove.mutate(u.id)}>
                  {t('friends.decline')}
                </button>
              </PlayerRow>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-2 font-black">{t('friends.title')}</h2>
        {isLoading ? (
          <Spinner />
        ) : data && data.friends.length > 0 ? (
          <div className="divide-y divide-line">
            {data.friends.map((u) => (
              <PlayerRow key={u.id} user={u} online={u.online} />
            ))}
          </div>
        ) : (
          <p className="text-muted">{t('friends.empty')}</p>
        )}
      </div>

      {data && data.outgoing.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-2 font-black">{t('friends.outgoing')}</h2>
          <div className="divide-y divide-line">
            {data.outgoing.map((u) => (
              <PlayerRow key={u.id} user={u}>
                <button className="btn-secondary px-3 py-2 text-sm" onClick={() => remove.mutate(u.id)}>
                  {t('friends.cancel')}
                </button>
              </PlayerRow>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
