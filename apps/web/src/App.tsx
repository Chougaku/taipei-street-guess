import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { APIProvider } from '@vis.gl/react-google-maps';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout.tsx';
import { ErrorView, FullScreenLoader } from './components/Status.tsx';
import { InviteToaster } from './components/Realtime.tsx';
import { Toaster } from './components/Toast.tsx';
import { ApiError } from './lib/api.ts';
import { env, hasServer } from './lib/env.ts';
import { connectRealtime } from './lib/realtime.ts';
import Home from './pages/Home.tsx';
import { useSettings } from './stores/settings.ts';

// The Maps JS API can only be loaded once per page, so its language is fixed at startup.
const mapsLanguage = useSettings.getState().language === 'en' ? 'en' : 'zh-TW';

const GamePage = lazy(() => import('./pages/GamePage.tsx'));
const MapPage = lazy(() => import('./pages/MapPage.tsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx'));
const ChallengePage = lazy(() => import('./pages/ChallengePage.tsx'));
const DailyPage = lazy(() => import('./pages/DailyPage.tsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.tsx'));
const FriendsPage = lazy(() => import('./pages/FriendsPage.tsx'));
const LeaderboardsPage = lazy(() => import('./pages/LeaderboardsPage.tsx'));
const AuthCallback = lazy(() => import('./pages/AuthCallback.tsx'));
const StreakSetup = lazy(() => import('./pages/StreakPage.tsx').then((m) => ({ default: m.StreakSetup })));
const StreakPage = lazy(() => import('./pages/StreakPage.tsx'));
const ExplorerPage = lazy(() => import('./pages/ExplorerPage.tsx'));
const MultiplayerPage = lazy(() => import('./pages/MultiplayerPage.tsx'));
const PartyPage = lazy(() => import('./pages/PartyPage.tsx'));
const MatchPage = lazy(() => import('./pages/MatchPage.tsx'));
const MapsPage = lazy(() => import('./pages/MapsPage.tsx'));
const MapEditorPage = lazy(() => import('./pages/MapEditorPage.tsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.tsx'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const page = (el: ReactNode) => <Suspense fallback={<FullScreenLoader />}>{el}</Suspense>;

function NotFound() {
  return <ErrorView error={new ApiError(404, 'not_found', 'Not found')} />;
}

// Routes that need the backend are left out of the serverless (GitHub Pages) build.
const onlineOnlyRoutes = hasServer
  ? [
      { path: '/friends', element: page(<FriendsPage />) },
      { path: '/auth/callback', element: page(<AuthCallback />) },
      { path: '/multiplayer', element: page(<MultiplayerPage />) },
      { path: '/admin', element: page(<AdminPage />) },
      { path: '/party/:code', element: page(<PartyPage />) },
    ]
  : [];

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      errorElement: <ErrorView error={new Error('route')} />,
      children: [
        { path: '/', element: <Home /> },
        { path: '/maps/:slug', element: page(<MapPage />) },
        { path: '/settings', element: page(<SettingsPage />) },
        { path: '/c/:code', element: page(<ChallengePage />) },
        { path: '/daily', element: page(<DailyPage />) },
        { path: '/u/:id', element: page(<ProfilePage />) },
        { path: '/leaderboards', element: page(<LeaderboardsPage />) },
        { path: '/streak', element: page(<StreakSetup />) },
        { path: '/explorer', element: page(<ExplorerPage />) },
        { path: '/maps', element: page(<MapsPage />) },
        ...onlineOnlyRoutes,
        { path: '*', element: <NotFound /> },
      ],
    },
    // Full-screen game routes (no navigation chrome).
    { path: '/game/:id', element: page(<GamePage />) },
    { path: '/streak/:id', element: page(<StreakPage />) },
    { path: '/editor/:id', element: page(<MapEditorPage />) },
    ...(hasServer ? [{ path: '/match/:id', element: page(<MatchPage />) }] : []),
  ],
  // GitHub Pages serves the app from /<repo>/.
  { basename: env.basePath.replace(/\/$/, '') || undefined },
);

export function App() {
  const { t } = useTranslation();
  // Realtime connection for presence, invites and multiplayer (online build only).
  useEffect(() => {
    if (hasServer) void connectRealtime();
  }, []);
  useEffect(() => {
    const onDeepLink = (e: Event) => void router.navigate((e as CustomEvent<string>).detail);
    window.addEventListener('tg:deeplink', onDeepLink);
    return () => window.removeEventListener('tg:deeplink', onDeepLink);
  }, []);
  if (!env.googleMapsKey) return <ErrorView error={new Error(t('errors.mapsKey'))} />;
  return (
    <QueryClientProvider client={queryClient}>
      <APIProvider apiKey={env.googleMapsKey} language={mapsLanguage} region="TW">
        <RouterProvider router={router} />
        <Toaster />
        {hasServer && <InviteToaster />}
      </APIProvider>
    </QueryClientProvider>
  );
}
