import test from 'node:test';
import assert from 'node:assert/strict';

import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

const ctx = {} as ExecutionContext;

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    LOGIN_ORIGIN: 'https://login.justevery.com',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://starter.justevery.com',
    STRIPE_PRODUCTS: '[]',
    EXPO_PUBLIC_WORKER_ORIGIN: 'https://app.local',
    ASSETS: {
      fetch: async () => new Response('Not Found', { status: 404 }),
    },
    ...overrides,
  } as Env;
}

async function runFetch(request: Request, env: Env): Promise<Response> {
  const handler = Worker.fetch;
  if (!handler) {
    throw new Error('Worker.fetch missing');
  }
  return handler(
    request as Request<unknown, IncomingRequestCfProperties<unknown>>,
    env,
    ctx,
  );
}

const originalFetch = globalThis.fetch;

test('session endpoint returns 401 when cookie is missing', async () => {
  const env = createMockEnv();
  const response = await runFetch(new Request('https://example.com/api/session'), env);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.deepEqual(body, {
    authenticated: false,
    sessionId: null,
    expiresAt: null,
    emailAddress: null,
  });
});

test('session endpoint proxies to login worker when cookie is present', async () => {
  const env = createMockEnv();
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

  let capturedUrl: string | null = null;
  let capturedOptions: RequestInit | undefined;

  globalThis.fetch = (async (input: Request | string, init?: RequestInit) => {
    capturedUrl = typeof input === 'string' ? input : input.url;
    capturedOptions = init;
    return new Response(JSON.stringify(mockSession), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const request = new Request('https://example.com/api/session', {
      headers: { Cookie: 'better-auth.session_token=test_session_token' },
    });
    const response = await runFetch(request, env);
    assert.equal(response.status, 200);
    assert.equal(capturedUrl, 'https://login.justevery.com/api/auth/session');
    assert.ok(capturedOptions);
    assert.equal(capturedOptions?.method, 'GET');
    assert.match(String(capturedOptions?.headers?.cookie ?? ''), /test_session_token/);
    const body = await response.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.sessionId, 'sess_123');
    assert.equal(body.emailAddress, 'admin@example.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
