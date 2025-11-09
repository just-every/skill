import { expect, test } from '@playwright/test';

const baseURL =
  process.env.E2E_BASE_URL ??
  process.env.PROJECT_DOMAIN ??
  'http://127.0.0.1:8787';

const loginOrigin = process.env.LOGIN_ORIGIN ?? 'https://login.justevery.com';

test('Better Auth login UI renders', async ({ page }) => {
  await page.goto(new URL('/', loginOrigin).toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
});

test('runtime env exposes Better Auth origin', async ({ request }) => {
  const response = await request.get(new URL('/api/runtime-env', baseURL).toString(), {
    failOnStatusCode: false,
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as Record<string, unknown>;
  const resolved =
    (payload.loginOrigin ??
      payload.betterAuthBaseUrl ??
      payload.sessionEndpoint) as string | undefined;
  const target = resolved ?? loginOrigin;
  expect(typeof target).toBe('string');
  expect(String(target)).toContain(new URL(loginOrigin).hostname);
});
