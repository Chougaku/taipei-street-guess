import type { BBox, ChallengeResults } from '@tg/shared';
import { formatDistance } from '@tg/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameMap, type ResultLine } from '../game/GameMap.tsx';
import { useSettings } from '../stores/settings.ts';
import { LeaderboardList } from './LeaderboardList.tsx';

const COLORS = ['#ff5a36', '#3b82f6', '#a855f7', '#eab308', '#ec4899', '#14b8a6', '#f97316', '#22c55e', '#64748b', '#ef4444'];

/** Leaderboard plus a map comparing every player's guesses round by round. */
export function ChallengeResultsView({ results, bbox, meId }: { results: ChallengeResults | undefined; bbox: BBox; meId: string | null }) {
  const { t } = useTranslation();
  const units = useSettings((s) => s.units);
  const [round, setRound] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const revealed = results?.entries.some((e) => e.rounds) ?? false;
  const roundCount = results?.entries.find((e) => e.rounds)?.rounds?.length ?? 5;

  const { lines, extra } = useMemo(() => {
    if (!results || !revealed) return { lines: [] as ResultLine[], extra: [] };
    const focus = results.entries.find((e) => e.user.id === (selected ?? meId)) ?? results.entries[0]!;
    const focusRound = focus.rounds?.find((r) => r.roundNo === round);
    const lines: ResultLine[] = focusRound ? [{ key: round, answer: focusRound.answer, guess: focusRound.guess, color: COLORS[0] }] : [];
    const extra = results.entries
      .filter((e) => e.user.id !== focus.user.id)
      .slice(0, 30)
      .flatMap((e, i) => {
        const r = e.rounds?.find((x) => x.roundNo === round);
        return r?.guess ? [{ key: e.user.id, position: r.guess, color: COLORS[(i + 1) % COLORS.length]!, label: e.user.nickname }] : [];
      });
    return { lines, extra };
  }, [results, revealed, round, selected, meId]);

  const focusEntry = results?.entries.find((e) => e.user.id === (selected ?? meId));
  const focusRound = focusEntry?.rounds?.find((r) => r.roundNo === round);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="card overflow-hidden">
        {revealed ? (
          <>
            <div className="flex gap-1 overflow-x-auto p-2">
              {Array.from({ length: roundCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  className={`chip shrink-0 ${round === n ? 'bg-accent text-white ring-accent' : 'text-muted'}`}
                  onClick={() => setRound(n)}
                >
                  {t('challenge.round', { n })}
                </button>
              ))}
            </div>
            <div className="relative h-[380px]">
              <GameMap id="challenge-results" className="absolute inset-0" bbox={bbox} pin={null} results={lines} extraGuesses={extra} fitPadding={() => 50} />
            </div>
            {focusEntry && focusRound && (
              <p className="p-3 text-sm text-muted">
                <span className="font-bold text-text">{focusEntry.user.nickname}</span> ·{' '}
                {focusRound.distanceM !== null ? formatDistance(focusRound.distanceM, units) : t('game.noGuess')} ·{' '}
                <span className="font-bold text-accent-2">{focusRound.score.toLocaleString()}</span>
              </p>
            )}
          </>
        ) : (
          <div className="grid h-[380px] place-items-center p-6 text-center text-muted">{t('challenge.playToSee')}</div>
        )}
      </div>
      <div className="card p-3">
        <h3 className="mb-2 px-2 font-black">{t('challenge.leaderboard')}</h3>
        <LeaderboardList
          entries={results?.entries}
          me={results?.me}
          loading={!results}
          selectedId={selected ?? meId}
          onSelect={revealed ? (e) => setSelected(e.user.id) : undefined}
        />
      </div>
    </div>
  );
}
