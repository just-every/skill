import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { runSmokeChecks } from './check.js';

// Mock fs and execa
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    promises: {
      writeFile: vi.fn()
    },
    mkdirSync: vi.fn()
  };
});

vi.mock('execa', () => ({
  execa: vi.fn()
}));

// Mock global fetch
global.fetch = vi.fn();

describe('runSmokeChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run smoke checks successfully with default routes', async () => {
    // Mock successful HTTP responses
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => '<html>Success</html>'
    });

    const result = await runSmokeChecks({
      baseUrl: 'https://example.com',
      routes: ['/'],
      mode: 'minimal',
      stamp: '20250101-000000'
    });

    // In minimal mode, wrangler checks are skipped, so overall ok may be false
    // but individual HTTP checks should be ok
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.checks[0].ok).toBe(true);
    expect(result.mode).toBe('minimal');
    expect(result.d1.skipped).toBe(true);
    expect(result.workerSecrets.skipped).toBe(true);
  });

  it('should handle HTTP failures gracefully', async () => {
    // Mock failed HTTP response
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Map(),
      text: async () => 'Internal Server Error'
    });

    const result = await runSmokeChecks({
      baseUrl: 'https://example.com',
      routes: ['/'],
      mode: 'minimal',
      stamp: '20250101-000000'
    });

    expect(result.ok).toBe(false);
    expect(result.checks.some(check => !check.ok)).toBe(true);
  });

  it('should skip wrangler checks in minimal mode', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => 'OK'
    });

    const result = await runSmokeChecks({
      baseUrl: 'https://example.com',
      routes: ['/'],
      mode: 'minimal',
      stamp: '20250101-000000'
    });

    expect(result.d1.skipped).toBe(true);
    expect(result.workerSecrets.skipped).toBe(true);
  });

  it('should use custom stamp when provided', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => 'OK'
    });

    const customStamp = '20241231-235959';
    const result = await runSmokeChecks({
      baseUrl: 'https://example.com',
      routes: ['/'],
      mode: 'minimal',
      stamp: customStamp
    });

    expect(result.runDir).toContain(customStamp);
  });

  it('should retry failed requests up to specified attempts', async () => {
    let callCount = 0;
    (global.fetch as any).mockImplementation(() => {
      callCount++;
      if (callCount < 2) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map(),
        text: async () => 'OK'
      });
    });

    const result = await runSmokeChecks({
      baseUrl: 'https://example.com',
      routes: ['/'],
      mode: 'minimal',
      attempts: 3,
      delayMs: 10,
      stamp: '20250101-000000'
    });

    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(result.checks[0].attempts).toBeGreaterThanOrEqual(2);
  });

  it('should handle 401 status for unauthenticated session endpoint', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/session')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Map(),
          text: async () => 'Unauthorized'
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map(),
        text: async () => 'OK'
      });
    });

    const result = await runSmokeChecks({
      baseUrl: 'https://example.com',
      routes: ['/'],
      mode: 'minimal',
      stamp: '20250101-000000'
    });

    const sessionCheck = result.checks.find(c => c.name === 'api:session-unauthenticated');
    expect(sessionCheck).toBeDefined();
    expect(sessionCheck?.status).toBe(401);
    expect(sessionCheck?.ok).toBe(true);
  });

  it('should handle 3xx redirects for login/logout', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/login') || url.includes('/logout')) {
        return Promise.resolve({
          ok: true,
          status: 302,
          headers: new Map([['location', 'https://auth.example.com']]),
          text: async () => ''
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map(),
        text: async () => 'OK'
      });
    });

    const result = await runSmokeChecks({
      baseUrl: 'https://example.com',
      routes: ['/login', '/logout'],
      mode: 'minimal',
      stamp: '20250101-000000'
    });

    const loginCheck = result.checks.find(c => c.name === 'page:/login');
    expect(loginCheck?.status).toBe(302);
    expect(loginCheck?.ok).toBe(true);
  });

  it('should use default output root when not specified', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => 'OK'
    });

    const result = await runSmokeChecks({
      baseUrl: 'https://example.com',
      routes: ['/'],
      mode: 'minimal',
      stamp: '20250101-000000'
    });

    expect(result.runDir).toContain('test-results/smoke');
  });
});
