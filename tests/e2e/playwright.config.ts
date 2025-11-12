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

const sharedUse = {
  baseURL,
  trace: 'retain-on-failure',
  ignoreHTTPSErrors: true,
};

export default defineConfig({
  testDir: './',
  timeout: 30_000,
  reporter: [['list']],
  retries: 0,
  use: sharedUse,
  projects: [
    {
      name: 'chromium-dpr1-light',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        colorScheme: 'light',
      },
    },
    {
      name: 'chromium-dpr1-dark',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        colorScheme: 'dark',
      },
    },
    {
      name: 'chromium-dpr2-light',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
      },
    },
    {
      name: 'chromium-dpr2-dark',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      },
    },
    {
      name: 'firefox-dpr2-light',
      use: {
        browserName: 'firefox',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
      },
    },
    {
      name: 'webkit-dpr2-light',
      use: {
        browserName: 'webkit',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
      },
    },
  ],
});
