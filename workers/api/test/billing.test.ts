import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Worker, { type BillingProduct, type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

const mockRequireSession = vi.fn();

vi.mock('../src/sessionAuth', () => ({
  authenticateRequest: vi.fn(),
  sessionSuccessResponse: vi.fn(),
  sessionFailureResponse: vi.fn(),
  authFailureResponse: vi.fn((failure) =>
    new Response(JSON.stringify({ error: failure.reason ?? 'unauthorized' }), { status: 401 })
  ),
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireSession(...(args as Parameters<typeof mockRequireSession>)),
}));

const ctx = {} as ExecutionContext;
const realFetch = globalThis.fetch;
const stripeQueue: Array<{ status: number; body: unknown }> = [];

function queueStripeResponse(body: unknown, status = 200): void {
  stripeQueue.push({ body, status });
}

function setViewerEmail(email: string): void {
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
        if (sql.includes('FROM stripe_customers')) {
          return { stripe_customer_id: 'cus_test_123' };
        }
        if (sql.includes('FROM companies')) {
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

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const assetsFetcher = {
    fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
  };

  const env: Env = {
    LOGIN_ORIGIN: 'https://login.local',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://app.local',
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
    EXPO_PUBLIC_WORKER_ORIGIN: 'http://127.0.0.1:8787',
    ALLOW_PLACEHOLDER_DATA: 'true',
    DB: createDbMock(),
    ASSETS: assetsFetcher as unknown as Env['ASSETS'],
  };

  return { ...env, ...overrides };
}

async function runFetch(request: Request, env: Env): Promise<Response> {
  const handler = Worker.fetch;
  if (!handler) {
    throw new Error('Worker.fetch is not defined');
  }
  return handler(
    request as Request<unknown, IncomingRequestCfProperties<unknown>>,
    env,
    ctx,
  );
}

async function parseJson<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeEach(() => {
  stripeQueue.length = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : input.toString();

    if (url.startsWith('https://api.stripe.com')) {
      if (stripeQueue.length === 0) {
        throw new Error('Unexpected Stripe API request');
      }
      const next = stripeQueue.shift()!;
      const payload = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
      return Promise.resolve(new Response(payload, {
        status: next.status,
        headers: { 'content-type': 'application/json' },
      }));
    }

    return realFetch(input as RequestInfo, init);
  }) as typeof globalThis.fetch;
  globalThis.fetch = fetchMock;

  setViewerEmail('ava@justevery.com');
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mockRequireSession.mockReset();
});

