import type { MapSummary } from '@tg/shared';
import { useQuery } from '@tanstack/react-query';
import type { ComponentType, ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DistrictGlyph, glyphColor, mapTheme } from '../components/art/DistrictGlyph.tsx';
import { HeroScene, LanternString } from '../components/art/HeroScene.tsx';
import { TaipeiDome, Taipei101 } from '../components/art/Landmarks.tsx';
import { Baseball, BubbleTea, Lantern, type ArtProps } from '../components/art/Stickers.tsx';
import { NightMarketStall, Scooter } from '../components/art/Street.tsx';
import { mapName } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { hasServer } from '../lib/env.ts';

interface Mode {
  key: string;
  to: string;
  Art: ComponentType<ArtProps>;
  /** Card background and hover ring, spelled out so Tailwind can see the class names. */
  tint: string;
}

const ALL_MODES: Mode[] = [
  { key: 'classic', to: '/maps/taipei', Art: Taipei101, tint: 'from-accent/45 via-accent-2/10 hover:ring-accent' },
  { key: 'daily', to: '/daily', Art: BubbleTea, tint: 'from-sky-500/35 via-indigo-500/10 hover:ring-sky-400' },
  { key: 'streak', to: '/streak', Art: Baseball, tint: 'from-rose-500/35 via-orange-400/10 hover:ring-rose-400' },
  { key: 'explorer', to: '/explorer', Art: Scooter, tint: 'from-emerald-500/35 via-teal-400/10 hover:ring-emerald-400' },
  { key: 'duels', to: '/multiplayer', Art: TaipeiDome, tint: 'from-fuchsia-500/35 via-purple-500/10 hover:ring-fuchsia-400' },
  { key: 'battleRoyale', to: '/multiplayer', Art: Lantern, tint: 'from-amber-500/35 via-red-500/10 hover:ring-amber-400' },
  { key: 'mapMaker', to: '/maps', Art: NightMarketStall, tint: 'from-pink-500/35 via-rose-400/10 hover:ring-pink-400' },
];

/** Duels and Battle Royale need the realtime server. */
export const MODES: Mode[] = ALL_MODES.filter((m) => hasServer || !('duels battleRoyale'.includes(m.key)));

export function MapCard({ map }: { map: MapSummary }) {
  const { t } = useTranslation();
  const { color, glyph } = mapTheme(map);
  return (
    <Link
      to={`/maps/${map.slug}`}
      className="card group relative overflow-hidden p-4 pr-24 transition duration-300 hover:-translate-y-1 hover:ring-2 hover:ring-(--c)"
      style={{ backgroundImage: `linear-gradient(120deg, ${color}33, transparent 60%)`, ['--c' as string]: color }}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      {glyph && (
        <span
          className="absolute right-4 top-1/2 grid size-16 -translate-y-1/2 place-items-center rounded-2xl"
          style={{ background: `${color}26`, color: glyphColor(color) }}
        >
          <DistrictGlyph code={glyph} className="size-11 group-hover:animate-wiggle" />
        </span>
      )}
      <p className="font-display text-lg font-black">{mapName(map)}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{map.description}</p>
      <p className="mt-3 text-xs text-muted">{t('home.locations', { count: map.locationCount.toLocaleString() as never })}</p>
    </Link>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-black">
      <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-accent-2 to-accent" />
      {children}
    </h2>
  );
}

function Hero({ locations }: { locations: number | undefined }) {
  const { t } = useTranslation();
  return (
    <section className="hero-sky relative isolate overflow-hidden rounded-3xl ring-1 ring-white/10">
      <LanternString count={9} className="hidden sm:block" />
      <LanternString count={5} className="sm:hidden" />
      <HeroScene className="absolute inset-x-0 bottom-0 -z-10 h-56 w-full lg:h-full" />
      <div className="max-w-lg px-6 pb-52 pt-20 sm:px-10 lg:pb-14 lg:pt-24">
        {locations ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85 ring-1 ring-white/15 backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-good" />
            {t('home.heroChip', { count: locations.toLocaleString() as never })}
          </span>
        ) : (
          <span className="block h-6" />
        )}
        <h1 className="mt-3 font-display text-4xl font-black leading-tight sm:text-5xl">
          <Trans i18nKey="home.heroTitle" components={{ hl: <span className="text-gradient-taipei" /> }} />
        </h1>
        <p className="mt-3 max-w-md text-white/75 sm:text-lg">{t('home.heroBody')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/maps/taipei" className="btn-primary px-8 py-4 text-lg">
            {t('home.playNow')}
          </Link>
          <Link to="/daily" className="btn-secondary bg-white/10 py-4 pl-3 text-lg ring-white/15 backdrop-blur hover:bg-white/20">
            <BubbleTea className="h-8 w-6" />
            {t('home.daily')}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const { data: maps } = useQuery({ queryKey: ['maps', 'official'], queryFn: api.officialMaps, staleTime: 5 * 60_000 });
  const small = MODES.length - 1;

  return (
    <div className="space-y-10">
      <Hero locations={maps?.find((m) => m.slug === 'taipei')?.locationCount} />

      <section>
        <SectionTitle>{t('home.modes')}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MODES.map((m, i) => {
            const featured = i === 0;
            // Beside the 2×2 featured card, an odd pair of small cards would leave holes, so stretch the last two.
            const wide = !featured && small % 4 === 2 && i > small - 2;
            return (
              <Link
                key={m.key}
                to={m.to}
                className={`card group relative flex overflow-hidden bg-gradient-to-br to-panel transition duration-300 hover:-translate-y-1 hover:ring-2 ${m.tint} ${
                  featured ? 'col-span-2 min-h-48 p-5 sm:p-7 lg:row-span-2' : 'min-h-44 p-4 sm:min-h-40'
                } ${wide ? 'lg:col-span-2' : ''}`}
              >
                <span
                  className={`pointer-events-none absolute transition duration-300 group-hover:animate-wiggle ${
                    featured ? 'bottom-0 right-6 h-[92%] sm:right-12' : 'right-3 top-3 size-16 sm:size-20'
                  }`}
                >
                  <m.Art className={featured ? 'h-full w-auto' : 'size-full'} />
                </span>
                <span className={`relative mt-auto block ${featured ? 'max-w-[62%]' : 'pr-2'}`}>
                  <span className={`block font-display font-black ${featured ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{t(`home.${m.key}`)}</span>
                  <span className={`mt-1 block leading-snug text-white/70 ${featured ? 'sm:text-base' : 'text-xs'}`}>{t(`home.${m.key}Desc`)}</span>
                  {featured && <span className="btn-primary pointer-events-none mt-4 px-5 py-2.5 text-sm">{t('mapPage.play')} →</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle>{t('home.officialMaps')}</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {maps?.map((m) => <MapCard key={m.id} map={m} />) ??
            Array.from({ length: 6 }, (_, i) => <div key={i} className="card h-28 animate-pulse" />)}
        </div>
      </section>
    </div>
  );
}
