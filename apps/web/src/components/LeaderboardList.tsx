import type { LeaderboardEntry } from '@tg/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Baseball } from './art/Stickers.tsx';
import { Avatar } from './Avatar.tsx';
import { Spinner } from './Status.tsx';

const MEDAL = ['🥇', '🥈', '🥉'];

export function LeaderboardList({
  entries,
  me,
  loading,
  format = (e) => e.score.toLocaleString(),
  selectedId,
  onSelect,
}: {
  entries: LeaderboardEntry[] | undefined;
  me?: LeaderboardEntry | null;
  loading?: boolean;
  format?: (e: LeaderboardEntry) => ReactNode;
  selectedId?: string | null;
  onSelect?: (e: LeaderboardEntry) => void;
}) {
  const { t } = useTranslation();
  if (loading || !entries)
    return (
      <div className="grid h-40 place-items-center">
        <Spinner />
      </div>
    );
  if (entries.length === 0)
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center text-muted">
        <Baseball className="size-14 animate-bob" />
        <p>{t('leaderboard.empty')}</p>
      </div>
    );

  const row = (e: LeaderboardEntry, highlight = false) => {
    const content = (
      <>
        <span className="w-8 text-center font-black tabular-nums text-muted">{MEDAL[e.rank - 1] ?? e.rank}</span>
        <Avatar id={e.user.avatar} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{e.user.nickname}</span>
          <span className="text-xs text-muted">Lv.{e.user.level}</span>
        </span>
        <span className="font-black tabular-nums">{format(e)}</span>
      </>
    );
    const cls = `flex items-center gap-3 rounded-xl px-3 py-2 ${highlight ? 'bg-accent/15 ring-1 ring-accent/50' : 'hover:bg-panel-2'} ${
      selectedId === e.user.id ? 'ring-2 ring-teal' : ''
    }`;
    return onSelect ? (
      <button key={`${e.rank}-${e.user.id}`} className={`w-full text-left ${cls}`} onClick={() => onSelect(e)}>
        {content}
      </button>
    ) : (
      <Link key={`${e.rank}-${e.user.id}`} to={`/u/${e.user.id}`} className={cls}>
        {content}
      </Link>
    );
  };

  const meVisible = me && entries.some((e) => e.user.id === me.user.id);
  return (
    <div className="space-y-1">
      {entries.map((e) => row(e, me?.user.id === e.user.id))}
      {me && !meVisible && (
        <>
          <div className="py-1 text-center text-muted">⋯</div>
          {row(me, true)}
        </>
      )}
    </div>
  );
}
