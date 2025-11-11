import { defineConfig } from '@playwright/test';

const resolveBaseUrl = () => {
  const raw = process.env.E2E_BASE_URL ?? process.env.PROJECT_DOMAIN;
  if (raw) {
    try {
      return new URL(raw).toString();
    } catch {
      const trimmed = raw.replace(/^https?:\/\//, '');
      return `https://${trimmed}`;
    }
  }
  return 'http://127.0.0.1:8787';
};

const baseURL = resolveBaseUrl();

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
