import { levelProgress } from '@tg/shared';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import { api } from '../lib/api.ts';
import { env, hasServer } from '../lib/env.ts';
import { SkylineSilhouette } from './art/Skyline.tsx';
import { BubbleTea } from './art/Stickers.tsx';
import { Avatar } from './Avatar.tsx';
import { IconHome, IconMap, IconSettings, IconSwords, IconTrophy } from './icons.tsx';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000 });
}

export function Logo({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link to="/" className={`group flex items-center gap-2 font-display font-black tracking-tight ${className}`}>
      <img src={`${env.basePath}favicon.svg`} alt="" className="size-8 group-hover:animate-wiggle" />
      <span className="text-lg">{t('app.name')}</span>
    </Link>
  );
}

const ALL_NAV = [
  { to: '/', key: 'home', icon: IconHome, end: true },
  { to: '/multiplayer', key: 'multiplayer', icon: IconSwords },
  { to: '/maps', key: 'maps', icon: IconMap },
  { to: '/leaderboards', key: 'leaderboards', icon: IconTrophy },
  { to: '/settings', key: 'settings', icon: IconSettings },
] as const;

const NAV = ALL_NAV.filter((n) => hasServer || n.to !== '/multiplayer');

function ProfileChip() {
  const { data: me } = useMe();
  if (!me) return <div className="h-10 w-28 animate-pulse rounded-full bg-panel-2" />;
  const lp = levelProgress(me.xp);
  return (
    <Link to={`/u/${me.id}`} className="flex items-center gap-2 rounded-full bg-panel-2 py-1 pl-1 pr-3 ring-1 ring-line hover:bg-line">
      <Avatar id={me.avatar} size={32} />
      <span className="flex flex-col leading-tight">
        <span className="max-w-[9rem] truncate text-sm font-bold">{me.nickname}</span>
        <span className="text-[11px] text-muted">Lv.{lp.level}</span>
      </span>
    </Link>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-12 text-panel-2">
      <SkylineSilhouette className="block h-16 w-full sm:h-20" />
      <div className="bg-panel-2 pb-24 pt-3 text-center text-xs text-muted md:pb-6">
        <p className="flex items-center justify-center gap-1">
          <Trans i18nKey="app.madeWith" components={{ boba: <BubbleTea className="inline h-5 w-3.5" /> }} />
        </p>
        <p className="mt-1 opacity-70">{t('app.mapsCredit')}</p>
      </div>
    </footer>
  );
}

export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 bg-ink/85 backdrop-blur safe-top safe-x">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={'end' in n}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 font-display text-sm font-bold transition ${
                    isActive ? 'bg-gradient-to-r from-accent to-accent-2 text-white shadow-md shadow-accent/30' : 'text-muted hover:bg-white/5 hover:text-text'
                  }`
                }
              >
                {t(`nav.${n.key}`)}
              </NavLink>
            ))}
          </nav>
          <ProfileChip />
        </div>
        {/* Night-market neon strip */}
        <div className="h-0.5 bg-[linear-gradient(90deg,transparent,#ff5a36_15%,#ffb020_38%,#14b8a6_62%,#ff4d8d_85%,transparent)] opacity-70" />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4">
        <Outlet />
      </main>

      <Footer />

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line/60 bg-ink/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'var(--sab)', gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}
      >
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={'end' in n}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold ${isActive ? 'text-accent' : 'text-muted'}`}
          >
            {({ isActive }) => (
              <>
                <span className={`grid h-7 w-12 place-items-center rounded-full transition ${isActive ? 'bg-accent/15' : ''}`}>
                  <n.icon width={22} height={22} />
                </span>
                {t(`nav.${n.key}`)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
