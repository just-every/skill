import { createHmac } from 'crypto';
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
    run: vi.fn().mockResolvedValue({ success: true, meta: {} }),
    first: vi.fn().mockResolvedValue(null),
  });

  const db: D1Database = {
    prepare,
    dump: vi.fn(),
    batch: vi.fn(),
  } as unknown as D1Database;

  const assetsFetcher = {
    fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
  };

  return {
    DB: db,
    STORAGE: r2,
    LOGTO_ISSUER: 'https://auth.example.com/oidc',
    LOGTO_JWKS_URI: 'https://auth.example.com/oidc/jwks',
    LOGTO_API_RESOURCE: 'https://api.example.com',
    LOGTO_ENDPOINT: 'https://auth.example.com',
    LOGTO_APPLICATION_ID: 'logto-app-id',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://example.com',
    STRIPE_PRODUCTS: '[]',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    ASSETS: assetsFetcher as unknown as Env['ASSETS'],
    EXPO_PUBLIC_LOGTO_ENDPOINT: 'https://auth.example.com',
    EXPO_PUBLIC_LOGTO_APP_ID: 'logto-public-app-id',
    EXPO_PUBLIC_API_RESOURCE: 'https://api.example.com',
    EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI: 'https://example.com',
    ...overrides,
  } as Env;
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

describe('worker route extras', () => {
  it('returns configured Stripe products from /api/stripe/products', async () => {
    const env = createMockEnv({
      STRIPE_PRODUCTS: JSON.stringify([
        { name: 'Starter', amount: 2000, currency: 'usd', interval: 'month' },
      ]),
    });

    const response = await runFetch(new Request('https://example.com/api/stripe/products'), env);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      products: [{ name: 'Starter', amount: 2000, currency: 'usd', interval: 'month' }],
    });
  });

  it('requires bearer auth for asset retrieval', async () => {
    const env = createMockEnv();
    const response = await runFetch(new Request('https://example.com/api/assets/get?key=uploads/foo.txt'), env);

    expect(response.status).toBe(401);
  });

  it('streams assets when JWT is valid', async () => {
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

    const objectBody = new ArrayBuffer(4);
    new Uint8Array(objectBody).set([1, 2, 3, 4]);

    env.STORAGE.get = vi.fn().mockResolvedValue({ body: objectBody, httpMetadata: { contentType: 'text/plain' } });

    const response = await runFetch(
      new Request('https://example.com/api/assets/get?key=uploads/foo.txt', {
        headers: { Authorization: 'Bearer session_jwt_value' },
      }),
      env,
    );

    expect(env.STORAGE.get).toHaveBeenCalledWith('uploads/foo.txt');
    expect(response.status).toBe(200);
    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBe(4);
  });

  it('accepts Stripe webhooks with valid signatures', async () => {
    const env = createMockEnv();
    const payload = JSON.stringify({ type: 'test.event' });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET || '')
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
  });

  describe('GET /api/session', () => {
    it('returns session details when token is valid', async () => {
      const env = createMockEnv();
      mockedCreateRemoteJWKSet.mockReturnValue(vi.fn() as unknown as ReturnType<typeof createRemoteJWKSet>);
      mockedJwtVerify.mockResolvedValue({
        payload: {
          iss: env.LOGTO_ISSUER,
          sub: 'user-abc',
          email: 'admin@example.com',
          aud: env.LOGTO_API_RESOURCE,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      } as any);

      const response = await runFetch(
        new Request('https://example.com/api/session', {
          headers: { Authorization: 'Bearer session_jwt_value' },
        }),
        env,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        authenticated: true,
        sessionId: expect.any(String),
        expiresAt: expect.stringContaining('T'),
        emailAddress: 'admin@example.com',
      });
    });

    it('returns 401 with WWW-Authenticate when token is expired', async () => {
      const env = createMockEnv();
      mockedCreateRemoteJWKSet.mockReturnValue(vi.fn() as unknown as ReturnType<typeof createRemoteJWKSet>);
      const expiredError = Object.assign(new Error('JWT expired'), { code: 'ERR_JWT_EXPIRED' });
      mockedJwtVerify.mockRejectedValue(expiredError);

      const response = await runFetch(
        new Request('https://example.com/api/session', {
          headers: { Authorization: 'Bearer expired-token' },
        }),
        env,
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toContain('invalid_token');
      const body = await response.json();
      expect(body).toEqual({
        authenticated: false,
        sessionId: null,
        expiresAt: null,
        emailAddress: null,
      });
    });

    it('returns 403 when token audience mismatches', async () => {
      const env = createMockEnv();
      mockedCreateRemoteJWKSet.mockReturnValue(vi.fn() as unknown as ReturnType<typeof createRemoteJWKSet>);
      mockedJwtVerify.mockResolvedValue({
        payload: {
          iss: env.LOGTO_ISSUER,
          sub: 'user-aud',
          aud: 'https://other.example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      } as any);

      const response = await runFetch(
        new Request('https://example.com/api/session', {
          headers: { Authorization: 'Bearer mismatched-aud' },
        }),
        env,
      );

      expect(response.status).toBe(403);
      expect(response.headers.get('WWW-Authenticate')).toContain('insufficient_scope');
      const body = await response.json();
      expect(body).toEqual({
        authenticated: false,
        sessionId: null,
        expiresAt: null,
        emailAddress: null,
      });
    });
  });

  describe('SPA shell routes', () => {
    it('serves the app shell for /callback', async () => {
      const env = createMockEnv();
      const html = '<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"></div></body></html>';
      const assetResponse = new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
      env.ASSETS.fetch = vi.fn().mockResolvedValue(assetResponse);

      const response = await runFetch(new Request('https://example.com/callback'), env);

      expect(env.ASSETS.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html; charset=UTF-8');
      const body = await response.text();
      expect(body).toContain('window.__JUSTEVERY_ENV__');
    });

    it('serves the app shell for /logout', async () => {
      const env = createMockEnv();
      const html = '<!DOCTYPE html><html><body><div id="app"></div></body></html>';
      const assetResponse = new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
      env.ASSETS.fetch = vi.fn().mockResolvedValue(assetResponse);

      const response = await runFetch(new Request('https://example.com/logout'), env);

      expect(env.ASSETS.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html; charset=UTF-8');
      const body = await response.text();
      expect(body).toContain('window.__JUSTEVERY_ENV__');
    });
  });

});
