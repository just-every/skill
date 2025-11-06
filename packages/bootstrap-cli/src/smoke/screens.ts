import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

export interface SmokeScreensOptions {
  baseUrl: string;
  routes: string[];
  bearerToken?: string | null;
  outputRoot?: string;
  stamp?: string;
  headless?: boolean;
}

export interface SmokeScreensResult {
  runDir: string;
  manifestPath: string;
  screenshots: Array<{ route: string; status: number | null; screenshot: string }>;
}

const DEFAULT_OUTPUT_ROOT = join('test-results', 'smoke');

export async function captureSmokeScreens(options: SmokeScreensOptions): Promise<SmokeScreensResult> {
  const outputRoot = resolve(options.outputRoot ?? DEFAULT_OUTPUT_ROOT);
  const stamp = options.stamp ?? timestamp();
  const runDir = join(outputRoot, stamp);
  const screenDir = join(runDir, 'screens');
  fs.mkdirSync(screenDir, { recursive: true });

  const browser = await chromium.launch({ headless: options.headless ?? true });
  const screenshots: Array<{ route: string; status: number | null; screenshot: string }> = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 768 },
      extraHTTPHeaders: options.bearerToken ? { Authorization: `Bearer ${options.bearerToken}` } : undefined
    });

    for (const route of options.routes) {
      const screenshotPath = join(screenDir, `${slugify(route)}.png`);
      const result = await captureRoute(context, options.baseUrl, route, screenshotPath);
      screenshots.push({
        route,
        status: result.status,
        screenshot: screenshotPath
      });
    }

    await context.close();

    const manifest = {
      baseUrl: options.baseUrl,
      routes: screenshots.map((entry) => ({
        route: entry.route,
        status: entry.status,
        screenshot: entry.screenshot
      })),
      generatedAt: new Date().toISOString()
    };

    const manifestPath = join(runDir, 'screens-manifest.json');
    await fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    return { runDir, manifestPath, screenshots };
  } finally {
    await browser.close();
  }
}

async function captureRoute(context: import('@playwright/test').BrowserContext, baseUrl: string, route: string, destination: string) {
  const page = await context.newPage();
  let status: number | null = null;
  let errorMessage: string | undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.goto(new URL(route, baseUrl).toString(), {
        waitUntil: 'networkidle',
        timeout: 25000
      });
      status = response ? response.status() : null;
      await page.waitForTimeout(800);
      await page.screenshot({ path: destination, fullPage: true });
      await page.close();
      return { status };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      await page.close().catch(() => {});
      if (attempt < 3) {
        await delay(1000);
      }
    }
  }

  throw new Error(errorMessage || `failed to capture ${route}`);
}

function slugify(route: string): string {
  if (!route || route === '/') return 'home';
  return route.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'route';
}

function timestamp(): string {
  const date = new Date();
  const pad = (num: number) => String(num).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
