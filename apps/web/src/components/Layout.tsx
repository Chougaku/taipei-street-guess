import { levelProgress } from '@tg/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import { api } from '../lib/api.ts';
import { Avatar } from './Avatar.tsx';
import { IconHome, IconMap, IconSettings, IconSwords, IconTrophy } from './icons.tsx';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000 });
}

export function Logo({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link to="/" className={`flex items-center gap-2 font-black tracking-tight ${className}`}>
      <img src="/favicon.svg" alt="" className="size-8" />
      <span className="text-lg">{t('app.name')}</span>
    </Link>
  );
}

const NAV = [
  { to: '/', key: 'home', icon: IconHome, end: true },
  { to: '/multiplayer', key: 'multiplayer', icon: IconSwords },
  { to: '/maps', key: 'maps', icon: IconMap },
  { to: '/leaderboards', key: 'leaderboards', icon: IconTrophy },
  { to: '/settings', key: 'settings', icon: IconSettings },
] as const;

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

export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/85 backdrop-blur safe-top safe-x">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={'end' in n}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`
                }
              >
                {t(`nav.${n.key}`)}
              </NavLink>
            ))}
          </nav>
          <ProfileChip />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line/60 bg-ink/95 backdrop-blur md:hidden" style={{ paddingBottom: 'var(--sab)' }}>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={'end' in n}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-accent' : 'text-muted'}`}
          >
            <n.icon width={22} height={22} />
            {t(`nav.${n.key}`)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
