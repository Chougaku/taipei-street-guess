import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a throwaway server (its own embedded database) and the
 * Vite dev server with Street View mocked, so no panorama loads are billed.
 * The guess map still uses the real Maps JS API, so VITE_GOOGLE_MAPS_API_KEY must be set.
 */
const API_PORT = 8788;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `npm run dev --workspace @tg/server`,
      env: {
        PORT: String(API_PORT),
        PGLITE_DIR: '.pglite-e2e',
        DEV_JWT_SECRET: 'e2e-secret',
        SUPABASE_URL: '',
      },
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run dev --workspace @tg/web -- --port ${WEB_PORT} --strictPort`,
      env: {
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
        VITE_STREETVIEW_MOCK: '1',
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
      },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
