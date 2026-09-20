import { copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const ROOT = resolve(import.meta.dirname, '../..');

interface PoolEntry {
  panoId: string;
  lat: number;
  lng: number;
  heading: number;
  district: string;
  village: string | null;
}

/**
 * Serverless builds play entirely in the browser, so the location pool is bundled as a
 * compact chunk. Normal builds get `null` instead — answers must stay on the server there.
 */
function locationPoolPlugin(enabled: boolean): Plugin {
  const VIRTUAL = 'virtual:tg-location-pool';
  const RESOLVED = `\0${VIRTUAL}`;
  return {
    name: 'tg-location-pool',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return undefined;
      if (!enabled) return 'export default null;';
      const raw = JSON.parse(readFileSync(resolve(ROOT, 'apps/server/data/locations.json'), 'utf8')) as PoolEntry[];
      const districts = [...new Set(raw.map((r) => r.district))].sort();
      const villages = [...new Set(raw.map((r) => r.village).filter((v): v is string => !!v))].sort();
      const dIndex = new Map(districts.map((d, i) => [d, i]));
      const vIndex = new Map(villages.map((v, i) => [v, i]));
      const l = raw.map((r) => [
        r.panoId,
        Math.round(r.lat * 1e5),
        Math.round(r.lng * 1e5),
        Math.round(r.heading),
        dIndex.get(r.district) ?? 0,
        r.village ? (vIndex.get(r.village) ?? -1) : -1,
      ]);
      return `export default ${JSON.stringify({ d: districts, v: villages, l })};`;
    },
  };
}

/** GitHub Pages serves 404.html for unknown paths, which is how client-side routes keep working. */
function spaFallbackPlugin(outDir: string): Plugin {
  return {
    name: 'tg-spa-fallback',
    apply: 'build',
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
    },
  };
}

export default defineConfig(({ mode }) => {
  // `static` = serverless GitHub Pages build, `native` = Capacitor Android build.
  const isStatic = mode === 'static';
  const base = process.env.VITE_BASE_PATH ?? '/';
  const outDir = resolve(import.meta.dirname, 'dist');

  return {
    envDir: ROOT,
    base,
    define: { 'import.meta.env.VITE_STATIC': JSON.stringify(isStatic ? '1' : '') },
    plugins: [
      react(),
      tailwindcss(),
      locationPoolPlugin(isStatic),
      isStatic && spaFallbackPlugin(outDir),
      // The Android app ships its own assets, so the service worker is web-only.
      mode !== 'native' &&
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
          manifest: {
            id: base,
            name: '台北街景猜猜 TaipeiGuessr',
            short_name: '台北猜猜',
            description: '看街景，猜猜你在臺北的哪裡！',
            lang: 'zh-TW',
            start_url: base,
            scope: base,
            display: 'standalone',
            orientation: 'any',
            background_color: '#0b1220',
            theme_color: '#0b1220',
            icons: [
              { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            // Only the app shell is cached — Google Maps content must not be cached.
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            navigateFallback: `${base}index.html`,
            navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
            maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          },
        }),
    ],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8787',
        '/socket.io': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8787', ws: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: !isStatic,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('taipei-villages')) return 'villages';
            if (id.includes('tg-location-pool')) return 'locations';
          },
        },
      },
    },
  };
});
