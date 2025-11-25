import { expect, test } from '@playwright/test';

const allowOpenE2E = process.env.RUN_OPEN_E2E === 'true';
const baseURL =
  process.env.E2E_BASE_URL ??
  process.env.PROJECT_DOMAIN ??
  'http://127.0.0.1:9788';

test('checkout endpoint responds', async ({ request }) => {
  test.skip(!allowOpenE2E, 'Open E2E checkout check disabled (set RUN_OPEN_E2E=true)');
  const response = await request.get(new URL('/checkout', baseURL).toString(), {
    failOnStatusCode: false,
  });
  expect(response.status()).toBe(200);
});
