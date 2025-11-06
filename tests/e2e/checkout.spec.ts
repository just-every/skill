import { expect, test } from '@playwright/test';

const baseURL =
  process.env.E2E_BASE_URL ??
  process.env.PROJECT_DOMAIN ??
  'http://127.0.0.1:8787';

test('checkout endpoint responds', async ({ request }) => {
  const response = await request.get(new URL('/checkout', baseURL).toString(), {
    failOnStatusCode: false,
  });
  expect(response.status()).toBe(200);
});
