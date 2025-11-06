import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock functions
const mockPageGoto = vi.fn();
const mockPageScreenshot = vi.fn();
const mockPageClose = vi.fn();
const mockPageWaitForTimeout = vi.fn();
const mockContextNewPage = vi.fn();
const mockContextClose = vi.fn();
const mockBrowserNewContext = vi.fn();
const mockBrowserClose = vi.fn();
const mockChromiumLaunch = vi.fn();

// Mock @playwright/test - must be hoisted
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: mockChromiumLaunch
  }
}));

// Mock node:fs
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    default: {
      mkdirSync: vi.fn()
    },
    promises: {
      writeFile: vi.fn()
    },
    mkdirSync: vi.fn()
  };
});

describe('captureSmokeScreens', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock page
    mockPageGoto.mockResolvedValue({ status: () => 200 });
    mockPageScreenshot.mockResolvedValue(undefined);
    mockPageWaitForTimeout.mockResolvedValue(undefined);
    mockPageClose.mockResolvedValue(undefined);

    // Setup mock context
    mockContextNewPage.mockResolvedValue({
      goto: mockPageGoto,
      screenshot: mockPageScreenshot,
      close: mockPageClose,
      waitForTimeout: mockPageWaitForTimeout
    });
    mockContextClose.mockResolvedValue(undefined);

    // Setup mock browser
    mockBrowserNewContext.mockResolvedValue({
      newPage: mockContextNewPage,
      close: mockContextClose
    });
    mockBrowserClose.mockResolvedValue(undefined);

    // Setup chromium.launch
    mockChromiumLaunch.mockResolvedValue({
      newContext: mockBrowserNewContext,
      close: mockBrowserClose
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should capture screenshots for all routes successfully', async () => {
    const { captureSmokeScreens } = await import('./screens.js');

    const result = await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/', '/login', '/app'],
      stamp: '20250101-000000',
      headless: true
    });

    expect(result.screenshots).toHaveLength(3);
    expect(result.screenshots[0].route).toBe('/');
    expect(result.screenshots[0].status).toBe(200);
    expect(mockPageGoto).toHaveBeenCalledTimes(3);
    expect(mockPageScreenshot).toHaveBeenCalledTimes(3);
  });

  it('should use headless mode by default', async () => {
    const { captureSmokeScreens } = await import('./screens.js');

    await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/'],
      stamp: '20250101-000000'
    });

    expect(mockChromiumLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true })
    );
  });

  it('should respect headless: false option', async () => {
    const { captureSmokeScreens } = await import('./screens.js');

    await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/'],
      stamp: '20250101-000000',
      headless: false
    });

    expect(mockChromiumLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: false })
    );
  });

  it('should use bearer token when provided', async () => {
    const { captureSmokeScreens } = await import('./screens.js');

    await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/'],
      bearerToken: 'test-token-123',
      stamp: '20250101-000000'
    });

    expect(mockBrowserNewContext).toHaveBeenCalledWith(
      expect.objectContaining({
        extraHTTPHeaders: { Authorization: 'Bearer test-token-123' }
      })
    );
  });

  it('should not set auth header when no token provided', async () => {
    const { captureSmokeScreens } = await import('./screens.js');

    await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/'],
      stamp: '20250101-000000'
    });

    expect(mockBrowserNewContext).toHaveBeenCalledWith(
      expect.objectContaining({
        extraHTTPHeaders: undefined
      })
    );
  });

  it('should retry failed page captures', async () => {
    let attempt = 0;
    mockPageGoto.mockImplementation(() => {
      attempt++;
      if (attempt < 3) {
        throw new Error('Navigation timeout');
      }
      return Promise.resolve({ status: () => 200 });
    });

    const { captureSmokeScreens } = await import('./screens.js');

    const result = await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/'],
      stamp: '20250101-000000'
    });

    expect(mockPageGoto).toHaveBeenCalledTimes(3);
    expect(result.screenshots[0].status).toBe(200);
  });

  it('should close browser even if capture fails', async () => {
    mockPageGoto.mockRejectedValue(new Error('Fatal error'));

    const { captureSmokeScreens } = await import('./screens.js');

    await expect(
      captureSmokeScreens({
        baseUrl: 'https://example.com',
        routes: ['/'],
        stamp: '20250101-000000'
      })
    ).rejects.toThrow();

    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it('should use custom stamp when provided', async () => {
    const { captureSmokeScreens } = await import('./screens.js');

    const customStamp = '20241231-235959';
    const result = await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/'],
      stamp: customStamp
    });

    expect(result.runDir).toContain(customStamp);
  });

  it('should slugify route names correctly', async () => {
    const { captureSmokeScreens } = await import('./screens.js');

    const result = await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/', '/api/users', '/app/settings/profile'],
      stamp: '20250101-000000'
    });

    expect(result.screenshots[0].screenshot).toContain('home.png');
    expect(result.screenshots[1].screenshot).toContain('api-users.png');
    expect(result.screenshots[2].screenshot).toContain('app-settings-profile.png');
  });

  it('should include manifest with all captured routes', async () => {
    const fs = await import('node:fs');
    const { captureSmokeScreens } = await import('./screens.js');

    await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/', '/login'],
      stamp: '20250101-000000'
    });

    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('screens-manifest.json'),
      expect.stringContaining('https://example.com')
    );
  });
});
