import { describe, expect, it, vi, afterEach } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn(),
}));

import { createRemoteJWKSet, jwtVerify } from 'jose';

const mockedCreateRemoteJWKSet = vi.mocked(createRemoteJWKSet);
const mockedJwtVerify = vi.mocked(jwtVerify);

afterEach(() => {
  vi.clearAllMocks();
});

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const r2: R2Bucket = {
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
  const db: D1Database = {
    prepare,
    dump: vi.fn(),
    batch: vi.fn(),
  } as unknown as D1Database;

  const assetsFetcher = {
    fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
  };

  const env = {
    DB: db,
    STORAGE: r2,
    LOGTO_ISSUER: 'https://auth.example.com/oidc',
    LOGTO_JWKS_URI: 'https://auth.example.com/oidc/jwks',
    LOGTO_API_RESOURCE: 'https://api.example.com',
    LOGTO_ENDPOINT: 'https://auth.example.com',
    LOGTO_APPLICATION_ID: 'logto-app-id',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    APP_BASE_URL: '/app',
    LANDING_URL: 'https://app.example.com',
    STRIPE_PRODUCTS: '[]',
    ASSETS: assetsFetcher as unknown as Env['ASSETS'],
    EXPO_PUBLIC_LOGTO_ENDPOINT: 'https://auth.example.com',
    EXPO_PUBLIC_LOGTO_APP_ID: 'logto-public-app-id',
    EXPO_PUBLIC_API_RESOURCE: 'https://api.example.com',
    EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI: 'https://app.example.com',
    ...overrides,
  } as Env;

  return env;
}

const ctx = {} as ExecutionContext;

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

describe('Worker routes', () => {
  it('returns landing page HTML for root route', async () => {
    const env = createMockEnv();
    const request = new Request('https://example.com/');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('Launch your product');
  });

  it('returns 401 when Authorization header is missing for /api/session', async () => {
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

  it('authenticates valid Logto JWT for /api/session', async () => {
    const env = createMockEnv();
    const jwksStub = vi.fn();
    mockedCreateRemoteJWKSet.mockReturnValue(jwksStub as unknown as ReturnType<typeof createRemoteJWKSet>);
    mockedJwtVerify.mockResolvedValue({
      payload: {
        iss: env.LOGTO_ISSUER,
        sub: 'user-123',
        email: 'admin@example.com',
        aud: env.LOGTO_API_RESOURCE,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    } as any);

    const request = new Request('https://example.com/api/session', {
      headers: { Authorization: 'Bearer session_jwt_value' },
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      authenticated: true,
      sessionId: expect.any(String),
      expiresAt: expect.stringContaining('T'),
      emailAddress: 'admin@example.com',
    });
  });

  it('returns 401 when JWT verification fails for /api/session', async () => {
    const env = createMockEnv();
    mockedCreateRemoteJWKSet.mockReturnValue(vi.fn() as unknown as ReturnType<typeof createRemoteJWKSet>);
    mockedJwtVerify.mockRejectedValue(new Error('invalid token'));

    const request = new Request('https://example.com/api/session', {
      headers: { Authorization: 'Bearer bad-token' },
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

  it('rejects Stripe webhook without signature', async () => {
    const env = createMockEnv();
    const request = new Request('https://example.com/webhook/stripe', {
      method: 'POST',
      body: JSON.stringify({ type: 'test.event' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await runFetch(request, env);

    expect(response.status).toBe(400);
  });

  it('requires auth for asset listing', async () => {
    const env = createMockEnv();
    const request = new Request('https://example.com/api/assets/list');
    const response = await runFetch(request, env);

    expect(response.status).toBe(401);
  });

  it('lists assets when bearer token is valid', async () => {
    const env = createMockEnv();
    mockedCreateRemoteJWKSet.mockReturnValue(vi.fn() as unknown as ReturnType<typeof createRemoteJWKSet>);
    mockedJwtVerify.mockResolvedValue({
      payload: {
        iss: env.LOGTO_ISSUER,
        sub: 'user-123',
        aud: env.LOGTO_API_RESOURCE,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    } as any);

    env.STORAGE.list = vi.fn().mockResolvedValue({
      objects: [
        {
          key: 'uploads/example.txt',
          size: 42,
          etag: 'etag',
          uploaded: new Date(),
        },
      ],
      truncated: false,
    } as any);

    const request = new Request('https://example.com/api/assets/list', {
      headers: { Authorization: 'Bearer session_jwt_value' },
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { objects: unknown[] };
    expect(body.objects).toHaveLength(1);
  });

  it('proxies static asset requests to the ASSETS binding', async () => {
    const assetBody = 'console.log("hello");';
    const fetchMock = vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      expect(url).toContain('/_expo/static/js/web/app.js');
      return new Response(assetBody, {
        status: 200,
        headers: { 'content-type': 'application/javascript' },
      });
    });

    const env = createMockEnv({
      ASSETS: { fetch: fetchMock } as unknown as Env['ASSETS'],
    });

    const request = new Request('https://example.com/_expo/static/js/web/app.js');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(assetBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves the SPA shell for app routes when assets are available', async () => {
    const fetchMock = vi.fn(async (input: Request | string) => {
      const requestUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (requestUrl.endsWith('/index.html')) {
        return new Response('<html><head></head><body>app shell</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const env = createMockEnv({
      APP_BASE_URL: '/app',
      EXPO_PUBLIC_WORKER_ORIGIN: 'https://example.com',
      ASSETS: { fetch: fetchMock } as unknown as Env['ASSETS'],
    });

    const request = new Request('https://example.com/app');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    const text = await response.text();
    expect(text).toContain('app shell');
    expect(text).toContain('window.__JUSTEVERY_ENV__');
    expect(text).toContain('logto-public-app-id');
    expect(text).toContain('https://example.com');
    expect(text).toContain('https://auth.example.com');
    const cacheControl = response.headers.get('cache-control');
    expect(cacheControl).toBe('no-store, max-age=0');
  });

});
