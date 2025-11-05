#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const DEFAULT_ROUTES = ['/', '/login', '/callback', '/logout', '/app', '/payments'];
const DEFAULT_OUTPUT_DIR = path.join('test-results', 'smoke');
const ENV_FILES = ['.env.local.generated', '.env'];
const NAVIGATION_TIMEOUT = 25000;
const MAX_ATTEMPTS = 3;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (!entry.startsWith('--')) continue;
    const [flag, raw] = entry.split('=');
    const key = flag.slice(2);
    if (raw !== undefined) {
      args[key] = raw;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

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
  return route.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'route';
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureRoute(context, baseUrl, route, destination) {
  const page = await context.newPage();
  let status = null;
  let errorMessage;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await page.goto(new URL(route, baseUrl).toString(), {
        waitUntil: 'networkidle',
        timeout: NAVIGATION_TIMEOUT,
      });
      status = response ? response.status() : null;
      await page.waitForTimeout(800);
      await page.screenshot({ path: destination, fullPage: true });
      await page.close();
      return { status, path: destination };
    } catch (error) {
      errorMessage = error.message;
      await page.close().catch(() => {});
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`retrying ${route}: ${error.message}`);
        await delay(1000);
      }
    }
  }

  throw new Error(errorMessage || `failed to capture ${route}`);
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const baseFromArgs = argv.base || process.env.E2E_BASE_URL || process.env.LANDING_URL || readEnvValue('LANDING_URL');

  if (!baseFromArgs) {
    throw new Error('A base URL is required. Provide --base or set LANDING_URL/E2E_BASE_URL.');
  }

  let baseUrl;
  try {
    const parsed = new URL(baseFromArgs);
    baseUrl = parsed.toString();
  } catch (error) {
    throw new Error(`Invalid base URL: ${baseFromArgs}`);
  }

  const token = argv.token || process.env.SMOKE_BEARER_TOKEN || process.env.LOGTO_TOKEN || readEnvValue('LOGTO_TOKEN');
  const routesArg = argv.routes ? argv.routes.split(',').map((route) => route.trim()).filter(Boolean) : null;
  const routes = (routesArg && routesArg.length ? routesArg : DEFAULT_ROUTES).map((route) => (route.startsWith('/') ? route : `/${route}`));

  const outputRoot = path.resolve(argv.out || DEFAULT_OUTPUT_DIR);
  const stamp = argv.stamp || timestamp();
  const runDir = path.join(outputRoot, stamp);
  const screenDir = path.join(runDir, 'screens');
  fs.mkdirSync(screenDir, { recursive: true });

  const browser = await chromium.launch({ headless: argv.headless !== 'false' });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 768 },
      extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    const manifest = [];
    for (const route of routes) {
      const screenshotPath = path.join(screenDir, `${slugify(route)}.png`);
      const result = await captureRoute(context, baseUrl, route, screenshotPath);
      console.log(`captured ${route} -> ${path.relative(process.cwd(), screenshotPath)} (status ${result.status ?? 'n/a'})`);
      manifest.push({
        route,
        status: result.status,
        screenshot: path.relative(process.cwd(), screenshotPath),
      });
    }

    await context.close();
    await fsp.writeFile(path.join(runDir, 'screens-manifest.json'), JSON.stringify({ baseUrl, routes: manifest, generatedAt: new Date().toISOString() }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
