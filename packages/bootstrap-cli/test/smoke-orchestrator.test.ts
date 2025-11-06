import { beforeEach, describe, expect, it, vi } from 'vitest';

const runSmokeChecks = vi.hoisted(() => vi.fn());
const captureSmokeScreens = vi.hoisted(() => vi.fn());

vi.mock('../src/smoke/check.js', () => ({
  runSmokeChecks
}));

vi.mock('../src/smoke/screens.js', () => ({
  captureSmokeScreens
}));

import { runSmoke } from '../src/smoke/index.js';

const baseReport = {
  generatedAt: '2025-01-01T00:00:00.000Z',
  baseUrl: 'https://example.com',
  projectId: 'demo-project',
  mode: 'full' as const,
  d1: { ok: true, skipped: false, message: 'ok', database: 'demo_db' },
  workerSecrets: { ok: true, skipped: false, message: 'ok', names: ['STRIPE_WEBHOOK_SECRET'] },
  runDir: '/tmp/smoke',
  reportPath: '/tmp/smoke/report.json'
};

beforeEach(() => {
  runSmokeChecks.mockReset();
  captureSmokeScreens.mockReset();
});

describe('runSmoke orchestrator', () => {
  it('runs HTTP checks then captures screenshots with provided routes', async () => {
    runSmokeChecks.mockResolvedValue({
      ...baseReport,
      checks: [
        {
          name: 'page:/dashboard',
          url: 'https://example.com/dashboard',
          expected: '2xx',
          status: 200,
          ok: true,
          attempts: 1
        }
      ],
      ok: true
    });

    const screensResult = {
      runDir: '/tmp/smoke/screens',
      manifestPath: '/tmp/smoke/screens/manifest.json',
      screenshots: [{ route: '/dashboard', status: 200, screenshot: '/tmp/smoke/screens/dashboard.png' }]
    };
    captureSmokeScreens.mockResolvedValue(screensResult);

    const result = await runSmoke({
      baseUrl: 'https://example.com',
      routes: ['/custom'],
      bearerToken: 'token',
      outputRoot: 'out',
      stamp: 'stamp',
      headless: false,
      mode: 'full'
    });

    expect(runSmokeChecks).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      routes: ['/custom'],
      bearerToken: 'token',
      outputRoot: 'out',
      stamp: 'stamp',
      mode: 'full',
      skipWrangler: undefined,
      attempts: undefined,
      delayMs: undefined,
      projectId: undefined,
      d1Name: undefined,
      r2Bucket: undefined
    });

    expect(captureSmokeScreens).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      routes: ['/custom'],
      bearerToken: 'token',
      outputRoot: 'out',
      stamp: 'stamp',
      headless: false
    });

    expect(result).toEqual({
      checks: {
        ...baseReport,
        checks: [
          {
            name: 'page:/dashboard',
            url: 'https://example.com/dashboard',
            expected: '2xx',
            status: 200,
            ok: true,
            attempts: 1
          }
        ],
        ok: true
      },
      screens: screensResult
    });
  });

  it('derives screenshot routes from check report when none provided', async () => {
    runSmokeChecks.mockResolvedValue({
      ...baseReport,
      checks: [
        {
          name: 'page:/',
          url: 'https://example.com/',
          expected: '2xx',
          status: 200,
          ok: true,
          attempts: 1
        },
        {
          name: 'api:session-unauthenticated',
          url: 'https://example.com/api/session',
          expected: '401',
          status: 401,
          ok: true,
          attempts: 1
        }
      ],
      ok: false
    });

    captureSmokeScreens.mockResolvedValue({
      runDir: '/tmp',
      manifestPath: '/tmp/manifest.json',
      screenshots: []
    });

    const result = await runSmoke({ baseUrl: 'https://example.com', mode: 'full' });

    expect(captureSmokeScreens).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      routes: ['/'],
      bearerToken: undefined,
      outputRoot: undefined,
      stamp: undefined,
      headless: undefined
    });

    expect(result.checks.ok).toBe(false);
  });

  it('skips screenshots when mode is minimal', async () => {
    runSmokeChecks.mockResolvedValue({
      ...baseReport,
      mode: 'minimal' as const,
      checks: [],
      ok: true
    });

    const result = await runSmoke({ baseUrl: 'https://example.com', mode: 'minimal' });

    expect(captureSmokeScreens).not.toHaveBeenCalled();
    expect(result.screens).toBeUndefined();
  });

  it('propagates failures from smoke checks', async () => {
    const error = new Error('network down');
    runSmokeChecks.mockRejectedValueOnce(error);

    await expect(() => runSmoke({ baseUrl: 'https://example.com' })).rejects.toThrow(error);
    expect(captureSmokeScreens).not.toHaveBeenCalled();
  });

  it('propagates failures from screenshot capture', async () => {
    runSmokeChecks.mockResolvedValue({
      ...baseReport,
      checks: [
        {
          name: 'page:/',
          url: 'https://example.com/',
          expected: '2xx',
          status: 200,
          ok: true,
          attempts: 1
        }
      ],
      ok: true
    });

    const captureError = new Error('playwright failed');
    captureSmokeScreens.mockRejectedValueOnce(captureError);

    await expect(() => runSmoke({ baseUrl: 'https://example.com' })).rejects.toThrow(captureError);
  });
});
