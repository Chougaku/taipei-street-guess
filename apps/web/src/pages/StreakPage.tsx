import { TAIPEI_BBOX, type GameSettings, type LatLng, type PanoView, type StreakLevel, type StreakView } from '@tg/shared';
import { ACHIEVEMENT_BY_CODE } from '@tg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { GameSettingsForm } from '../components/GameSettingsForm.tsx';
import { ReportButton } from '../components/ReportModal.tsx';
import { IconClose } from '../components/icons.tsx';
import { ErrorView, FullScreenLoader, Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import type { ResultLine } from '../game/GameMap.tsx';
import { ScorePill } from '../game/HudParts.tsx';
import { PlayScreen } from '../game/PlayScreen.tsx';
import { RegionLayer, type RegionStyle } from '../game/RegionLayer.tsx';
import { loadVillages, useRegions } from '../game/regions.ts';
import { api } from '../lib/api.ts';
import { hasServer } from '../lib/env.ts';
import { haptic } from '../lib/native.ts';
import { sfx } from '../lib/sound.ts';
import { useSettings } from '../stores/settings.ts';

/** /streak — pick a level and settings. */
export function StreakSetup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saved = useSettings((s) => s.lastGameSettings);
  const [settings, setSettings] = useState<GameSettings>(saved);
  const [level, setLevel] = useState<StreakLevel>('district');
  const start = useMutation({
    mutationFn: () => api.createStreak(level, settings),
    onSuccess: (run) => {
      qc.setQueryData(['streak', run.id], run);
      navigate(`/streak/${run.id}`);
    },
    onError: () => toast(t('errors.generic')),
  });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card p-6">
        <h1 className="text-3xl font-black">🔥 {t('streak.title')}</h1>
        <p className="mt-2 text-muted">{t('streak.desc')}</p>
      </div>
      <div className="card space-y-5 p-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-muted">{t('streak.level')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['district', 'village'] as const).map((l) => (
              <button
                key={l}
                aria-pressed={level === l}
                onClick={() => {
                  setLevel(l);
                  if (l === 'village') void loadVillages();
                }}
                className={`rounded-xl p-3 text-left ring-1 transition ${level === l ? 'bg-accent/15 ring-accent' : 'bg-panel-2 ring-line hover:ring-muted'}`}
              >
                <span className="block font-bold">{t(`streak.${l}`)}</span>
                <span className="block text-xs text-muted">{t(`streak.${l}Desc`)}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <GameSettingsForm value={settings} onChange={setSettings} />
        <button className="btn-primary w-full py-4 text-lg" disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? <Spinner className="size-5" /> : t('streak.start')}
        </button>
      </div>
    </div>
  );
}

const GREEN: RegionStyle = { fill: '#22c55e', fillOpacity: 0.35, stroke: '#16a34a', strokeWeight: 3 };
const RED: RegionStyle = { fill: '#ef4444', fillOpacity: 0.3, stroke: '#dc2626', strokeWeight: 2 };
const PICK: RegionStyle = { fill: '#ff5a36', fillOpacity: 0.3, stroke: '#ff5a36', strokeWeight: 3 };

/** /streak/:id */
export default function StreakRoute() {
  const { id } = useParams();
  return <StreakPlay key={id} id={id!} />;
}

