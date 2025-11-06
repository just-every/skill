import { defineConfig } from '@playwright/test';

const baseURL =
  process.env.E2E_BASE_URL ??
  process.env.PROJECT_DOMAIN ??
  'http://127.0.0.1:8787';

export default defineConfig({
  testDir: './',
  timeout: 30_000,
  reporter: [['list']],
  retries: 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
});
