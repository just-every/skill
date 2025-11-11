import { expect, test, type Page, type TestInfo } from '@playwright/test';

const resolveBaseUrl = () => {
  const raw = process.env.E2E_BASE_URL ?? process.env.PROJECT_DOMAIN;
  if (raw) {
    try {
      return new URL(raw).toString();
    } catch {
      const trimmed = raw.replace(/^https?:\/\//, '');
      return `https://${trimmed}`;
    }
  }
  return 'http://127.0.0.1:8787';
};

const baseUrl = resolveBaseUrl();
const sessionCookie = process.env.TEST_SESSION_COOKIE;
const domain = new URL(baseUrl).hostname;

const addAuthCookie = async (page: Page) => {
  if (!sessionCookie) {
    throw new Error('Authenticated test requires TEST_SESSION_COOKIE');
  }
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: 'better-auth.session_token',
      value: sessionCookie,
      domain,
      path: '/',
      sameSite: 'None',
      secure: true,
    },
  ]);
};

const screenshotShared = async (page: Page, testInfo: TestInfo, suffix: string) => {
  const file = testInfo.outputPath(`${suffix}.png`);
  await page.screenshot({ path: file, fullPage: true });
};

const interceptMemberPatch = async (page: Page) => {
  const patches: Array<{ url: string; payload: Record<string, unknown> }> = [];
  await page.route('**/api/accounts/*/members/*', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      let payload: Record<string, unknown> = {};
      try {
        payload = request.postDataJSON() ?? {};
      } catch {
        payload = {};
      }
      patches.push({ url: request.url(), payload });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    await route.continue();
  });
  return () => patches;
};

const interceptAccountPatch = async (page: Page) => {
  const requests: Array<{ url: string; payload: Record<string, unknown> }> = [];
  await page.route('**/api/accounts/*', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      let payload: Record<string, unknown> = {};
      try {
        payload = request.postDataJSON() ?? {};
      } catch {
        payload = {};
      }
      requests.push({ url: request.url(), payload });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    await route.continue();
  });
  return () => requests;
};

const interceptBillingCheckout = async (page: Page) => {
  let responseUrl = '';
  await page.route('**/billing/checkout', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      responseUrl = 'https://checkout.stripe.com/test';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: 'cs_test', url: responseUrl }),
      });
      return;
    }
    await route.continue();
  });
  return () => responseUrl;
};

test.describe('Authenticated dashboard flows', () => {
  test.skip(!sessionCookie, 'TEST_SESSION_COOKIE not provided');

  test('renders /app and exercises sidebar, team, and billing flows', async ({ page }, testInfo) => {
    await addAuthCookie(page);
    const getMemberPatches = await interceptMemberPatch(page);
    const getAccountPatches = await interceptAccountPatch(page);
    const getCheckoutUrl = await interceptBillingCheckout(page);

    await page.goto(new URL('/app', baseUrl).toString(), { waitUntil: 'networkidle' });
    await expect(page.getByText('Plan summary')).toBeVisible();

    const accountToggle = page.getByTestId('account-menu-toggle');
    await accountToggle.click();
    await expect(page.getByText('Signed in as')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /logout/i })).toBeVisible();

    const companyToggle = page.getByTestId('company-switcher-toggle');
    await companyToggle.hover();
    const switcherMenu = page.getByTestId('company-switcher-menu');
    await expect(switcherMenu).toBeVisible();
    await page.waitForTimeout(300);
    await screenshotShared(page, testInfo, 'sidebar');

    await page.getByTestId('nav-team').click();
    await expect(page.getByText('Team members')).toBeVisible();
    const firstRow = page.locator('[data-testid^="team-member-row-"]').first();
    const memberId = await firstRow.getAttribute('data-member-id');
    if (!memberId) {
      throw new Error('Unable to resolve a team member row');
    }

    const getEditButton = () => page.getByTestId(`team-member-edit-${memberId}`);
    const getNameInput = () => page.getByTestId(`team-member-name-input-${memberId}`);
    const getSaveButton = () => page.getByTestId(`team-member-save-${memberId}`);

    const nameDisplay = page.getByTestId(`team-member-name-${memberId}`);
    const originalName = (await nameDisplay.textContent())?.trim() ?? 'Team member';
    const updatedName = `${originalName} (Playwright)`;

    await getEditButton().click();
    await getNameInput().fill(updatedName);
    await getSaveButton().click();
    await expect.poll(() => getMemberPatches().some((entry) => entry.payload.name === updatedName)).toBe(true);

    await getEditButton().click();
    await getNameInput().fill(originalName);
    await getSaveButton().click();
    await expect.poll(() => getMemberPatches().some((entry) => entry.payload.name === originalName)).toBe(true);

    const currentRole = (await page
      .getByTestId(`team-member-current-role-${memberId}`)
      .textContent())
      ?.trim();
    const roleOptions = ['Admin', 'Billing', 'Viewer'];
    const targetRole = roleOptions.find((role) => role !== currentRole) ?? roleOptions[0];
    await page.getByTestId(`team-member-role-${memberId}-${targetRole}`).click();
    await expect.poll(() => getMemberPatches().some((entry) => entry.payload.role === targetRole)).toBe(true);

    await screenshotShared(page, testInfo, 'team-screen');

    await page.getByTestId('nav-billing').click();
    await expect(page.getByText('Billing contact')).toBeVisible();

    const billingEmailDisplay = page.getByTestId('billing-contact-value');
    const rawEmail = (await billingEmailDisplay.textContent())?.trim() ?? '';
    const sanitizedOriginalEmail = rawEmail || 'billing@your-company.com';
    const updatedEmail = sanitizedOriginalEmail.includes('@')
      ? sanitizedOriginalEmail.replace('@', '+playwright@')
      : 'billing+playwright@justevery.com';

    await page.getByTestId('billing-contact-edit').click();
    await page.getByTestId('billing-contact-input').fill(updatedEmail);
    await page.getByTestId('billing-contact-save').click();
    await expect.poll(() =>
      getAccountPatches().some((entry) => entry.payload.billingEmail === updatedEmail),
    ).toBe(true);

    await page.getByTestId('billing-contact-edit').click();
    await page.getByTestId('billing-contact-input').fill(sanitizedOriginalEmail);
    await page.getByTestId('billing-contact-save').click();
    await expect.poll(() =>
      getAccountPatches().some((entry) => entry.payload.billingEmail === sanitizedOriginalEmail),
    ).toBe(true);

    const productButtons = page.locator('[data-testid^="billing-product-select-"]').filter({ hasText: 'Select' });
    await expect(productButtons.first()).toBeVisible();
    await productButtons.first().click();
    await expect.poll(() => Boolean(getCheckoutUrl())).toBe(true);
    expect(getCheckoutUrl()).toContain('https://checkout.stripe.com');

    await screenshotShared(page, testInfo, 'billing-screen');
  });
});
