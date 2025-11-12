import { test, expect } from '@playwright/test';

const variants = ['quietPulse', 'emberVeil', 'gridGlow', 'orbitTrail', 'pixelBloom', 'prismMist'];

const resolveTestBaseUrl = (): string => {
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

test.describe('dev sidebar starfield', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/sidebar');
  });

  test('variants switch and persist', async ({ page }) => {
    await page.waitForSelector('[data-testid="starfield-variant-quietPulse"]', { timeout: 20000 });
    for (const variant of variants) {
      await page.getByTestId(`starfield-variant-${variant}`).click();
    }
    await page.waitForTimeout(500);
    await page.reload();
    const stored = await page.evaluate(() => localStorage.getItem('justevery.starfield.variant'));
    expect(stored).toBe(variants.at(-1));
  });

  test('reduced motion toggle changes state', async ({ page }) => {
    const toggle = page.getByTestId('motion-toggle');
    await toggle.click();
    await expect(page.getByText(/prefers reduced motion/i)).toBeVisible();
  });

  test('hotspot hover activates locally', async ({ page }) => {
    const card = page.getByTestId('sidebar-card');
    await expect(card).toHaveAttribute('data-hotspot-active', 'false');
    await page.hover('[data-testid="sandbox-nav-overview"]');
    await expect(card).toHaveAttribute('data-hotspot-active', 'true');
  });

  test('feature flag off hides canvas and switcher', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: resolveTestBaseUrl() });
    await context.addInitScript(() => {
      window.__JUSTEVERY_ENV__ = { starfieldEnabled: false };
    });
    await context.route('**/api/runtime-env', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ starfieldEnabled: false }) })
    );
    const page = await context.newPage();
    await page.goto('/dev/sidebar');
    await expect(page.getByTestId('starfield-switcher')).toHaveCount(0);
    await expect(page.locator('canvas[data-testid^="starfield-layer-"]')).toHaveCount(0);
    await context.close();
  });

  test('data saver + coarse pointer forces static mode', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: resolveTestBaseUrl() });
    await context.addInitScript(() => {
      const connection = {
        saveData: true,
        addEventListener() {},
        removeEventListener() {},
      };
      Object.defineProperty(navigator, 'connection', {
        value: connection,
        configurable: true,
      });
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query === '(pointer: coarse)') {
          const listeners = new Set();
          return {
            matches: true,
            media: query,
            onchange: null,
            addEventListener(type, handler) {
              if (type === 'change') {
                listeners.add(handler);
              }
            },
            removeEventListener(type, handler) {
              if (type === 'change') {
                listeners.delete(handler);
              }
            },
            addListener(handler) {
              listeners.add(handler);
            },
            removeListener(handler) {
              listeners.delete(handler);
            },
            dispatchEvent() {
              return true;
            },
          };
        }
        return originalMatchMedia(query);
      };
    });
    const page = await context.newPage();
    await page.goto('/dev/sidebar');
    const staticCanvas = page.locator('canvas[data-starfield-mode="static"]').first();
    await expect(staticCanvas).toBeVisible();
    await expect(staticCanvas).toHaveAttribute('data-starfield-mode', 'static');
    await page.hover('[data-testid="sandbox-nav-overview"]');
    await page.waitForTimeout(200);
    await expect(staticCanvas).toHaveAttribute('data-starfield-mode', 'static');
    await context.close();
  });
});
