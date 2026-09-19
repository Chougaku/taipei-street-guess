import type { GameView } from '@tg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ChallengeResultsView } from '../components/ChallengeResultsView.tsx';
import { useMe } from '../components/Layout.tsx';
import { ErrorView, Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { api } from '../lib/api.ts';
import { useNow } from '../lib/hooks.ts';
import { ChallengeCard } from './ChallengePage.tsx';

/** Time until the next midnight in Taipei (UTC+8). */
function untilTaipeiMidnight(now: number): string {
  const taipei = now + 8 * 3600_000;
  const next = Math.ceil(taipei / 86_400_000) * 86_400_000;
  const s = Math.max(0, Math.floor((next - taipei) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function DailyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const now = useNow(1000);
  const { data: info, error, refetch } = useQuery({ queryKey: ['daily'], queryFn: api.daily });
  const { data: results } = useQuery({ queryKey: ['daily-results', info?.day], queryFn: () => api.dailyResults(info!.day!), enabled: !!info?.day });
  const { data: page } = useQuery({ queryKey: ['user', me?.id], queryFn: () => api.user(me!.id), enabled: !!me });
  const play = useMutation({
    mutationFn: api.playDaily,
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
      <ChallengeCard info={info} title={`${t('daily.title')} · ${info.day}`} onPlay={() => play.mutate()} playing={play.isPending}>
        <p className="mt-3 text-sm text-muted">{t('daily.desc')}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {page && page.stats.dailyStreak > 0 && <span className="font-bold text-accent-2">🔥 {t('daily.streak', { count: page.stats.dailyStreak })}</span>}
          <span className="text-muted">{t('daily.nextIn', { time: untilTaipeiMidnight(now) })}</span>
        </div>
      </ChallengeCard>
      <ChallengeResultsView results={results} bbox={info.map.bbox} meId={me?.id ?? null} />
    </div>
  );
}
