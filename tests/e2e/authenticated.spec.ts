import { expect, test } from '@playwright/test';

const loginOrigin = process.env.LOGIN_ORIGIN ?? 'https://login.justevery.com';

test.describe('Better Auth session surface', () => {
  test('session endpoint allows credentialed fetches', async ({ request }) => {
    const response = await request.get(new URL('/api/auth/session', loginOrigin).toString(), {
      failOnStatusCode: false,
    });
    expect(response.status()).toBeGreaterThan(0);
    const allowCredentials = response.headers()['access-control-allow-credentials'];
    expect(allowCredentials).toBe('true');
    const exposeHeaders = response.headers()['access-control-expose-headers'] ?? '';
    expect(exposeHeaders.toLowerCase()).toContain('set-cookie');
  });

  test('sign-out endpoint responds from login worker', async ({ request }) => {
    const response = await request.post(new URL('/api/auth/sign-out', loginOrigin).toString(), {
      failOnStatusCode: false,
    });
    expect(response.url()).toContain(new URL(loginOrigin).host);
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(500);
  });
});
