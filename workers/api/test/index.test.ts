import { describe, expect, it, vi } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

if (typeof globalThis.btoa === 'undefined') {
  (globalThis as any).btoa = (value: string) => Buffer.from(value, 'binary').toString('base64');
}

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
    STYTCH_PROJECT_ID: 'project-id',
    STYTCH_SECRET: 'stytch-secret',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    APP_BASE_URL: '/app',
    LANDING_URL: 'https://app.example.com',
    STRIPE_PRODUCTS: '[]',
    ASSETS: assetsFetcher as unknown as Env['ASSETS'],
    EXPO_PUBLIC_STYTCH_BASE_URL: 'https://auth.example.com',
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
    const body = (await response.json()) as { authenticated: boolean; session: null };
    expect(body).toEqual({ authenticated: false, session: null });
  });

  it('authenticates bearer tokens against Stytch for /api/session', async () => {
    const env = createMockEnv();
    const stytchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('/v1/b2b/sessions/authenticate')) {
        expect(init?.headers).toMatchObject({ Authorization: expect.stringContaining('Basic ') });
        const responseBody = {
          session: { session_id: 'session-123', expires_at: new Date().toISOString() },
          member: { member_id: 'member-abc', email_address: 'admin@example.com' },
          organization: { organization_id: 'org-xyz', organization_name: 'Example, Inc.' },
        };
        return new Response(JSON.stringify(responseBody), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });

    const request = new Request('https://example.com/api/session', {
      headers: { Authorization: 'Bearer session_jwt_value' },
    });

    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { authenticated: boolean; session: { session_id: string } };
    expect(body.authenticated).toBe(true);
    expect(body.session.session_id).toBe('session-123');

    stytchMock.mockRestore();
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
    const stytchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          session: { session_id: 'session-123', expires_at: new Date(Date.now() + 60000).toISOString() },
          member: { member_id: 'member-abc', email_address: 'admin@example.com' },
          organization: { organization_id: 'org-xyz', organization_name: 'Example Org' },
        }),
        { status: 200 },
      ) as Response,
    );

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

    stytchMock.mockRestore();
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
      EXPO_PUBLIC_STYTCH_PUBLIC_TOKEN: 'public-token-live-123',
      EXPO_PUBLIC_STYTCH_BASE_URL: 'https://auth.example.com',
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
    expect(text).toContain('public-token-live-123');
    expect(text).toContain('https://example.com');
    expect(text).toContain('https://auth.example.com');
    const cacheControl = response.headers.get('cache-control');
    expect(cacheControl).toBe('no-store, max-age=0');
  });

});
