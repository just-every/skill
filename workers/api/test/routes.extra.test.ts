import { createHmac } from 'crypto';
import { describe, expect, it, vi, afterEach } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

vi.mock('jose', () => {
  return {
    createRemoteJWKSet: vi.fn(() => vi.fn()),
    jwtVerify: vi.fn(),
  };
});

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

  return {
    DB: db,
    STORAGE: r2,
    LOGTO_ISSUER: 'https://auth.example.com/oidc',
    LOGTO_JWKS_URI: 'https://auth.example.com/oidc/jwks',
    LOGTO_API_RESOURCE: 'https://api.example.com',
    LOGTO_ENDPOINT: 'https://auth.example.com',
    LOGTO_APPLICATION_ID: 'logto-app-id',
    APP_BASE_URL: '/app',
    LANDING_URL: 'https://example.com',
    STRIPE_PRODUCTS: '[]',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    EXPO_PUBLIC_LOGTO_ENDPOINT: 'https://auth.example.com',
    EXPO_PUBLIC_LOGTO_APP_ID: 'logto-public-app-id',
    EXPO_PUBLIC_API_RESOURCE: 'https://api.example.com',
    EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI: 'https://example.com/logout',
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
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: env.LOGTO_API_RESOURCE,
      },
    } as any);

    const objectBody = new ArrayBuffer(4);
    const view = new Uint8Array(objectBody);
    view.set([1, 2, 3, 4]);

    env.STORAGE.get = vi.fn().mockResolvedValue({ body: objectBody, httpMetadata: { contentType: 'text/plain' } });

    const response = await runFetch(
      new Request('https://example.com/api/assets/get?key=uploads/foo.txt', {
        headers: { Authorization: 'Bearer token-abc' },
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
});
