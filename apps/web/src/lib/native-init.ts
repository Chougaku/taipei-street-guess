/** Native-app (Capacitor) wiring: status bar, splash screen, Android back button, deep links. */
import { isNative } from './env.ts';

export async function initNative() {
  if (!isNative) return;
  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);

  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  await SplashScreen.hide().catch(() => {});

  // Android hardware back: navigate back in the SPA, exit the app from the home screen.
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.pathname !== '/') window.history.back();
    else void App.exitApp();
  });

  // Deep links (taipeiguessr://… or https://<domain>/…) open the matching route.
  await App.addListener('appUrlOpen', ({ url }) => {
    if (url.startsWith('taipeiguessr://auth-callback')) {
      void import('./account.ts')
        .then((m) => m.completeNativeOAuth(url))
        .then(() => window.dispatchEvent(new CustomEvent('tg:auth-changed')));
      return;
    }
    try {
      const u = new URL(url);
      const path = u.protocol.startsWith('http') ? u.pathname + u.search : `/${u.host}${u.pathname}${u.search}`;
      window.dispatchEvent(new CustomEvent('tg:deeplink', { detail: path }));
    } catch {
      /* ignore malformed urls */
    }
  });
}
