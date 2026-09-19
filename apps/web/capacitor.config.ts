import type { CapacitorConfig } from '@capacitor/cli';

/** Set CAP_DEV=1 when syncing a build that talks to a local http:// dev server. */
const dev = process.env.CAP_DEV === '1';

const config: CapacitorConfig = {
  appId: 'tw.taipeiguessr.app',
  appName: '台北街景猜猜',
  webDir: 'dist',
  android: {
    // The WebView origin is https://localhost; a local http API would otherwise be blocked as mixed content.
    allowMixedContent: dev,
  },
  server: dev ? { cleartext: true } : undefined,
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: false,
      backgroundColor: '#0b1220',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b1220',
      overlaysWebView: true,
    },
  },
};

export default config;
