import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const ROOT = resolve(import.meta.dirname, '../..');

export default defineConfig(({ mode }) => ({
  envDir: ROOT,
  plugins: [
    react(),
    tailwindcss(),
    // The Android app ships its own assets, so the service worker is web-only.
    mode !== 'native' &&
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: '台北街景猜猜 TaipeiGuessr',
          short_name: '台北猜猜',
          description: '看街景，猜猜你在臺北的哪裡！',
          lang: 'zh-TW',
          start_url: '/',
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
          navigateFallback: '/index.html',
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
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('taipei-villages')) return 'villages';
        },
      },
    },
  },
}));
