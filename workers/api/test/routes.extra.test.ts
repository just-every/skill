import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const kv: KVNamespace = {
    get: vi.fn().mockResolvedValue(null),
    getWithMetadata: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi
      .fn()
      .mockResolvedValue({ objects: [], truncated: false, delimitedPrefixes: [] }) as any,
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
    run: vi.fn().mockResolvedValue({ success: true, meta: {} }),
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
    STYTCH_LOGIN_URL: 'https://login.example.com',
    STYTCH_REDIRECT_URL: 'https://app.example.com/auth/callback',
    APP_BASE_URL: '/app',
    LANDING_URL: 'https://app.example.com',
    STRIPE_PRODUCTS: '[]',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    ...overrides,
  };
}

const ctx = {} as ExecutionContext;

async function runFetch(request: Request, env: Env): Promise<Response> {
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

describe('additional worker routes', () => {
  it('returns configured Stripe products from /api/stripe/products', async () => {
    const env = createMockEnv({
      STRIPE_PRODUCTS: JSON.stringify([
        { name: 'Starter', amount: 2000, currency: 'usd', interval: 'month' },
      ]),
    });
    const request = new Request('https://example.com/api/stripe/products');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body).toEqual({
      products: [{ name: 'Starter', amount: 2000, currency: 'usd', interval: 'month' }],
    });
  });

  it('requires auth for /api/assets/list', async () => {
    const env = createMockEnv();
    const request = new Request('https://example.com/api/assets/list?prefix=uploads/');
    const response = await runFetch(request, env);

    expect(response.status).toBe(401);
  });

  it('redirects /login using STYTCH_PUBLIC_TOKEN when provided', async () => {
    const env = createMockEnv({
      STYTCH_PUBLIC_TOKEN: 'public-token-123',
      STYTCH_LOGIN_URL: 'https://login.example.com',
      STYTCH_SSO_CONNECTION_ID: 'conn-123',
      STYTCH_ORGANIZATION_SLUG: 'validslug',
    });
    const request = new Request('https://example.com/login');
    const response = await runFetch(request, env);

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location ?? '');
    expect(redirectUrl.pathname).toBe('/v1/public/sso/start');
    expect(redirectUrl.searchParams.get('public_token')).toBe('public-token-123');
    expect(redirectUrl.searchParams.get('redirect_url')).toBe(env.STYTCH_REDIRECT_URL);
    expect(redirectUrl.searchParams.get('login_redirect_url')).toBe(env.STYTCH_REDIRECT_URL);
    expect(redirectUrl.searchParams.get('signup_redirect_url')).toBe(env.STYTCH_REDIRECT_URL);
  });

  it('falls back to STYTCH_PROJECT_ID when STYTCH_PUBLIC_TOKEN is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = createMockEnv({
      STYTCH_LOGIN_URL: 'https://login.example.com',
      STYTCH_SSO_CONNECTION_ID: 'conn-fallback',
      STYTCH_ORGANIZATION_SLUG: 'validslug',
    });
    const request = new Request('https://example.com/login');
    const response = await runFetch(request, env);

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location ?? '');
    expect(redirectUrl.searchParams.get('public_token')).toBe(env.STYTCH_PROJECT_ID);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('STYTCH_PUBLIC_TOKEN missing'),
    );
    warn.mockRestore();
  });

  it('includes locator params from environment when configured', async () => {
    const env = createMockEnv({
      STYTCH_PUBLIC_TOKEN: 'public-token-123',
      STYTCH_SSO_CONNECTION_ID: 'conn_456',
      STYTCH_ORGANIZATION_SLUG: 'org-slug',
      STYTCH_SSO_DOMAIN: 'justevery.com',
    });
    const request = new Request('https://example.com/login');
    const response = await runFetch(request, env);

    const redirectUrl = new URL(response.headers.get('location') ?? '');
    expect(redirectUrl.searchParams.get('connection_id')).toBe('conn_456');
    expect(redirectUrl.searchParams.get('organization_slug')).toBe('org-slug');
    expect(redirectUrl.searchParams.get('domain')).toBe('justevery.com');
  });

  it('passes through locator query params from the request', async () => {
    const env = createMockEnv({
      STYTCH_PUBLIC_TOKEN: 'public-token-123',
      STYTCH_SSO_CONNECTION_ID: 'conn_env',
      STYTCH_SSO_DOMAIN: 'env-domain.com',
    });
    const request = new Request(
      'https://example.com/login?connection_id=conn_query&organization_id=org_query&domain=acme.com',
    );
    const response = await runFetch(request, env);

    const redirectUrl = new URL(response.headers.get('location') ?? '');
    expect(redirectUrl.searchParams.get('connection_id')).toBe('conn_query');
    expect(redirectUrl.searchParams.get('organization_id')).toBe('org_query');
    expect(redirectUrl.searchParams.get('domain')).toBe('acme.com');
  });

  it('applies domain fallback when env is set and request omits it', async () => {
    const env = createMockEnv({
      STYTCH_PUBLIC_TOKEN: 'public-token-123',
      STYTCH_SSO_DOMAIN: 'fallback-domain.com',
      STYTCH_SSO_CONNECTION_ID: 'conn-domain',
    });
    const request = new Request('https://example.com/login');
    const response = await runFetch(request, env);

    const redirectUrl = new URL(response.headers.get('location') ?? '');
    expect(redirectUrl.searchParams.get('domain')).toBe('fallback-domain.com');
  });

  it('derives organization_slug from LANDING_URL when none provided', async () => {
    const env = createMockEnv({
      STYTCH_PUBLIC_TOKEN: 'public-token-123',
      LANDING_URL: 'https://demo.justevery.com',
      STYTCH_SSO_CONNECTION_ID: undefined,
      STYTCH_ORGANIZATION_SLUG: undefined,
      STYTCH_ORGANIZATION_ID: undefined,
      STYTCH_SSO_DOMAIN: undefined,
    });
    const request = new Request('https://example.com/login');
    const response = await runFetch(request, env);

    expect(response.status).toBe(500);
  });

  it('exposes debug login details without explicit locator', async () => {
    const env = createMockEnv({
      STYTCH_PUBLIC_TOKEN: 'public-token-123',
      LANDING_URL: 'https://demo.justevery.com',
      STYTCH_SSO_CONNECTION_ID: undefined,
      STYTCH_ORGANIZATION_SLUG: undefined,
      STYTCH_ORGANIZATION_ID: undefined,
      STYTCH_SSO_DOMAIN: undefined,
    });
    const response = await runFetch(new Request('https://example.com/api/debug/login-url'), env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.has_locator).toBe(false);
    expect(body.explicit_locator).toBe(false);
    expect(body.derived_slug).toBe('demo');
  });

  it('exposes debug login details for explicit locator', async () => {
    const env = createMockEnv({
      STYTCH_PUBLIC_TOKEN: 'public-token-123',
      STYTCH_SSO_CONNECTION_ID: 'conn-789',
    });
    const response = await runFetch(new Request('https://example.com/api/debug/login-url?domain=acme.com'), env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.has_locator).toBe(true);
    expect(body.explicit_locator).toBe(true);
    const parsed = new URL(body.url);
    expect(parsed.pathname).toBe('/v1/public/sso/start');
    expect(parsed.searchParams.get('connection_id')).toBe('conn-789');
    expect(parsed.searchParams.get('domain')).toBe('acme.com');
    expect(body.derived_slug).toBeNull();
  });

  it('clears session cookie on /logout', async () => {
    const env = createMockEnv();
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    env.SESSION_KV.delete = deleteMock as unknown as KVNamespace['delete'];

    const request = new Request('https://example.com/logout', {
      headers: { cookie: 'je_session=test-session' },
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(302);
    expect(deleteMock).toHaveBeenCalledWith('test-session');

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('je_session=');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('logs Stripe webhook events to audit_log', async () => {
    const env = createMockEnv();

    const bindMock = vi.fn().mockReturnThis();
    const runMock = vi.fn().mockResolvedValue({ success: true });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock, run: runMock });
    env.DB = {
      prepare: prepareMock,
      dump: vi.fn(),
      batch: vi.fn(),
    } as unknown as D1Database;

    const secret = env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';
    const payload = JSON.stringify({ id: 'evt_123', type: 'customer.created' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const request = new Request('https://example.com/webhook/stripe', {
      method: 'POST',
      body: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': `t=${timestamp},v1=${signature}`,
      },
    });

    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    expect(prepareMock).toHaveBeenCalledWith(
      'INSERT INTO audit_log (id, user_id, action, metadata) VALUES (?1, ?2, ?3, ?4)',
    );
    expect(bindMock).toHaveBeenCalledWith('evt_123', null, 'customer.created', payload);
    expect(runMock).toHaveBeenCalled();
  });
});
