import { describe, expect, it, vi } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const kv: KVNamespace = {
    get: vi.fn().mockResolvedValue(null),
    getWithMetadata: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: undefined }) as any,
  } as unknown as KVNamespace;

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

  return {
    SESSION_KV: kv,
    DB: db,
    STORAGE: r2,
    STYTCH_PROJECT_ID: 'project-id',
    STYTCH_SECRET: 'stytch-secret',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STYTCH_LOGIN_URL: 'https://login.example.com',
    STYTCH_REDIRECT_URL: 'https://app.example.com/auth/callback',
    APP_BASE_URL: '/app',
    LANDING_URL: 'https://app.example.com',
    STRIPE_PRODUCTS: '[]',
    ...overrides,
  };
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

  it('returns unauthenticated JSON for /api/session', async () => {
    const env = createMockEnv();
    const request = new Request('https://example.com/api/session');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ authenticated: false, session: null });
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

  it('returns 500 when no SSO locator is configured', async () => {
    const env = createMockEnv({
      STYTCH_SSO_CONNECTION_ID: undefined,
      STYTCH_ORGANIZATION_SLUG: undefined,
    });
    const response = await runFetch(new Request('https://example.com/login'), env);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain('SSO configuration is incomplete');
  });

  it('redirects with configured connection_id', async () => {
    const env = createMockEnv({ STYTCH_SSO_CONNECTION_ID: 'conn-123' });
    const response = await runFetch(new Request('https://example.com/login'), env);

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location ?? '');
    expect(redirectUrl.pathname).toBe('/v1/public/sso/start');
    expect(redirectUrl.searchParams.get('connection_id')).toBe('conn-123');
  });

  it('treats URL-like organization_slug as invalid', async () => {
    const env = createMockEnv({
      STYTCH_SSO_CONNECTION_ID: undefined,
      STYTCH_ORGANIZATION_SLUG: 'https://login.example.com',
    });
    const request = new Request('https://example.com/login');
    const response = await runFetch(request, env);

    expect(response.status).toBe(500);
  });
});
