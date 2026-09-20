import { divisionForRating } from '@tg/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LeaderboardList } from '../components/LeaderboardList.tsx';
import { mapName } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { hasServer } from '../lib/env.ts';

type Tab = 'daily' | 'map' | 'xp' | 'streak' | 'rating';
type Period = 'day' | 'week' | 'all';

export default function LeaderboardsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(hasServer ? 'daily' : 'map');
  const [map, setMap] = useState('taipei');
  const [period, setPeriod] = useState<Period>('week');
  const [level, setLevel] = useState<'district' | 'village'>('district');
  const [friends, setFriends] = useState(false);
  const { data: maps } = useQuery({ queryKey: ['maps', 'official'], queryFn: api.officialMaps, staleTime: 5 * 60_000 });

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', tab, map, period, level, friends],
    queryFn: async () => {
      switch (tab) {
        case 'daily': {
          const r = await api.dailyResults();
          return { entries: r.entries, me: r.me };
        }
        case 'map':
          return api.leaderboard(`maps/${map}`, { period, friends });
        case 'xp':
          return api.leaderboard('xp', { friends });
        case 'streak':
          return api.leaderboard(`streak/${level}`, { period, friends });
        case 'rating':
          return api.leaderboard('rating', { friends });
      }
    },
  });

  const tabs: Tab[] = hasServer ? ['daily', 'map', 'xp', 'streak', 'rating'] : ['map', 'streak', 'daily'];
  const showPeriod = tab === 'map' || tab === 'streak';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-black">{hasServer ? t('leaderboard.title') : t('leaderboard.personal')}</h1>
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((x) => (
          <button key={x} className={`chip shrink-0 ${tab === x ? 'bg-accent text-white ring-accent' : 'text-muted'}`} onClick={() => setTab(x)}>
            {t(`leaderboard.${x}`)}
          </button>
        ))}
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'map' && (
            <select value={map} onChange={(e) => setMap(e.target.value)} className="rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line">
              {maps?.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {mapName(m)}
                </option>
              ))}
            </select>
          )}
          {tab === 'streak' && (
            <select value={level} onChange={(e) => setLevel(e.target.value as 'district' | 'village')} className="rounded-lg bg-panel-2 px-3 py-2 ring-1 ring-line">
              <option value="district">{t('leaderboard.district')}</option>
              <option value="village">{t('leaderboard.village')}</option>
            </select>
          )}
          {showPeriod &&
            (['day', 'week', 'all'] as const).map((p) => (
              <button key={p} className={`chip ${period === p ? 'bg-panel-2 text-text' : 'text-muted'}`} onClick={() => setPeriod(p)}>
                {t(`leaderboard.period.${p}`)}
              </button>
            ))}
          {hasServer && tab !== 'daily' && (
            <label className="ml-auto flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={friends} onChange={(e) => setFriends(e.target.checked)} />
              {t('leaderboard.friendsOnly')}
            </label>
          )}
        </div>
        <LeaderboardList
          entries={data?.entries}
          me={data?.me}
          loading={isLoading}
          format={(e) =>
            tab === 'xp'
              ? `Lv.${e.user.level}`
              : tab === 'rating'
                ? `${e.score} · ${t(`division.${divisionForRating(e.score)}`)}`
                : e.score.toLocaleString()
          }
        />
      </div>
    </div>
  );
}
