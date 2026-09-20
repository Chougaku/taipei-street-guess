import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { ChallengeInfo } from '@tg/shared';
import { ChallengeShare } from '../components/ChallengeShare.tsx';
import { GameSettingsForm } from '../components/GameSettingsForm.tsx';
import { LeaderboardList } from '../components/LeaderboardList.tsx';
import { useMe } from '../components/Layout.tsx';
import { ErrorView, Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { mapName } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { hasServer } from '../lib/env.ts';
import { useSettings } from '../stores/settings.ts';

export default function MapPage() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saved = useSettings((s) => s.lastGameSettings);
  const setSettings = useSettings((s) => s.set);
  const [settings, setLocal] = useState(saved);
  const [explorer, setExplorer] = useState(false);
  const { data: map, error, refetch } = useQuery({ queryKey: ['map', slug], queryFn: () => api.mapDetail(slug!) });
  const { data: me } = useMe();
  const like = useMutation({
    mutationFn: () => api.likeMap(map!.id, !map!.likedByMe),
    onSuccess: (r) => qc.setQueryData(['map', slug], { ...map!, likes: r.likes, likedByMe: r.liked }),
  });
  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ['leaderboard', 'map', slug, 'week'],
    queryFn: () => api.leaderboard(`maps/${slug}`, { period: 'week' }),
  });
  const [challenge, setChallenge] = useState<ChallengeInfo | null>(null);
  const createChallenge = useMutation({
    mutationFn: () => api.createChallenge(slug!, settings),
    onSuccess: setChallenge,
    onError: () => toast(t('errors.generic')),
  });

  const start = useMutation({
    mutationFn: () => api.createGame({ mapSlug: slug!, settings, mode: explorer ? 'explorer' : 'classic' }),
    onSuccess: (game) => {
      setSettings({ lastGameSettings: settings });
      qc.setQueryData(['game', game.id], game);
      navigate(`/game/${game.id}`);
    },
    onError: () => toast(t('errors.generic')),
  });

  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;
  if (!map)
    return (
      <div className="grid h-64 place-items-center">
        <Spinner />
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card p-6">
        <p className="text-sm text-muted">{map.kind === 'official' ? t('home.officialMaps') : map.ownerName}</p>
        <h1 className="text-3xl font-black">{mapName(map)}</h1>
        <p className="mt-1 text-muted">{map.description}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className="chip">{t('home.locations', { count: map.locationCount.toLocaleString() as never })}</span>
          <span className="chip">{t('mapPage.mapSize', { km: map.diagonalKm.toFixed(1) })}</span>
          <span className="chip">{t('mapPage.plays', { count: map.plays.toLocaleString() as never })}</span>
        </div>
        {map.kind === 'custom' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={map.likedByMe ? 'btn-primary py-2 text-sm' : 'btn-secondary py-2 text-sm'} disabled={like.isPending} onClick={() => like.mutate()}>
              ♥ {map.likedByMe ? t('maps.liked') : t('maps.like')} · {map.likes}
            </button>
            {me?.id === map.ownerId && (
              <Link to={`/editor/${map.id}`} className="btn-secondary py-2 text-sm">
                {t('maps.edit')}
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="text-lg font-bold">{t('mapPage.settings')}</h2>
        <GameSettingsForm value={settings} onChange={setLocal} />
        {map.kind === 'official' && map.districtCode && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={explorer} onChange={(e) => setExplorer(e.target.checked)} />
            {t('mapPage.explorerMode')}
          </label>
        )}
        <button className="btn-primary w-full py-4 text-lg" disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? <Spinner className="size-5" /> : t('mapPage.play')}
        </button>
        <button className="btn-secondary w-full" disabled={createChallenge.isPending} onClick={() => createChallenge.mutate()}>
          {t('challenge.create')}
        </button>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 px-2 text-lg font-bold">
          {hasServer ? t('mapPage.leaderboard') : t('leaderboard.personal')}{' '}
          {hasServer && <span className="text-sm font-normal text-muted">· {t('leaderboard.period.week')}</span>}
        </h2>
        <LeaderboardList entries={board?.entries.slice(0, 10)} me={board?.me} loading={boardLoading} />
      </div>
      <ChallengeShare challenge={challenge} onClose={() => setChallenge(null)} />
    </div>
  );
}
