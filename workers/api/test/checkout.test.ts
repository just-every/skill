import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockEnv,
  mockRequireSession,
  runFetch,
  setupTestWorker,
  setViewerEmail,
} from './helpers';
import { BillingCheckoutError, createBillingCheckout } from '@justevery/login-client/billing';

const realFetch = globalThis.fetch;

vi.mock('@justevery/login-client/billing', async () => {
  const actual = await vi.importActual<typeof import('@justevery/login-client/billing')>('@justevery/login-client/billing');
  return {
    ...actual,
    createBillingCheckout: vi.fn(),
  };
});

const checkoutMock = vi.mocked(createBillingCheckout);

describe('Stripe billing checkout & portal', () => {
  let worker: Awaited<ReturnType<typeof setupTestWorker>>['worker'];

  beforeEach(async () => {
    ({ worker } = await setupTestWorker());
    setViewerEmail('ava@justevery.com');
    checkoutMock.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    mockRequireSession.mockReset();
  });

  it('creates a checkout session when priceId is provided', async () => {
    const env = createMockEnv();
    checkoutMock.mockResolvedValue({
      organizationId: 'acct-justevery',
      checkoutRequestId: 'chk_req_123',
      sessionId: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
      priceId: 'price_launch_monthly',
      productCode: 'Launch',
    });

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
      checkoutRequestId: 'chk_req_123',
    });

    expect(checkoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: env.BILLING_CHECKOUT_TOKEN,
        priceId: 'price_launch_monthly',
        quantity: 2,
        organizationId: 'acct-justevery',
        successUrl: 'https://app.local/success',
        cancelUrl: 'https://app.local/cancel',
      })
    );
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
    expect(checkoutMock).not.toHaveBeenCalled();
  });

  it('surfaces errors when Stripe rejects checkout', async () => {
    const env = createMockEnv();
    checkoutMock.mockRejectedValueOnce(
      new BillingCheckoutError('invalid redirect', {
        status: 400,
        code: 'invalid_redirect_origin',
        body: { error: 'invalid_redirect_origin' },
      })
    );

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
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({ error: 'invalid_redirect_origin' });
    expect(checkoutMock).toHaveBeenCalledTimes(1);
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
    expect(checkoutMock).not.toHaveBeenCalled();
  });
});
