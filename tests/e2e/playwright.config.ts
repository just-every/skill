import { defineConfig } from '@playwright/test';
import path from 'node:path';

const LOCAL_STATIC_BASE = 'http://127.0.0.1:4173';
const serverScript = path.resolve(__dirname, 'serve-dist.mjs');
const serverCommand = `node ${JSON.stringify(serverScript)}`;

if (!process.env.E2E_BASE_URL) {
  process.env.E2E_BASE_URL = LOCAL_STATIC_BASE;
}

const resolveBaseUrl = () => {
  const raw = process.env.E2E_BASE_URL;
  if (raw) {
    try {
      return new URL(raw).toString();
    } catch {
      const trimmed = raw.replace(/^https?:\/\//, '');
      return `https://${trimmed}`;
    }
  }
  return LOCAL_STATIC_BASE;
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
  webServer: {
    command: serverCommand,
    url: LOCAL_STATIC_BASE,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  },
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
