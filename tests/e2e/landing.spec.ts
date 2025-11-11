import { expect, test } from '@playwright/test';

const allowOpenE2E = Boolean(process.env.TEST_SESSION_COOKIE) || process.env.RUN_OPEN_E2E === 'true';
const baseURL =
  process.env.E2E_BASE_URL ??
  process.env.PROJECT_DOMAIN ??
  'http://127.0.0.1:8787';

test.describe('Landing endpoints', () => {
  test.skip(!allowOpenE2E, 'Open E2E endpoint checks disabled (set RUN_OPEN_E2E=true or provide TEST_SESSION_COOKIE)');

  test('landing page responds', async ({ request }) => {
    const response = await request.get(baseURL, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(200);
  });

  test('session endpoint responds', async ({ request }) => {
    const response = await request.get(new URL('/api/session', baseURL).toString(), {
      failOnStatusCode: false,
    });
    expect([200, 401]).toContain(response.status());
  });

  test('Stripe products endpoint responds', async ({ request }) => {
    const response = await request.get(new URL('/api/stripe/products', baseURL).toString(), {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(200);
  });
});
