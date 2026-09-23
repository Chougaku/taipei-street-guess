import { DISTRICTS, districtFeatures, MEDAL_THRESHOLDS, MEDALS, TAIPEI_BBOX, type Medal } from '@tg/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { DistrictGlyph, glyphColor } from '../components/art/DistrictGlyph.tsx';
import { Scooter } from '../components/art/Street.tsx';
import { PageBanner } from '../components/PageBanner.tsx';
import { Spinner } from '../components/Status.tsx';
import { toast } from '../components/Toast.tsx';
import { GameMap } from '../game/GameMap.tsx';
import { RegionLayer, type RegionStyle } from '../game/RegionLayer.tsx';
import { api } from '../lib/api.ts';
import { useSettings } from '../stores/settings.ts';

export const MEDAL_ICON: Record<Medal, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎' };
const MEDAL_COLOR: Record<Medal, string> = { bronze: '#b45309', silver: '#94a3b8', gold: '#eab308', platinum: '#67e8f9' };

export default function ExplorerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const settings = useSettings((s) => s.lastGameSettings);
  const { data } = useQuery({ queryKey: ['explorer'], queryFn: api.explorer });
  const progress = useMemo(() => new Map((data ?? []).map((p) => [p.districtCode, p])), [data]);
  const styles = useMemo<Record<string, RegionStyle>>(
    () =>
      Object.fromEntries(
        DISTRICTS.map((d) => {
          const m = progress.get(d.code)?.medal as Medal | null | undefined;
          return [d.code, m ? { fill: MEDAL_COLOR[m], fillOpacity: 0.55, stroke: '#0b1220', strokeWeight: 1 } : { fill: '#0b1220', fillOpacity: 0.15, stroke: '#0b1220', strokeWeight: 1 }];
        }),
      ),
    [progress],
  );

  const play = useMutation({
    mutationFn: (slug: string) => api.createGame({ mapSlug: slug, settings, mode: 'explorer' }),
    onSuccess: (g) => {
      qc.setQueryData(['game', g.id], g);
      navigate(`/game/${g.id}`);
    },
    onError: () => toast(t('errors.generic')),
  });

  const collected = [...progress.values()].filter((p) => p.medal).length;

  return (
    <div className="space-y-4">
      <PageBanner
        title={t('explorer.title')}
        tint="from-emerald-500/30"
        art={
          <span className="animate-bob">
            <Scooter className="w-20 sm:w-32" />
          </span>
        }
      >
        <p className="mt-2 text-muted">{t('explorer.desc')}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="chip text-muted">{t('explorer.thresholds')}</span>
          {MEDALS.map((m) => (
            <span key={m} className="chip">
              {MEDAL_ICON[m]} {t(`explorer.medal.${m}`)} ≥ {MEDAL_THRESHOLDS[m].toLocaleString()}
            </span>
          ))}
        </div>
        <p className="mt-3 font-bold text-accent-2">{t('explorer.progress', { count: collected })}</p>
      </PageBanner>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="card relative h-[420px] overflow-hidden">
          <GameMap id="explorer-map" className="absolute inset-0" bbox={TAIPEI_BBOX} pin={null} interactive={false}>
            <RegionLayer features={districtFeatures} styles={styles} />
          </GameMap>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DISTRICTS.map((d) => {
            const p = progress.get(d.code);
            const medal = p?.medal as Medal | null | undefined;
            return (
              <button
                key={d.code}
                disabled={play.isPending}
                onClick={() => play.mutate(d.slug)}
                className="card relative overflow-hidden p-3 text-left transition hover:-translate-y-0.5 hover:ring-accent/60"
              >
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: d.color }} />
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-display font-black">
                    <DistrictGlyph code={d.code} className="size-6 shrink-0" style={{ color: glyphColor(d.color) }} />
                    {t(`district.${d.code}`)}
                  </span>
                  <span className="text-2xl">{medal ? MEDAL_ICON[medal] : '▫️'}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {p ? `${t('explorer.best', { score: p.bestScore.toLocaleString() })} · ${t('explorer.games', { count: p.games })}` : t('explorer.none')}
                </p>
                {play.isPending && play.variables === d.slug && <Spinner className="absolute right-2 bottom-2 size-4" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
