import type { MapSummary } from '@tg/shared';
import { DISTRICT_BY_CODE } from '@tg/shared';
import { useQuery } from '@tanstack/react-query';
import type { ComponentType, SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { IconCalendar, IconCompass, IconEdit, IconFire, IconMap, IconSwords, IconUsers } from '../components/icons.tsx';
import { mapName } from '../i18n/index.ts';
import { api } from '../lib/api.ts';

interface Mode {
  key: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
  ready: boolean;
}

/** Modes are flipped to `ready` as their milestone lands. */
export const MODES: Mode[] = [
  { key: 'classic', to: '/maps/taipei', icon: IconMap, color: 'from-accent to-accent-2', ready: true },
  { key: 'daily', to: '/daily', icon: IconCalendar, color: 'from-sky-500 to-indigo-500', ready: true },
  { key: 'streak', to: '/streak', icon: IconFire, color: 'from-rose-500 to-orange-400', ready: true },
  { key: 'explorer', to: '/explorer', icon: IconCompass, color: 'from-emerald-500 to-teal-400', ready: true },
  { key: 'duels', to: '/multiplayer', icon: IconSwords, color: 'from-fuchsia-500 to-purple-500', ready: true },
  { key: 'battleRoyale', to: '/multiplayer', icon: IconUsers, color: 'from-amber-500 to-red-500', ready: true },
  { key: 'mapMaker', to: '/maps', icon: IconEdit, color: 'from-slate-500 to-slate-400', ready: true },
];

export function MapCard({ map }: { map: MapSummary }) {
  const { t } = useTranslation();
  const color = map.districtCode ? DISTRICT_BY_CODE.get(map.districtCode)?.color : '#ff5a36';
  return (
    <Link
      to={`/maps/${map.slug}`}
      className="card group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:ring-accent/60"
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <p className="text-lg font-black">{mapName(map)}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{map.description}</p>
      <p className="mt-3 text-xs text-muted">{t('home.locations', { count: map.locationCount.toLocaleString() as never })}</p>
    </Link>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const { data: maps } = useQuery({ queryKey: ['maps', 'official'], queryFn: api.officialMaps, staleTime: 5 * 60_000 });

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-panel-2 via-panel to-ink p-6 ring-1 ring-line sm:p-10">
        <div className="absolute -right-16 -top-16 size-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-24 right-24 size-72 rounded-full bg-teal/10 blur-3xl" />
        <div className="relative max-w-xl">
          <h1 className="text-3xl font-black leading-tight sm:text-5xl">{t('home.heroTitle')}</h1>
          <p className="mt-3 text-muted sm:text-lg">{t('home.heroBody')}</p>
          <Link to="/maps/taipei" className="btn-primary mt-6 px-8 py-4 text-lg">
            {t('home.playNow')}
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-black">{t('home.modes')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {MODES.map((m) => {
            const body = (
              <>
                <span className={`mb-3 grid size-11 place-items-center rounded-xl bg-gradient-to-br ${m.color} text-white shadow-lg`}>
                  <m.icon />
                </span>
                <span className="block font-bold">{t(`home.${m.key}`)}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{t(`home.${m.key}Desc`)}</span>
                {!m.ready && <span className="chip absolute right-3 top-3 text-[10px] text-muted">{t('home.comingSoon')}</span>}
              </>
            );
            return m.ready ? (
              <Link key={m.key} to={m.to} className="card relative p-4 transition hover:-translate-y-0.5 hover:ring-accent/60">
                {body}
              </Link>
            ) : (
              <div key={m.key} className="card relative p-4 opacity-60">
                {body}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-black">{t('home.officialMaps')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {maps?.map((m) => <MapCard key={m.id} map={m} />) ??
            Array.from({ length: 6 }, (_, i) => <div key={i} className="card h-28 animate-pulse" />)}
        </div>
      </section>
    </div>
  );
}
