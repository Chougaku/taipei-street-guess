import {
  ACHIEVEMENT_BY_CODE,
  formatDistance,
  MAX_GAME_SCORE,
  type ChallengeInfo,
  type GameView,
  type LatLng,
  type PanoView,
  type RoundResult,
} from '@tg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ChallengeShare } from '../components/ChallengeShare.tsx';
import { ReportButton } from '../components/ReportModal.tsx';
import { ScoreTitle } from '../components/ScoreTitle.tsx';
import { IconClose, IconShare } from '../components/icons.tsx';
import { ErrorView, FullScreenLoader } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import type { ResultLine } from '../game/GameMap.tsx';
import { ScoreBar, ScorePill } from '../game/HudParts.tsx';
import { PlayScreen } from '../game/PlayScreen.tsx';
import { mapName } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { hasServer, shareUrl } from '../lib/env.ts';
import { haptic, share } from '../lib/native.ts';
import { sfx } from '../lib/sound.ts';
import { useSettings } from '../stores/settings.ts';

export default function GameRoute() {
  const { id } = useParams();
  return <GamePage key={id} id={id!} />;
}

function GamePage({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const units = useSettings((s) => s.units);
  const { data: game, error, refetch } = useQuery({
    queryKey: ['game', id],
    queryFn: () => api.game(id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [pin, setPin] = useState<LatLng | null>(null);
  const [view, setView] = useState<'play' | 'summary' | null>(null);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const lastPano = useRef<PanoView | null>(null);

  useEffect(() => {
    if (game && view === null) setView(game.status === 'finished' ? 'summary' : 'play');
  }, [game, view]);

  const setGame = (g: GameView) => qc.setQueryData(['game', id], g);

  const guessM = useMutation({
    mutationFn: ({ roundNo, guess }: { roundNo: number; guess: LatLng | null }) => api.guess(id, { roundNo, guess }),
    onSuccess: (res) => {
      setLastResult(res.result);
      setPin(null);
      setGame(res.game);
      if (res.result.guess) sfx.result(res.result.score);
      haptic(res.result.score >= 4000 ? 'success' : 'light');
      if (res.game.status === 'finished') {
        void qc.invalidateQueries({ queryKey: ['me'] });
        const lang = i18n.language === 'en' ? 'en' : 'zh-TW';
        for (const code of res.game.newAchievements) {
          const a = ACHIEVEMENT_BY_CODE.get(code);
          if (a) toast(`${a.icon} ${t('achievements.unlocked', { name: a.name[lang] })}`, 5000);
        }
      }
    },
    onError: () => {
      toast(t('errors.generic'));
      void refetch();
    },
  });
  const nextM = useMutation({ mutationFn: () => api.nextRound(id), onSuccess: setGame });
  const replaceM = useMutation({
    mutationFn: (roundNo: number) => api.replaceRound(id, roundNo),
    onSuccess: setGame,
    onError: () => toast(t('errors.generic')),
  });
  const againM = useMutation({
    mutationFn: (g: GameView) => api.createGame({ mapSlug: g.map.slug, settings: g.settings, mode: g.mode === 'explorer' ? 'explorer' : 'classic' }),
    onSuccess: (g) => {
      qc.setQueryData(['game', g.id], g);
      navigate(`/game/${g.id}`, { replace: true });
    },
  });

  const [shared, setShared] = useState<ChallengeInfo | null>(null);
  const challengeM = useMutation({
    mutationFn: () => api.challengeFromGame(id),
    onSuccess: (c) => {
      setShared(c);
      void qc.invalidateQueries({ queryKey: ['game', id] });
    },
    onError: () => toast(t('errors.generic')),
  });

  const summaryLines = useMemo<ResultLine[]>(
    () => (game?.rounds ?? []).map((r) => ({ key: r.roundNo, answer: r.answer, guess: r.guess, label: String(r.roundNo) })),
    [game?.rounds],
  );
  const shownResult = game ? (lastResult ?? game.rounds.find((r) => r.roundNo === game.currentRound) ?? null) : null;
  const roundLines = useMemo<ResultLine[]>(
    () => (shownResult ? [{ key: shownResult.roundNo, answer: shownResult.answer, guess: shownResult.guess }] : []),
    [shownResult],
  );

  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;
  if (!game || view === null) return <FullScreenLoader />;

  if (game.current) lastPano.current = game.current.pano;
  const pano = game.current?.pano ?? lastPano.current ?? shownResult?.pano ?? game.rounds.at(-1)?.pano;
  const inSummary = view === 'summary' && game.status === 'finished';
  const phase = game.current && !inSummary ? 'guess' : 'result';

  const onContinue = () => {
    if (game.status === 'finished') {
      sfx.finish();
      setView('summary');
    } else if (!nextM.isPending) {
      setLastResult(null);
      nextM.mutate();
    }
  };

  const hud = (
    <>
      <ScorePill label={t('game.round')} value={`${game.currentRound} / ${game.roundCount}`} />
      <ScorePill label={t('game.score')} value={game.totalScore.toLocaleString()} />
    </>
  );

  const exit = (
    <>
      <button className="icon-btn" aria-label={t('app.close')} onClick={() => navigate('/')}>
        <IconClose />
      </button>
      <span className="hidden rounded-xl bg-ink/70 px-3 py-2 text-sm font-bold shadow-lg ring-1 ring-white/10 backdrop-blur sm:block">
        {mapName(game.map)}
      </span>
    </>
  );

  const roundPanel = shownResult && (
    <div className="card p-4 sm:p-5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-muted">{t('game.roundResult', { n: shownResult.roundNo })}</span>
        <span className="text-2xl font-black tabular-nums text-accent-2">{t('game.points', { score: shownResult.score.toLocaleString() })}</span>
      </div>
      <ScoreBar score={shownResult.score} />
      <p className="mt-3 text-center text-lg font-bold">
        {shownResult.distanceM === null
          ? shownResult.timedOut
            ? t('game.timeUp')
            : t('game.noGuess')
          : shownResult.score === 5000
            ? `${t('game.perfect')} ${t('game.distanceAway', { distance: formatDistance(shownResult.distanceM, units) })}`
            : t('game.distanceAway', { distance: formatDistance(shownResult.distanceM, units) })}
      </p>
      {shownResult.districtCode && (
        <p className="text-center text-sm text-muted">
          {t('game.district')}：{t(`district.${shownResult.districtCode}`)}
        </p>
      )}
      {hasServer && (
        <div className="mt-1 text-center">
          <ReportButton target={{ gameId: game.id, roundNo: shownResult.roundNo }} />
        </div>
      )}
      <button className="btn-primary mt-4 w-full" onClick={onContinue} disabled={nextM.isPending}>
        {game.status === 'finished' ? t('game.viewSummary') : t('game.nextRound')}
      </button>
    </div>
  );

  const summaryPanel = (
    <div className="card max-h-[55dvh] overflow-y-auto p-4 sm:p-5 md:max-h-[calc(100dvh-7rem)]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-black">{t('game.summary')}</h2>
        <span className="text-sm text-muted">{mapName(game.map)}</span>
      </div>
      <div className="my-3 flex items-end justify-between">
        <span className="text-4xl font-black tabular-nums text-accent-2">{game.totalScore.toLocaleString()}</span>
        <span className="text-sm text-muted">/ {MAX_GAME_SCORE.toLocaleString()}</span>
      </div>
      <ScoreBar score={game.totalScore} max={MAX_GAME_SCORE} />
      {game.xpGained ? <p className="mt-2 text-right text-sm font-bold text-teal">{t('game.xpGained', { xp: game.xpGained })}</p> : null}
      <ScoreTitle score={game.totalScore} />
      <ol className="mt-3 divide-y divide-line text-sm">
        {game.rounds.map((r) => (
          <li key={r.roundNo} className="flex items-center justify-between gap-2 py-2">
            <span className="grid size-6 place-items-center rounded-full bg-good text-xs font-bold">{r.roundNo}</span>
            <span className="flex-1 truncate text-muted">
              {r.districtCode ? t(`district.${r.districtCode}`) : ''}
              {r.distanceM !== null ? ` · ${formatDistance(r.distanceM, units)}` : ` · ${t('game.noGuess')}`}
            </span>
            <span className="font-bold tabular-nums">{r.score.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {game.mode === 'challenge' || game.mode === 'daily' ? (
          <button
            className="btn-primary col-span-2"
            onClick={() => navigate(game.mode === 'daily' ? '/daily' : `/c/${game.challengeCode}`)}
          >
            {t('challenge.viewLeaderboard')}
          </button>
        ) : (
          <>
            <button className="btn-primary" disabled={againM.isPending} onClick={() => againM.mutate(game)}>
              {t('game.playAgain')}
            </button>
            <button className="btn-secondary" disabled={challengeM.isPending} onClick={() => challengeM.mutate()}>
              {t('challenge.create')}
            </button>
          </>
        )}
        <button
          className="btn-secondary"
          onClick={async () => {
            const result = await share({
              title: t('app.name'),
              text: t('game.shareText', { map: mapName(game.map), score: game.totalScore.toLocaleString() }),
              url: shareUrl(game.challengeCode ? `/c/${game.challengeCode}` : `/maps/${game.map.slug}`),
            });
            if (result === 'copied') toast(t('app.copied'));
          }}
        >
          <IconShare width={18} height={18} /> {t('game.share')}
        </button>
        <button className="btn-secondary" onClick={() => navigate('/')}>
          {t('game.home')}
        </button>
      </div>
    </div>
  );

  if (!pano) return <FullScreenLoader />;

  return (
    <>
    <PlayScreen
      pano={pano}
      movement={game.settings.movement}
      bbox={game.map.bbox}
      phase={phase}
      deadline={game.current?.deadline ?? null}
      pin={pin}
      onPin={setPin}
      guessing={guessM.isPending}
      onGuess={(p) => {
        if (!game.current || guessM.isPending) return;
        guessM.mutate({ roundNo: game.current.roundNo, guess: p });
      }}
      onPanoFailed={() => {
        if (!game.current || replaceM.isPending) return;
        toast(t('game.panoFailed'));
        replaceM.mutate(game.current.roundNo);
      }}
      onContinue={inSummary ? undefined : onContinue}
      results={inSummary ? summaryLines : roundLines}
      resultPanel={inSummary ? summaryPanel : roundPanel}
      panelSide={inSummary}
      hud={hud}
      topLeft={exit}
    />
    <ChallengeShare challenge={shared} onClose={() => setShared(null)} />
    </>
  );
}
