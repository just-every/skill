#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const ROUTES = ['/', '/login', '/payments'];
const OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'screenshots');
const ENV_FILES = ['.env.local.generated', '.env'];
const MAX_ATTEMPTS = 3;
const NAVIGATION_TIMEOUT = 20000;

function readEnvValue(key) {
  if (process.env[key]) return process.env[key];
  for (const candidate of ENV_FILES) {
    try {
      const contents = fs.readFileSync(path.resolve(process.cwd(), candidate), 'utf8');
      const value = extractEnvValue(contents, key);
      if (value) return value;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`warning: unable to read ${candidate}: ${error.message}`);
      }
    }
  }
  return null;
}

function extractEnvValue(contents, key) {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [rawKey, ...rest] = trimmed.split('=');
    const normalizedKey = rawKey.replace(/^export\s+/i, '').trim();
    if (normalizedKey !== key) continue;
    const rawValue = rest.join('=').trim();
    return rawValue.replace(/^['"]/, '').replace(/['"]$/, '');
  }
  return null;
}

function slugify(route) {
  if (!route || route === '/') return 'home';
  return route
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'route';
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureRoute(browser, baseUrl, route, stamp) {
  const target = new URL(route, baseUrl).toString();
  const destination = path.join(OUTPUT_DIR, `${slugify(route)}-${stamp}.png`);
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    try {
      await page.goto(target, { waitUntil: 'networkidle', timeout: NAVIGATION_TIMEOUT });
      await page.waitForTimeout(800);
      await page.screenshot({ path: destination, fullPage: true });
      console.log(`captured ${route} -> ${path.relative(process.cwd(), destination)}`);
      await context.close();
      return;
    } catch (error) {
      lastError = error;
      await context.close();
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`retrying ${route}: ${error.message}`);
        await delay(1000);
      }
    }
  }

  throw new Error(lastError ? lastError.message : `failed to capture ${route}`);
}

async function main() {
  const landingUrl = readEnvValue('LANDING_URL');
  if (!landingUrl) {
    throw new Error('LANDING_URL is not set. Export it or add it to .env/.env.local.generated');
  }

  let base;
  try {
    base = new URL(landingUrl);
  } catch (error) {
    throw new Error(`LANDING_URL must be a fully qualified URL (received "${landingUrl}")`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const stamp = timestamp();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const route of ROUTES) {
      await captureRoute(browser, base, route, stamp);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
