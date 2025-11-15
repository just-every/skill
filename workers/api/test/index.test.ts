import test from 'node:test';
import assert from 'node:assert/strict';

import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

const ctx = {} as ExecutionContext;

type FetcherOverride = Env['ASSETS'];

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const fallbackAssets: FetcherOverride = {
    fetch: async () => new Response('Not Found', { status: 404 }),
  } as FetcherOverride;

  return {
    LOGIN_ORIGIN: 'https://login.justevery.com',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://starter.justevery.com',
    STRIPE_PRODUCTS: '[]',
    EXPO_PUBLIC_WORKER_ORIGIN: 'https://app.local',
    ASSETS: overrides.ASSETS ?? fallbackAssets,
    STORAGE: overrides.STORAGE,
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

test('status endpoint responds with ok payload', async () => {
  const env = createMockEnv();
  const response = await runFetch(new Request('https://example.com/api/status'), env);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { status: string; workerOrigin: string | null };
  assert.equal(body.status, 'ok');
  assert.equal(body.workerOrigin, 'https://app.local');
});

test('stripe products endpoint normalizes entries', async () => {
  const env = createMockEnv({
    STRIPE_PRODUCTS: JSON.stringify([
      { priceId: ' price_launch ', name: ' Launch ', unitAmount: 2100, currency: 'USD', interval: 'monthly' },
      { id: 'legacy', priceId: 'legacy:plan', unitAmount: 999, currency: 'usd' },
    ]),
  });
  const response = await runFetch(new Request('https://example.com/api/stripe/products'), env);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { products: Array<Record<string, unknown>> };
  assert.equal(body.products.length, 1);
  const [product] = body.products;
  assert.equal(product.name, 'Launch');
  assert.equal(product.priceId, 'price_launch');
  assert.equal(product.currency, 'usd');
  assert.equal(product.unitAmount, 2100);
});

test('landing fallback injects runtime shim when ASSETS missing', async () => {
  const env = createMockEnv({ ASSETS: undefined });
  const response = await runFetch(new Request('https://example.com/'), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /justevery-runtime-shim/);
  assert.match(html, /Open the app/);
});
