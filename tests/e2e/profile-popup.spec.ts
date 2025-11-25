import { expect, test } from '@playwright/test';

const baseURL =
  process.env.E2E_BASE_URL ??
  process.env.PROJECT_DOMAIN ??
  'http://127.0.0.1:9788';

const loginOrigin = process.env.LOGIN_ORIGIN ?? 'https://login.justevery.com';
const email = process.env.TEST_LOGIN_EMAIL;
const password = process.env.TEST_LOGIN_PASSWORD;

const hasCreds = Boolean(email && password);

test.describe('Profile popup integration (hosted login)', () => {
  test.skip(!hasCreds, 'Set TEST_LOGIN_EMAIL/TEST_LOGIN_PASSWORD to run this spec');

  test('manage login profile + Team & Settings wrappers load hosted popup and recover UI', async ({ page }) => {
    await navigateToApp(page);
    await completeHostedLoginIfNeeded(page);

    // Manage login profile from account menu
    await page.getByLabel('Account options').click({ timeout: 10_000 });
    await page.getByRole('button', { name: /manage login profile/i }).click();
    await assertHostedPopupFrame(page, 'account menu manage profile');

    // Team wrapper: should show the loading state, retry, then allow going back
    await gotoAppRoute(page, 'team');
    const teamOpening = page.getByText(/Opening team in your account profile/i);
    await expect(teamOpening).toBeVisible();
    await assertHostedPopupFrame(page, 'team auto-open');
    await page.getByRole('button', { name: /^Retry$/i }).click();
    await assertHostedPopupFrame(page, 'team retry');
    await page.getByRole('button', { name: /Back to overview/i }).click();
    await expect(page).toHaveURL(/\/app\/overview$/);
    await expect(page.getByText(/Opening team/i)).toHaveCount(0);

    // Settings wrapper: verify retry/back clears the local loading view as well
    await gotoAppRoute(page, 'settings');
    const settingsOpening = page.getByText(/Opening settings in your account profile/i);
    await expect(settingsOpening).toBeVisible();
    await assertHostedPopupFrame(page, 'settings auto-open');
    await page.getByRole('button', { name: /^Retry$/i }).click();
    await assertHostedPopupFrame(page, 'settings retry');
    await page.getByRole('button', { name: /Back to overview/i }).click();
    await expect(page).toHaveURL(/\/app\/overview$/);
    await expect(page.getByText(/Opening settings/i)).toHaveCount(0);
  });
});

async function waitForProfileFrame(page: import('@playwright/test').Page) {
  // profile-popup.js injects an iframe with /profile?embed=1
  return await page.waitForSelector('iframe[src*="/profile"]', { timeout: 15_000 }).catch(() => null);
}

async function navigateToApp(page: import('@playwright/test').Page) {
  await page.goto(new URL('/app', baseURL).toString(), { waitUntil: 'networkidle' });
}

async function completeHostedLoginIfNeeded(page: import('@playwright/test').Page) {
  if (!page.url().startsWith(loginOrigin)) {
    return;
  }

  const emailInput = page.getByLabel(/email/i);
  const passwordInput = page.getByLabel(/password/i);
  const submitButton = page.getByRole('button', { name: /continue|sign in|log in/i });

  await emailInput.waitFor({ timeout: 10_000 });
  await emailInput.fill(email!);
  await passwordInput.fill(password!);
  await submitButton.click();

  await page.waitForURL(/\/app/, { timeout: 20_000 });
}

async function gotoAppRoute(page: import('@playwright/test').Page, route: string) {
  await page.goto(new URL(`/app/${route}`, baseURL).toString(), { waitUntil: 'networkidle' });
}

async function assertHostedPopupFrame(page: import('@playwright/test').Page, context: string) {
  const frame = await waitForProfileFrame(page);
  expect(frame, `Expected hosted popup iframe for ${context}`).toBeTruthy();
}
