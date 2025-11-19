import { expect, test } from '@playwright/test';

const baseURL =
  process.env.E2E_BASE_URL ??
  process.env.PROJECT_DOMAIN ??
  'http://127.0.0.1:8787';

const loginOrigin = process.env.LOGIN_ORIGIN ?? 'https://login.justevery.com';
const email = process.env.TEST_LOGIN_EMAIL;
const password = process.env.TEST_LOGIN_PASSWORD;

const hasCreds = Boolean(email && password);

test.describe('Profile popup integration (hosted login)', () => {
  test.skip(!hasCreds, 'Set TEST_LOGIN_EMAIL/TEST_LOGIN_PASSWORD to run this spec');

  test('login, open popup, and wrapper routes trigger hosted popup', async ({ page }) => {
    const appUrl = new URL('/app', baseURL).toString();

    await page.goto(appUrl, { waitUntil: 'networkidle' });

    // If redirected to login, complete the form
    if (page.url().startsWith(loginOrigin)) {
      const emailInput = page.getByLabel(/email/i);
      const passwordInput = page.getByLabel(/password/i);
      const submitButton = page.getByRole('button', { name: /continue|sign in|log in/i });

      await emailInput.waitFor({ timeout: 10_000 });
      await emailInput.fill(email!);
      await passwordInput.fill(password!);
      await submitButton.click();

      await page.waitForURL(/\/app/, { timeout: 20_000 });
    }

    // Open account menu -> Manage login profile
    await page.getByLabel('Account options').click({ timeout: 10_000 });
    await page.getByRole('button', { name: /manage login profile/i }).click();

    const popupFrame = await waitForProfileFrame(page);
    expect(popupFrame).toBeTruthy();

    // Wrapper routes should auto-open popup to relevant sections
    for (const route of ['team', 'billing', 'settings']) {
      await page.goto(new URL(`/app/${route}`, baseURL).toString(), { waitUntil: 'networkidle' });
      const frame = await waitForProfileFrame(page);
      expect(frame).toBeTruthy();
    }
  });
});

async function waitForProfileFrame(page: import('@playwright/test').Page) {
  // profile-popup.js injects an iframe with /profile?embed=1
  return await page.waitForSelector('iframe[src*="/profile"]', { timeout: 15_000 }).catch(() => null);
}

