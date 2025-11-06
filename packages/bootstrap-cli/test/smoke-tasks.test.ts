import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadEnvMock = vi.fn();
const runSmokeMock = vi.fn();

vi.mock('../src/env.js', () => ({
  loadBootstrapEnvironment: (...args: unknown[]) => loadEnvMock(...args),
  BootstrapEnvError: class BootstrapEnvError extends Error {}
}));

vi.mock('../src/smoke/index.js', () => ({
  runSmoke: (...args: unknown[]) => runSmokeMock(...args)
}));

import { createSmokeTasks } from '../src/tasks.js';

const makeReport = (overrides: Partial<import('../src/smoke/index.js').SmokeCommandResult['checks']> = {}) => ({
  generatedAt: '2025-01-01T00:00:00.000Z',
  baseUrl: 'https://example.com',
  projectId: 'demo-project',
  mode: 'full' as const,
  checks: [],
  d1: { ok: true, skipped: false, message: 'ok', database: 'demo_db' },
  workerSecrets: { ok: true, skipped: false, message: 'ok', names: ['STRIPE_WEBHOOK_SECRET'] },
  runDir: '/tmp/smoke',
  reportPath: '/tmp/smoke/report.json',
  ok: true,
  ...overrides
});

beforeEach(() => {
  loadEnvMock.mockReset();
  runSmokeMock.mockReset();
  loadEnvMock.mockReturnValue({
    env: {
      PROJECT_DOMAIN: 'https://example.com/app',
      PROJECT_ID: 'demo-project',
      LOGTO_TOKEN: 'secret-token',
      D1_DATABASE_NAME: 'demo_db',
      CLOUDFLARE_R2_BUCKET: 'demo-bucket',
      LOGTO_ENDPOINT: 'https://auth.example.com',
      LOGTO_APPLICATION_ID: 'logto-app'
    },
    report: { summary: 'env ok' }
  });
  runSmokeMock.mockResolvedValue({ checks: makeReport(), screens: undefined });
});

describe('createSmokeTasks', () => {
  it('normalises base URL and defaults to headless true', async () => {
    const tasks = createSmokeTasks({ cwd: '/repo' });
    await tasks.run();

    expect(loadEnvMock).toHaveBeenCalled();
    expect(runSmokeMock).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      routes: undefined,
      bearerToken: 'secret-token',
      outputRoot: undefined,
      stamp: undefined,
      mode: 'full',
      skipWrangler: undefined,
      attempts: undefined,
      delayMs: undefined,
      headless: true,
      projectId: 'demo-project',
      d1Name: 'demo_db',
      r2Bucket: 'demo-bucket',
      logtoEndpoint: 'https://auth.example.com',
      logtoApplicationId: 'logto-app'
    });
  });

  it('passes explicit flags through including non-headless mode', async () => {
    const tasks = createSmokeTasks({
      cwd: '/repo',
      base: 'https://alt.example.com/path',
      routes: ['/one', 'two'],
      mode: 'minimal',
      token: 'override-token',
      outputDir: 'out',
      stamp: 'stamp',
      skipWrangler: true,
      attempts: 5,
      delayMs: 250,
      headless: false,
      projectId: 'override-project',
      d1Name: 'override-db',
      r2Bucket: 'override-bucket'
    });

    await tasks.run();

    expect(runSmokeMock).toHaveBeenLastCalledWith({
      baseUrl: 'https://alt.example.com',
      routes: ['/one', 'two'],
      bearerToken: 'override-token',
      outputRoot: 'out',
      stamp: 'stamp',
      mode: 'minimal',
      skipWrangler: true,
      attempts: 5,
      delayMs: 250,
      headless: false,
      projectId: 'override-project',
      d1Name: 'override-db',
      r2Bucket: 'override-bucket',
      logtoEndpoint: 'https://auth.example.com',
      logtoApplicationId: 'logto-app'
    });
  });

  it('fails the task when smoke checks report failures', async () => {
    runSmokeMock.mockResolvedValueOnce({ checks: makeReport({ ok: false }), screens: undefined });

    const tasks = createSmokeTasks({ cwd: '/repo' });

    await expect(tasks.run()).rejects.toThrowError('Smoke checks failed');
  });
});
