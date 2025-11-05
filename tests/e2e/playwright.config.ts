import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? process.env.PROJECT_DOMAIN ?? 'https://demo.justevery.com';

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
