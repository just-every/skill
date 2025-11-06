import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSmoke } from './index.js';
import type { SmokeCheckReport } from './check.js';
import type { SmokeScreensResult } from './screens.js';

// Mock the check and screens modules
vi.mock('./check.js', () => ({
  runSmokeChecks: vi.fn()
}));

vi.mock('./screens.js', () => ({
  captureSmokeScreens: vi.fn()
}));

describe('runSmoke aggregator', () => {
  let mockRunSmokeChecks: any;
  let mockCaptureSmokeScreens: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const checkModule = await import('./check.js');
    const screensModule = await import('./screens.js');
    mockRunSmokeChecks = checkModule.runSmokeChecks as any;
    mockCaptureSmokeScreens = screensModule.captureSmokeScreens as any;

    // Default mock implementations
    mockRunSmokeChecks.mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      baseUrl: 'https://example.com',
      projectId: 'test-project',
      mode: 'full',
      checks: [
        { name: 'page:/', url: 'https://example.com/', expected: '2xx', status: 200, ok: true, attempts: 1 },
        { name: 'page:/login', url: 'https://example.com/login', expected: '2xx-3xx', status: 302, ok: true, attempts: 1 }
      ],
      d1: { ok: true, skipped: false, message: 'Database check passed' },
      workerSecrets: { ok: true, skipped: false, message: 'Secrets verified' },
      runDir: 'test-results/smoke/20250101-000000',
      reportPath: 'test-results/smoke/20250101-000000/report.json',
      ok: true
    } as SmokeCheckReport);

    mockCaptureSmokeScreens.mockResolvedValue({
      runDir: 'test-results/smoke/20250101-000000',
      manifestPath: 'test-results/smoke/20250101-000000/screens-manifest.json',
      screenshots: [
        { route: '/', status: 200, screenshot: 'test-results/smoke/20250101-000000/screens/home.png' },
        { route: '/login', status: 302, screenshot: 'test-results/smoke/20250101-000000/screens/login.png' }
      ]
    } as SmokeScreensResult);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run both checks and screens in full mode', async () => {
    const result = await runSmoke({
      baseUrl: 'https://example.com',
      mode: 'full',
      stamp: '20250101-000000'
    });

    expect(mockRunSmokeChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://example.com',
        mode: 'full',
        stamp: '20250101-000000'
      })
    );

    expect(mockCaptureSmokeScreens).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://example.com',
        stamp: '20250101-000000'
      })
    );

    expect(result.checks.ok).toBe(true);
    expect(result.screens).toBeDefined();
    expect(result.screens?.screenshots).toHaveLength(2);
  });

  it('should skip screens in minimal mode', async () => {
    const result = await runSmoke({
      baseUrl: 'https://example.com',
      mode: 'minimal',
      stamp: '20250101-000000'
    });

    expect(mockRunSmokeChecks).toHaveBeenCalled();
    expect(mockCaptureSmokeScreens).not.toHaveBeenCalled();
    expect(result.screens).toBeUndefined();
  });

  it('should propagate headless option to screens', async () => {
    await runSmoke({
      baseUrl: 'https://example.com',
      mode: 'full',
      headless: false,
      stamp: '20250101-000000'
    });

    expect(mockCaptureSmokeScreens).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: false
      })
    );
  });

  it('should default headless to true when not specified', async () => {
    await runSmoke({
      baseUrl: 'https://example.com',
      mode: 'full',
      stamp: '20250101-000000'
    });

    expect(mockCaptureSmokeScreens).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: undefined
      })
    );
  });

  it('should propagate bearer token to both checks and screens', async () => {
    const token = 'test-bearer-token-123';

    await runSmoke({
      baseUrl: 'https://example.com',
      bearerToken: token,
      mode: 'full',
      stamp: '20250101-000000'
    });

    expect(mockRunSmokeChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        bearerToken: token
      })
    );

    expect(mockCaptureSmokeScreens).toHaveBeenCalledWith(
      expect.objectContaining({
        bearerToken: token
      })
    );
  });

  it('should propagate custom routes to both checks and screens', async () => {
    const customRoutes = ['/custom', '/pages'];

    await runSmoke({
      baseUrl: 'https://example.com',
      routes: customRoutes,
      mode: 'full',
      stamp: '20250101-000000'
    });

    expect(mockRunSmokeChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        routes: customRoutes
      })
    );

    expect(mockCaptureSmokeScreens).toHaveBeenCalledWith(
      expect.objectContaining({
        routes: customRoutes
      })
    );
  });

  it('should derive screen routes from page checks when routes not provided', async () => {
    await runSmoke({
      baseUrl: 'https://example.com',
      mode: 'full',
      stamp: '20250101-000000'
    });

    expect(mockCaptureSmokeScreens).toHaveBeenCalledWith(
      expect.objectContaining({
        routes: ['/', '/login']
      })
    );
  });

  it('should handle check failures gracefully', async () => {
    mockRunSmokeChecks.mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      baseUrl: 'https://example.com',
      projectId: 'test-project',
      mode: 'full',
      checks: [
        { name: 'page:/', url: 'https://example.com/', expected: '2xx', status: 500, ok: false, attempts: 3 }
      ],
      d1: { ok: false, skipped: false, message: 'Database check failed' },
      workerSecrets: { ok: false, skipped: false, message: 'Missing secrets' },
      runDir: 'test-results/smoke/20250101-000000',
      reportPath: 'test-results/smoke/20250101-000000/report.json',
      ok: false
    } as SmokeCheckReport);

    const result = await runSmoke({
      baseUrl: 'https://example.com',
      mode: 'full',
      stamp: '20250101-000000'
    });

    expect(result.checks.ok).toBe(false);
    expect(result.screens).toBeDefined(); // Should still attempt screens
  });

  it('should use the same stamp for both checks and screens', async () => {
    const customStamp = '20241231-235959';

    await runSmoke({
      baseUrl: 'https://example.com',
      mode: 'full',
      stamp: customStamp
    });

    expect(mockRunSmokeChecks).toHaveBeenCalledWith(
      expect.objectContaining({ stamp: customStamp })
    );

    expect(mockCaptureSmokeScreens).toHaveBeenCalledWith(
      expect.objectContaining({ stamp: customStamp })
    );
  });

  it('should propagate outputRoot to both checks and screens', async () => {
    const customOutput = 'custom-output/dir';

    await runSmoke({
      baseUrl: 'https://example.com',
      outputRoot: customOutput,
      mode: 'full',
      stamp: '20250101-000000'
    });

    expect(mockRunSmokeChecks).toHaveBeenCalledWith(
      expect.objectContaining({ outputRoot: customOutput })
    );

    expect(mockCaptureSmokeScreens).toHaveBeenCalledWith(
      expect.objectContaining({ outputRoot: customOutput })
    );
  });

  it('should propagate all check-specific options correctly', async () => {
    await runSmoke({
      baseUrl: 'https://example.com',
      mode: 'full',
      skipWrangler: true,
      attempts: 5,
      delayMs: 1000,
      projectId: 'custom-project',
      d1Name: 'custom-d1',
      r2Bucket: 'custom-r2',
      stamp: '20250101-000000'
    });

    expect(mockRunSmokeChecks).toHaveBeenCalledWith(
      expect.objectContaining({
        skipWrangler: true,
        attempts: 5,
        delayMs: 1000,
        projectId: 'custom-project',
        d1Name: 'custom-d1',
        r2Bucket: 'custom-r2'
      })
    );
  });

  it('should return combined result structure', async () => {
    const result = await runSmoke({
      baseUrl: 'https://example.com',
      mode: 'full',
      stamp: '20250101-000000'
    });

    expect(result).toHaveProperty('checks');
    expect(result).toHaveProperty('screens');
    expect(result.checks).toHaveProperty('ok');
    expect(result.checks).toHaveProperty('checks');
    expect(result.checks).toHaveProperty('d1');
    expect(result.checks).toHaveProperty('workerSecrets');
    expect(result.screens).toHaveProperty('screenshots');
    expect(result.screens).toHaveProperty('manifestPath');
  });

  it('should surface failures from runSmokeChecks', async () => {
    const failingError = new Error('checks failed');
    mockRunSmokeChecks.mockRejectedValueOnce(failingError);

    await expect(
      runSmoke({ baseUrl: 'https://example.com', mode: 'full', stamp: '20250101-000000' })
    ).rejects.toThrow(failingError);
    expect(mockCaptureSmokeScreens).not.toHaveBeenCalled();
  });

  it('should surface failures from captureSmokeScreens', async () => {
    const captureError = new Error('playwright broke');
    mockCaptureSmokeScreens.mockRejectedValueOnce(captureError);

    await expect(
      runSmoke({ baseUrl: 'https://example.com', mode: 'full', stamp: '20250101-000000' })
    ).rejects.toThrow(captureError);
  });
});
