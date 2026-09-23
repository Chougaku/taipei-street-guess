import type { ChallengeInfo, GameView } from '@tg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Lantern } from '../components/art/Stickers.tsx';
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
  art = (
    <span className="block origin-top animate-swing">
      <Lantern className="h-24 sm:h-32" />
    </span>
  ),
  children,
}: {
  info: ChallengeInfo;
  title: string;
  onPlay(): void;
  playing: boolean;
  /** Illustration on the right; a 猜 lantern (as in lantern riddles) by default. */
  art?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="card relative overflow-hidden bg-gradient-to-br from-accent/25 via-panel to-panel p-6">
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-accent/20 blur-2xl" />
      <div className="pointer-events-none absolute right-4 top-4 sm:right-10 sm:top-6">{art}</div>
      <div className="relative pr-20 sm:pr-36">
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
