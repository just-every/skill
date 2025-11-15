import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockEnv,
  mockRequireSession,
  queueStripeResponse,
  runFetch,
  setupTestWorker,
  setViewerEmail,
  stripeRequests,
} from './helpers';

const realFetch = globalThis.fetch;

describe('Stripe billing checkout & portal', () => {
  let worker: Awaited<ReturnType<typeof setupTestWorker>>['worker'];

  beforeEach(async () => {
    ({ worker } = await setupTestWorker());
    setViewerEmail('ava@justevery.com');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    mockRequireSession.mockReset();
  });

  it('creates a checkout session when priceId is provided', async () => {
    const env = createMockEnv();
    queueStripeResponse({ id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' });

    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_launch_monthly',
        quantity: 2,
        successUrl: 'https://app.local/success',
        cancelUrl: 'https://app.local/cancel',
      }),
    });

    const response = await runFetch(worker, request, env);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      sessionId: 'cs_test_123',
      url: expect.stringContaining('checkout.stripe.com'),
    });

    expect(stripeRequests).toHaveLength(1);
    const [stripeCall] = stripeRequests;
    expect(stripeCall.method).toBe('POST');
    const params = Object.fromEntries(new URLSearchParams(stripeCall.body));
    expect(params['line_items[0][price]']).toBe('price_launch_monthly');
    expect(params['line_items[0][quantity]']).toBe('2');
    expect(params.customer).toBe('cus_test_123');
    expect(params['metadata[company_id]']).toBe('acct-justevery');
  });

  it('rejects checkout requests with missing priceId', async () => {
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        successUrl: 'https://app.local/success',
        cancelUrl: 'https://app.local/cancel',
      }),
    });

    const response = await runFetch(worker, request, env);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({ error: 'priceId is required' });
    expect(stripeRequests).toHaveLength(0);
  });

  it('surfaces errors when Stripe rejects checkout', async () => {
    const env = createMockEnv();
    queueStripeResponse({ error: 'invalid_request' }, 400);

    const request = new Request('http://127.0.0.1/api/accounts/justevery/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_launch_monthly',
        successUrl: 'https://app.local/success',
        cancelUrl: 'https://app.local/cancel',
      }),
    });

    const response = await runFetch(worker, request, env);
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toMatchObject({ error: 'Failed to create checkout session' });
    expect(stripeRequests).toHaveLength(1);
  });

  it('blocks non-admin/owner users from checkout and portal', async () => {
    setViewerEmail('eloise@justevery.com');
    const env = createMockEnv();

    const checkoutRequest = new Request('http://127.0.0.1/api/accounts/justevery/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_launch_monthly',
        successUrl: 'https://app.local/success',
        cancelUrl: 'https://app.local/cancel',
      }),
    });

    const checkoutResponse = await runFetch(worker, checkoutRequest, env);
    expect(checkoutResponse.status).toBe(403);

    const portalRequest = new Request('http://127.0.0.1/api/accounts/justevery/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnUrl: 'https://app.local/account' }),
    });

    const portalResponse = await runFetch(worker, portalRequest, env);
    expect(portalResponse.status).toBe(403);
    expect(stripeRequests).toHaveLength(0);
  });
});
