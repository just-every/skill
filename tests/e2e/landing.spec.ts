import { expect, test } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? process.env.LANDING_URL ?? 'https://demo.justevery.com';

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
  expect(response.status()).toBe(200);
});

test('Stripe products endpoint responds', async ({ request }) => {
  const response = await request.get(new URL('/api/stripe/products', baseURL).toString(), {
    failOnStatusCode: false,
  });
  expect(response.status()).toBe(200);
});