describe('Account billing endpoints', () => {
  it('returns parsed products for Billing+ readers', async () => {
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/products', {
      headers: { cookie: 'better-auth.session_token=test' },
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const data = await parseJson<{ products: BillingProduct[] }>(response);
    expect(Array.isArray(data.products)).toBe(true);
    expect(data.products).toHaveLength(2);
  });

  it('normalizes Stripe products for the public catalog endpoint and prefers real price IDs', async () => {
    const env = createMockEnv({
      STRIPE_PRODUCTS: JSON.stringify([
        {
          id: 'prod_legacy',
          name: 'Legacy',
          description: 'Legacy fallback',
          priceId: 'legacy:legacy-plan',
          unitAmount: 1000,
          currency: 'USD',
          interval: 'month',
        },
        {
          id: 'prod_scale',
          name: ' Scale ',
          description: 'Scale plan',
          priceId: '  price_scale_monthly  ',
          unitAmount: 5400,
          currency: 'USD',
          interval: 'MONTHLY',
        },
      ]),
    });
    const request = new Request('http://127.0.0.1/api/stripe/products');

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const data = await parseJson<{ products: BillingProduct[] }>(response);
    expect(data.products).toHaveLength(1);
    expect(data.products[0]).toEqual(
      expect.objectContaining({
        id: 'prod_scale',
        priceId: 'price_scale_monthly',
        currency: 'usd',
        interval: 'month',
      })
    );
  });

  it('handles malformed STRIPE_PRODUCTS gracefully', async () => {
    const env = createMockEnv({ STRIPE_PRODUCTS: '{ totally invalid' });
    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/products');

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const data = await parseJson<{ products: BillingProduct[] }>(response);
    expect(data.products).toHaveLength(0);
  });

  it('updates billing email via D1 when available', async () => {
    const db = createDbMock();
    const env = createMockEnv({ DB: db });
    const prepareSpy = vi.spyOn(db, 'prepare');

    const request = new Request('http://127.0.0.1/api/accounts/justevery', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ billingEmail: 'new@justevery.com' }),
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    expect(prepareSpy).toHaveBeenCalledWith(expect.stringContaining('UPDATE companies SET billing_email = ? WHERE id = ?'));
    const updateResult = prepareSpy.mock.results.find((result) =>
      (result.value as { sql: string }).sql.includes('UPDATE companies SET billing_email = ? WHERE id = ?')
    );
    expect(updateResult).toBeDefined();
    const statement = (updateResult!.value as { bindings: unknown[] });
    expect(statement.bindings[0]).toBe('new@justevery.com');
    expect(statement.bindings[1]).toBeTruthy();
  });

  it('creates a checkout session for Owner/Admin roles', async () => {
    const env = createMockEnv();
    queueStripeResponse({ id: 'cs_test_123', url: 'https://checkout.stripe.com/test' });

    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_123',
        successUrl: 'https://app.local/success',
        cancelUrl: 'https://app.local/cancel',
      }),
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const data = await parseJson<{ sessionId: string; url: string }>(response);
    expect(data.sessionId).toBe('cs_test_123');
    expect(data.url).toMatch(/checkout/);
  });

  it('rejects checkout when payload is incomplete', async () => {
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ successUrl: 'https://app.local/success' }),
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(400);
  });

  it('enforces Owner/Admin write guard on checkout', async () => {
    setViewerEmail('eloise@justevery.com'); // Billing role
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_123',
        successUrl: 'https://app.local/success',
        cancelUrl: 'https://app.local/cancel',
      }),
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(403);
  });

  it('creates a portal session for Admin role', async () => {
    const env = createMockEnv();
    queueStripeResponse({ url: 'https://billing.stripe.com/session' });

    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnUrl: 'https://app.local/account' }),
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const data = await parseJson<{ url: string }>(response);
    expect(data.url).toMatch(/billing/);
  });

  it('validates portal payload', async () => {
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/portal', { method: 'POST' });

    const response = await runFetch(request, env);
    expect(response.status).toBe(400);
  });

  it('returns invoices for Billing+ read access', async () => {
    setViewerEmail('eloise@justevery.com'); // Billing role
    const env = createMockEnv();
    queueStripeResponse({
      data: [
        {
          id: 'in_123',
          number: 'INV-001',
          status: 'paid',
          amount_due: 5000,
          amount_paid: 5000,
          currency: 'usd',
          hosted_invoice_url: 'https://stripe.com/invoice',
          invoice_pdf: 'https://stripe.com/invoice.pdf',
        },
      ],
    });

    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/invoices');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    const data = await parseJson<{
      invoices: Array<{ id: string; amountDue: number }>;
    }>(response);
    expect(data.invoices).toHaveLength(1);
    expect(data.invoices[0]).toMatchObject({ id: 'in_123', amountDue: 5000 });
  });

  it('enforces Billing+ guard on invoices', async () => {
    setViewerEmail('tara@aerionlabs.com'); // Viewer role
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/invoices');

    const response = await runFetch(request, env);
    expect(response.status).toBe(403);
  });

  it('returns enriched billing products for Owner/Admin', async () => {
    setViewerEmail('ava@justevery.com');
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/products');

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const data = await parseJson<{ products: Array<Partial<BillingProduct>> }>(response);
    expect(Array.isArray(data.products)).toBe(true);
    expect(data.products[0]).toHaveProperty('priceId');
    expect(data.products[0]).toHaveProperty('currency');
    expect(data.products[0]).toHaveProperty('interval');
  });

  it('rejects billing products for unauthenticated viewers', async () => {
    mockRequireSession.mockResolvedValue({ ok: false, reason: 'missing_cookie' } as const);
    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/products');
    const env = createMockEnv();

    const response = await runFetch(request, env);
    expect(response.status).toBe(401);
  });

  it('propagates Stripe failures when listing invoices', async () => {
    setViewerEmail('eloise@justevery.com');
    const env = createMockEnv();
    queueStripeResponse('internal error', 500);

    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/invoices');
    const response = await runFetch(request, env);

    expect(response.status).toBe(502);
  });
});
