#!/usr/bin/env node
/*
 * Session persistence harness
 * Logs better-auth.session_token across login + repeated reloads.
 * Env:
 *   APP_ORIGIN (default http://127.0.0.1:9788)
 *   LOGIN_ORIGIN (default https://login.justevery.com)
 *   TEST_LOGIN_EMAIL / TEST_LOGIN_PASSWORD (required for hosted login)
 *   RELOADS (default 3)
 */
import { chromium } from '@playwright/test';

const APP_ORIGIN = process.env.APP_ORIGIN || process.env.E2E_BASE_URL || 'http://127.0.0.1:9788';
const LOGIN_ORIGIN = process.env.LOGIN_ORIGIN || 'https://login.justevery.com';
const EMAIL = process.env.TEST_LOGIN_EMAIL;
const PASSWORD = process.env.TEST_LOGIN_PASSWORD;
const DEV_TOKEN = process.env.DEV_SESSION_TOKEN || 'devtoken';
const RELOADS = Number(process.env.RELOADS || '3');
const SKIP_UI = process.env.LOGIN_SKIP_UI === '1' || process.env.LOGIN_SKIP_UI === 'true';

if (!EMAIL || !PASSWORD) {
  console.warn('TEST_LOGIN_EMAIL/TEST_LOGIN_PASSWORD not set; will try DEV_SESSION_TOKEN bootstrap instead');
}

const mask = (value) => {
  if (!value) return '';
  if (value.length <= 8) return `${value[0]}***${value[value.length - 1]}`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
};

async function logCookies(context, step) {
  const cookies = await context.cookies();
  const auth = cookies.find((c) => c.name === 'better-auth.session_token');
  console.log(JSON.stringify({
    step,
    sessionCookie: auth
      ? { name: auth.name, domain: auth.domain, path: auth.path, secure: auth.secure, sameSite: auth.sameSite, expires: auth.expires, value: mask(auth.value) }
      : null,
    allCookies: cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path, secure: c.secure, sameSite: c.sameSite })),
  }));
  if (!auth) {
    throw new Error(`Session cookie missing at step ${step}`);
  }
}

async function waitForSessionCookie(context, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const cookies = await context.cookies();
    const auth = cookies.find((c) => c.name === 'better-auth.session_token');
    if (auth) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timed out waiting for better-auth.session_token');
}

async function maybeCompleteLogin(page) {
  if (!EMAIL || !PASSWORD) return;
  if (!page.url().startsWith(LOGIN_ORIGIN)) return;

  const emailInput = page.locator('form[data-form="login"] input[name="email"]');
  const passwordInput = page.locator('form[data-form="login"] input[name="password"]');
  const submitButton = page.locator('form[data-form="login"] button[type="submit"], form[data-form="login"] button');

  await emailInput.waitFor({ timeout: 10_000 });
  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  await submitButton.click({ timeout: 10_000 });

  // Wait for session cookie to appear (HttpOnly, so poll via context cookies)
  await waitForSessionCookie(page.context(), 20000);
}

async function devBootstrap(context) {
  console.log('Attempting dev bootstrap via /api/session/bootstrap');
  const res = await context.request.post(`${APP_ORIGIN}/api/session/bootstrap`, {
    data: { token: DEV_TOKEN },
  });
  if (!res.ok()) {
    throw new Error(`dev bootstrap failed with ${res.status()}`);
  }
  await logCookies(context, 'dev-bootstrap');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  if (SKIP_UI || !EMAIL || !PASSWORD) {
    await devBootstrap(context);
  } else {
    await page.goto(LOGIN_ORIGIN, { waitUntil: 'networkidle' });
    await maybeCompleteLogin(page);
    await logCookies(context, 'post-login');
  }

  await page.goto(`${APP_ORIGIN}/app`, { waitUntil: 'networkidle' });
  await logCookies(context, 'post-app-load');

  for (let i = 1; i <= RELOADS; i += 1) {
    await page.reload({ waitUntil: 'networkidle' });
    await logCookies(context, `reload-${i}`);
  }

  await browser.close();
  console.log('session harness complete');
}

main().catch((error) => {
  console.error('session harness failed', error);
  process.exit(1);
});
