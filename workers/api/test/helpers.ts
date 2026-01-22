import { vi } from 'vitest';
import type { Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';
type WorkerNS = typeof import('../src/index');
type WorkerHandler = WorkerNS['default'];

const mockRequireSession = vi.fn();
const realFetch: typeof globalThis.fetch = globalThis.fetch ?? ((): Promise<Response> => Promise.reject(new Error('fetch unavailable'))) as typeof globalThis.fetch;

vi.mock('../src/sessionAuth', () => ({
  authenticateRequest: vi.fn(),
  sessionSuccessResponse: vi.fn(),
  sessionFailureResponse: vi.fn(),
  authFailureResponse: vi.fn((failure) =>
    new Response(JSON.stringify({ error: failure.reason ?? 'unauthorized' }), { status: 401 })
  ),
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireSession(...(args as Parameters<typeof mockRequireSession>)),
}));

const stripeQueue: Array<{ status: number; body: unknown }> = [];
const stripeRequests: Array<{ url: string; method: string; body: string }> = [];

export function queueStripeResponse(body: unknown, status = 200): void {
  stripeQueue.push({ body, status });
}

export function setViewerEmail(email: string): void {
  mockRequireSession.mockResolvedValue({
    ok: true,
    session: {
      sessionId: 'sess-123',
      userId: 'user-123',
      emailAddress: email,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      session: {},
    },
  });
}

function createDbMock(): D1Database {
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      bindings: [] as unknown[],
      bind(...args: unknown[]) {
        this.bindings = args;
        return this;
      },
      async first() {
        if (sql.includes('FROM organization_stripe_customers')) {
          return { stripe_customer_id: 'cus_test_123' };
        }
        if (sql.includes('FROM organizations')) {
          return { stripe_customer_id: 'cus_test_123', billing_email: 'billing@justevery.com' };
        }
        return null;
      },
      async run() {
        return { success: true, meta: {} };
      },
      async all() {
        return { success: true, results: [] };
      },
    };
    return statement;
  });

  return {
    prepare,
    dump: vi.fn(),
    batch: vi.fn(),
  } as unknown as D1Database;
}

export function createMockEnv(overrides: Partial<Env> = {}): Env {
  const assetsFetcher = {
    fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
  };

  const env: Env = {
    LOGIN_ORIGIN: 'https://login.local',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://app.local',
    BILLING_SERVICE_CLIENT_ID: 'svc_client_123',
    BILLING_SERVICE_CLIENT_SECRET: 'svc_secret_123',
    STRIPE_PRODUCTS: JSON.stringify([
      {
        id: 'prod_launch',
        name: 'Launch',
        description: 'Launch plan',
        priceId: 'price_launch_monthly',
        unitAmount: 2100,
        currency: 'usd',
        interval: 'month',
      },
      {
        id: 'prod_scale',
        name: 'Scale',
        description: 'Scale plan',
        priceId: 'price_scale_monthly',
        unitAmount: 5400,
        currency: 'usd',
        interval: 'month',
      },
    ]),
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_SECRET_KEY: 'sk_test_123',
    EXPO_PUBLIC_WORKER_ORIGIN: 'http://127.0.0.1:9788',
    ALLOW_PLACEHOLDER_DATA: 'true',
    ALLOW_SAMPLE_ACCOUNT_AUTO_MEMBERS: 'false',
    DB: createDbMock(),
    ASSETS: assetsFetcher as unknown as Env['ASSETS'],
  };

  return { ...env, ...overrides };
}

export async function setupTestWorker() {
  const workerModule: WorkerNS = await import('../src/index');
  const worker: WorkerHandler = workerModule.default;
  stripeQueue.length = 0;
  stripeRequests.length = 0;

  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();

    if (url.startsWith('https://api.stripe.com')) {
      if (stripeQueue.length === 0) {
        throw new Error('Unexpected Stripe API request');
      }
      const next = stripeQueue.shift()!;
      const payload = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
      const requestBody = typeof init?.body === 'string'
        ? init.body
        : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : '';
      stripeRequests.push({
        url,
        method: init?.method ?? 'POST',
        body: requestBody,
      });
      return Promise.resolve(new Response(payload, {
        status: next.status,
        headers: { 'content-type': 'application/json' },
      }));
    }

    return realFetch(input as RequestInfo, init) as Promise<Response>;
  }) as typeof globalThis.fetch;

  globalThis.fetch = spy;

  return { worker, fetchSpy: spy };
}

export function runFetch(worker: WorkerHandler, request: Request, env: Env): Promise<Response> {
  const handler = worker.fetch;
  if (!handler) {
    throw new Error('Worker.fetch is not defined');
  }
  const result = handler(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, {} as ExecutionContext);
  if (result instanceof Response) {
    return Promise.resolve(result);
  }
  return result;
}

export { stripeRequests, mockRequireSession };
