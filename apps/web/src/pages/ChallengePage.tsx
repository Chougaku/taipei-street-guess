import type { ChallengeInfo, GameView } from '@tg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar.tsx';
import { ChallengeResultsView } from '../components/ChallengeResultsView.tsx';
import { formatTimeLimit } from '../components/GameSettingsForm.tsx';
import { useMe } from '../components/Layout.tsx';
import { ErrorView, Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { mapName } from '../i18n/index.ts';
import { api } from '../lib/api.ts';

export function ChallengeCard({
  info,
  title,
  onPlay,
  playing,
  children,
}: {
  info: ChallengeInfo;
  title: string;
  onPlay(): void;
  playing: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="card relative overflow-hidden p-6">
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-accent/20 blur-2xl" />
      <div className="relative">
        {info.creator && (
          <div className="mb-3 flex items-center gap-2">
            <Avatar id={info.creator.avatar} size={28} />
            <span className="text-sm text-muted">{t('challenge.invite', { name: info.creator.nickname })}</span>
          </div>
        )}
        <h1 className="text-3xl font-black">{title}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className="chip">{mapName(info.map)}</span>
          <span className="chip">{t(`mapPage.${info.settings.movement}`)}</span>
          <span className="chip">{formatTimeLimit(t, info.settings.timeLimitSec)}</span>
          <span className="chip">{t('challenge.players', { count: info.players })}</span>
        </div>
        {children}
        <div className="mt-5">
          {info.myStatus === 'finished' ? (
            <p className="font-bold text-good">✓ {t('daily.played')}</p>
          ) : (
            <button className="btn-primary w-full py-4 text-lg sm:w-auto sm:px-10" disabled={playing} onClick={onPlay}>
              {playing ? <Spinner className="size-5" /> : info.myStatus === 'playing' ? t('challenge.resume') : t('challenge.play')}
            </button>
          )}
          {info.myStatus === 'finished' && info.myGameId && (
            <button className="btn-secondary mt-3" onClick={() => navigate(`/game/${info.myGameId}`)}>
              {t('game.summary')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChallengePage() {
  const { code } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: info, error, refetch } = useQuery({ queryKey: ['challenge', code], queryFn: () => api.challenge(code!) });
  const { data: results } = useQuery({
    queryKey: ['challenge-results', code],
    queryFn: () => api.challengeResults(code!),
    enabled: !!info,
  });
  const play = useMutation({
    mutationFn: () => api.playChallenge(code!),
    onSuccess: (g: GameView) => {
      qc.setQueryData(['game', g.id], g);
      navigate(`/game/${g.id}`);
    },
    onError: () => toast(t('errors.generic')),
  });

  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;
  if (!info)
    return (
      <div className="grid h-64 place-items-center">
        <Spinner />
      </div>
    );

  return (
    <div className="space-y-4">
      <ChallengeCard
        info={info}
        title={info.kind === 'daily' ? t('daily.title') : info.creator ? t('challenge.title') : t('challenge.anonymous')}
        onPlay={() => play.mutate()}
        playing={play.isPending}
      />
      <ChallengeResultsView results={results} bbox={info.map.bbox} meId={me?.id ?? null} />
    </div>
  );
}
