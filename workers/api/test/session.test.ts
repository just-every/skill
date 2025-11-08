import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

/**
 * Tests for Better Auth session verification
 */

const ctx = {} as ExecutionContext;

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const defaultStorage: R2Bucket = {
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false, delimitedPrefixes: [] }),
    get: vi.fn(),
    getWithMetadata: vi.fn(),
    head: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as R2Bucket;

  const prepare = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true, meta: {} }),
    all: vi.fn().mockResolvedValue({ success: true, results: [] }),
    raw: vi.fn(),
  });
  const defaultDb: D1Database = {
    prepare,
    dump: vi.fn(),
    batch: vi.fn(),
  } as unknown as D1Database;

  const assetsFetcher = {
    fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
  };

  const hasStorageOverride = Object.prototype.hasOwnProperty.call(overrides, 'STORAGE');
  const hasDbOverride = Object.prototype.hasOwnProperty.call(overrides, 'DB');

  const env: Partial<Env> = {
    LOGIN_ORIGIN: 'https://login.justevery.com',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://app.example.com',
    STRIPE_PRODUCTS: '[]',
    ASSETS: assetsFetcher as unknown as Env['ASSETS'],
    EXPO_PUBLIC_WORKER_ORIGIN: 'https://app.example.com',
  };

  const storage = hasStorageOverride ? overrides.STORAGE : defaultStorage;
  const db = hasDbOverride ? overrides.DB : defaultDb;

  if (storage) {
    env.STORAGE = storage;
  }
  if (db) {
    env.DB = db;
  }

  return {
    ...env,
    ...overrides,
  } as Env;
}

async function runFetch(
  request: Request,
  env: Env,
): Promise<Response> {
  const handler = Worker.fetch;
  if (!handler) {
    throw new Error('Expected Worker.fetch to be defined');
  }
  return handler(
    request as Request<unknown, IncomingRequestCfProperties<unknown>>,
    env,
    ctx,
  );
}

// Mock fetch globally
const originalFetch = global.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('Better Auth session verification', () => {
  it('returns 401 when cookie is missing for /api/session', async () => {
    const env = createMockEnv();
    const request = new Request('https://example.com/api/session');
    const response = await runFetch(request, env);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      authenticated: false,
      sessionId: null,
      expiresAt: null,
      emailAddress: null,
    });
  });

  it('authenticates valid session from login worker for /api/session', async () => {
    const env = createMockEnv();

    // Mock successful session response from login worker
    const mockSession = {
      session: {
        id: 'sess_123',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        expiresAt: new Date('2025-01-08T00:00:00Z'),
        token: 'token_abc',
        userId: 'user_123',
      },
      user: {
        id: 'user_123',
        email: 'admin@example.com',
        emailVerified: true,
        name: 'Admin User',
        createdAt: new Date('2024-12-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      },
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const request = new Request('https://example.com/api/session', {
      headers: { Cookie: 'better-auth.session_token=test_session_token' },
    });

    const response = await runFetch(request, env);

    // Verify fetch was called with correct params
    expect(mockFetch).toHaveBeenCalledWith(
      'https://login.justevery.com/api/auth/session',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          cookie: 'better-auth.session_token=test_session_token',
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      authenticated: true,
      sessionId: 'sess_123',
      expiresAt: expect.stringContaining('2025-01-08'),
      emailAddress: 'admin@example.com',
    });
  });

  it('returns 401 when login worker returns unauthorized', async () => {
    const env = createMockEnv();

    mockFetch.mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    );

    const request = new Request('https://example.com/api/session', {
      headers: { Cookie: 'better-auth.session_token=invalid_token' },
    });

    const response = await runFetch(request, env);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      authenticated: false,
      sessionId: null,
      expiresAt: null,
      emailAddress: null,
    });
  });

  it('returns 502 when login worker is unreachable', async () => {
    const env = createMockEnv();

    mockFetch.mockRejectedValue(new Error('Network error'));

    const request = new Request('https://example.com/api/session', {
      headers: { Cookie: 'better-auth.session_token=test_token' },
    });

    const response = await runFetch(request, env);

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
      authenticated: false,
      sessionId: null,
      expiresAt: null,
      emailAddress: null,
    });
  });

  it('caches session results to avoid repeated calls', async () => {
    const env = createMockEnv();

    const mockSession = {
      session: {
        id: 'sess_cached',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        expiresAt: new Date('2025-01-08T00:00:00Z'),
        token: 'token_cached',
        userId: 'user_cached',
      },
      user: {
        id: 'user_cached',
        email: 'cached@example.com',
        emailVerified: true,
        name: 'Cached User',
        createdAt: new Date('2024-12-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      },
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const cookieHeader = 'better-auth.session_token=cached_token';

    // First request
    const request1 = new Request('https://example.com/api/session', {
      headers: { Cookie: cookieHeader },
    });
    await runFetch(request1, env);

    // Second request with same cookie (should use cache, not make another fetch)
    const request2 = new Request('https://example.com/api/session', {
      headers: { Cookie: cookieHeader },
    });
    const response2 = await runFetch(request2, env);

    // fetch should only be called once due to caching
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(response2.status).toBe(200);
  });

  it('requires auth for protected endpoints like /api/me', async () => {
    const env = createMockEnv();
    const request = new Request('https://example.com/api/me');
    const response = await runFetch(request, env);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  it('allows authenticated access to /api/me', async () => {
    const env = createMockEnv();

    const mockSession = {
      session: {
        id: 'sess_me',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        expiresAt: new Date('2025-01-08T00:00:00Z'),
        token: 'token_me',
        userId: 'user_me',
      },
      user: {
        id: 'user_me',
        email: 'me@example.com',
        emailVerified: true,
        name: 'Me User',
        createdAt: new Date('2024-12-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      },
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const request = new Request('https://example.com/api/me', {
      headers: { Cookie: 'better-auth.session_token=valid_token' },
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      authenticated: true,
      session: {
        email_address: 'me@example.com',
        session_id: 'sess_me',
      },
    });
  });
});