function StreakPlay({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: run, error, refetch } = useQuery({ queryKey: ['streak', id], queryFn: () => api.streak(id), staleTime: Infinity });
  const regions = useRegions(run?.level ?? 'district');
  const [pin, setPin] = useState<LatLng | null>(null);
  const lastPano = useRef<PanoView | null>(null);
  const setRun = (r: StreakView) => qc.setQueryData(['streak', id], r);

  const guess = useMutation({
    mutationFn: (p: LatLng | null) =>
      api.streakGuess(id, { roundNo: run!.roundNo, region: p && regions ? regions.find(p) : null, guess: p }),
    onSuccess: (r) => {
      setPin(null);
      setRun(r);
      const last = r.history.at(-1);
      if (last?.correct) {
        sfx.correct();
        haptic('success');
      } else {
        sfx.wrong();
        haptic('error');
        void qc.invalidateQueries({ queryKey: ['me'] });
        const lang = i18n.language === 'en' ? 'en' : 'zh-TW';
        for (const code of r.newAchievements) {
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
  const next = useMutation({ mutationFn: () => api.streakNext(id), onSuccess: setRun });
  const replace = useMutation({ mutationFn: () => api.streakReplace(id), onSuccess: setRun });
  const again = useMutation({
    mutationFn: () => api.createStreak(run!.level, run!.settings),
    onSuccess: (r) => {
      qc.setQueryData(['streak', r.id], r);
      navigate(`/streak/${r.id}`, { replace: true });
    },
  });

  const last = run?.history.at(-1) ?? null;
  const pickedRegion = pin && regions ? regions.find(pin) : null;
  const inResult = !!run && !run.current;
  const lines = useMemo<ResultLine[]>(() => (last ? [{ key: last.roundNo, answer: last.answer, guess: last.guess }] : []), [last]);
  const styles = useMemo<Record<string, RegionStyle>>(() => {
    if (inResult && last) {
      return {
        ...(last.guessRegion && !last.correct ? { [last.guessRegion]: RED } : {}),
        [last.answerRegion]: GREEN,
      };
    }
    return pickedRegion ? { [pickedRegion]: PICK } : {};
  }, [inResult, last, pickedRegion]);

  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;
  if (!run || !regions) return <FullScreenLoader />;

  if (run.current) lastPano.current = run.current.pano;
  const pano = run.current?.pano ?? lastPano.current ?? last?.pano;
  if (!pano) return <FullScreenLoader />;

  const finished = run.status === 'finished';
  const hud = (
    <>
      <ScorePill label={t('streak.current')} value={`🔥 ${run.streak}`} />
      <ScorePill label={t('streak.best')} value={String(Math.max(run.best, run.streak))} />
    </>
  );

  const panel = last && (
    <div className="card p-4 sm:p-5">
      <p className={`text-2xl font-black ${last.correct ? 'text-good' : 'text-bad'}`}>{last.correct ? t('streak.correct') : t('streak.wrong')}</p>
      <p className="mt-1 font-semibold">{t('streak.answerWas', { name: regions.name(last.answerRegion) })}</p>
      {!last.correct && last.guessRegion && <p className="text-sm text-muted">{t('streak.youPicked', { name: regions.name(last.guessRegion) })}</p>}
      {!last.correct && last.timedOut && <p className="text-sm text-muted">{t('game.timeUp')}</p>}
      {hasServer && <ReportButton target={{ panoId: last.pano.panoId }} className="mt-1" />}
      {finished ? (
        <>
          <p className="mt-3 text-lg font-black text-accent-2">
            {t('streak.final', { count: run.streak })}
            {run.streak > 0 && run.streak >= run.best && <span className="ml-2 text-sm text-teal">{t('streak.newBest')}</span>}
          </p>
          {run.xpGained ? <p className="text-sm font-bold text-teal">{t('game.xpGained', { xp: run.xpGained })}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn-primary" disabled={again.isPending} onClick={() => again.mutate()}>
              {t('streak.again')}
            </button>
            <button className="btn-secondary" onClick={() => navigate('/')}>
              {t('game.home')}
            </button>
          </div>
        </>
      ) : (
        <button className="btn-primary mt-4 w-full" disabled={next.isPending} onClick={() => next.mutate()}>
          {t('game.nextRound')}
        </button>
      )}
    </div>
  );

  return (
    <PlayScreen
      mapId="streak-map"
      pano={pano}
      movement={run.settings.movement}
      bbox={TAIPEI_BBOX}
      phase={inResult ? 'result' : 'guess'}
      deadline={run.current?.deadline ?? null}
      pin={pin}
      onPin={setPin}
      canGuess={pickedRegion !== null}
      guessLabel={pickedRegion ? t('streak.guessRegion', { name: regions.name(pickedRegion) }) : t('streak.pickRegion')}
      guessing={guess.isPending}
      onGuess={(p) => !guess.isPending && run.current && guess.mutate(p)}
      onPanoFailed={() => !replace.isPending && replace.mutate()}
      onContinue={finished ? undefined : () => !next.isPending && next.mutate()}
      results={lines}
      resultPanel={panel}
      hud={hud}
      topLeft={
        <button className="icon-btn" aria-label={t('app.close')} onClick={() => navigate('/')}>
          <IconClose />
        </button>
      }
      mapChildren={<RegionLayer features={regions.features} styles={styles} baseOpacity={run.level === 'village' ? 0.25 : 0.5} />}
    />
  );
}
