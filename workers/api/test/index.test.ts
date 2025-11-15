import { describe, expect, it, vi } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const defaultStorage: R2Bucket = {
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false, delimitedPrefixes: [] }),
    get: vi.fn(),
    getWithMetadata: vi.fn(),
    head: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as R2Bucket;

  const prepare = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true, meta: {} }),
    all: vi.fn().mockResolvedValue({ success: true, results: [] }),
    raw: vi.fn(),
  });
  const defaultDb: D1Database = {
    prepare,
    dump: vi.fn(),
    batch: vi.fn(),
  } as unknown as D1Database;

  const assetsFetcher = {
    fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
  };

  const hasStorageOverride = Object.prototype.hasOwnProperty.call(overrides, 'STORAGE');
  const hasDbOverride = Object.prototype.hasOwnProperty.call(overrides, 'DB');

  const env: Partial<Env> = {
    LOGIN_ORIGIN: 'https://login.justevery.com',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://app.example.com',
    STRIPE_PRODUCTS: '[]',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    EXPO_PUBLIC_WORKER_ORIGIN: 'https://app.example.com',
    ASSETS: assetsFetcher as unknown as Env['ASSETS'],
  };

  const storage = hasStorageOverride ? overrides.STORAGE : defaultStorage;
  const db = hasDbOverride ? overrides.DB : defaultDb;

  if (storage) {
    env.STORAGE = storage;
  }
  if (db) {
    env.DB = db;
  }

  return {
    ...env,
    ...overrides,
  } as Env;
}

const ctx = {} as ExecutionContext;

async function runFetch(
  request: Request,
  env: Env,
): Promise<Response> {
  const handler = Worker.fetch;
  if (!handler) {
    throw new Error('Expected Worker.fetch to be defined');
  }
  return handler(
    request as Request<unknown, IncomingRequestCfProperties<unknown>>,
    env,
    ctx,
  );
}

describe('Worker routes', () => {
  it('returns landing page HTML for root route when no ASSETS binding', async () => {
    const env = createMockEnv({ ASSETS: undefined });
    const request = new Request('https://example.com/');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('Launch your product');
  });

  it('serves prerendered HTML for root route when ASSETS provides it', async () => {
    const prerenderHtml = '<!DOCTYPE html><html><head><title>Prerendered</title></head><body>Prerendered content</body></html>';
    const fetchMock = vi.fn(async (input: Request | string) => {
      const requestUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (requestUrl.includes('/prerendered/index.html')) {
        return new Response(prerenderHtml, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const env = createMockEnv({
      ASSETS: { fetch: fetchMock } as unknown as Env['ASSETS'],
    });

    const request = new Request('https://example.com/', {
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    const text = await response.text();
    expect(text).toContain('Prerendered content');
    expect(text).toContain('window.__JUSTEVERY_ENV__');
    expect(response.headers.get('x-prerender-route')).toBe('/');
    expect(response.headers.get('x-prerender-asset')).toBe('/prerendered/index.html');
  });

  it('rejects Stripe webhook without signature', async () => {
    const env = createMockEnv();
    const request = new Request('https://example.com/webhook/stripe', {
      method: 'POST',
      body: JSON.stringify({ type: 'test.event' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await runFetch(request, env);

    expect(response.status).toBe(400);
  });

  it('handles Stripe webhook without D1 binding', async () => {
    const env = createMockEnv({ DB: undefined });
    const request = new Request('https://example.com/webhook/stripe', {
      method: 'POST',
      body: JSON.stringify({ type: 'test.event' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(400);
  });

  it('proxies static asset requests to the ASSETS binding', async () => {
    const assetBody = 'console.log("hello");';
    const fetchMock = vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/_expo/static/js/web/app.js')) {
        return new Response(assetBody, {
          status: 200,
          headers: { 'content-type': 'application/javascript' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const env = createMockEnv({
      ASSETS: { fetch: fetchMock } as unknown as Env['ASSETS'],
    });

    const request = new Request('https://example.com/_expo/static/js/web/app.js');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(assetBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves the SPA shell for app routes when assets are available', async () => {
    const fetchMock = vi.fn(async (input: Request | string) => {
      const requestUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (requestUrl.endsWith('/index.html')) {
        return new Response('<html><head></head><body>app shell</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const env = createMockEnv({
      APP_BASE_URL: '/app',
      EXPO_PUBLIC_WORKER_ORIGIN: 'https://example.com',
      ASSETS: { fetch: fetchMock } as unknown as Env['ASSETS'],
    });

    const request = new Request('https://example.com/app');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    const text = await response.text();
    expect(text).toContain('app shell');
    expect(text).toContain('window.__JUSTEVERY_ENV__');
    expect(text).toContain('loginOrigin');
    const cacheControl = response.headers.get('cache-control');
    expect(cacheControl).toBe('no-store, max-age=0');
  });

  it('landing page fallback includes runtime shim and Expo bundle as classic script', async () => {
    const indexHtml = `<!DOCTYPE html>
<html><head><title>Test</title></head>
<body><script src="/_expo/static/js/web/index-abc123.js" defer></script></body>
</html>`;

    const fetchMock = vi.fn(async (input: Request | string) => {
      const requestUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

      if (requestUrl.includes('/prerendered/')) {
        return new Response('Not Found', { status: 404 });
      }

      if (requestUrl.endsWith('/index.html')) {
        return new Response(indexHtml, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }

      return new Response('Not Found', { status: 404 });
    });

    const env = createMockEnv({
      ASSETS: { fetch: fetchMock } as unknown as Env['ASSETS'],
    });

    const request = new Request('https://example.com/');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="justevery-runtime-shim"');
    expect(html).toContain('window.nativePerformanceNow');
    expect(html).toContain('window.__JUSTEVERY_IMPORT_META_ENV__');
    expect(html).toContain('src="/_expo/static/js/web/index-abc123.js"');
    expect(html).toContain('defer');
    expect(html).not.toContain('type="module"');
  });

  it('landing page includes runtime shim but no bundle when ASSETS unavailable', async () => {
    const env = createMockEnv({ ASSETS: undefined });
    const request = new Request('https://example.com/');
    const response = await runFetch(request, env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="justevery-runtime-shim"');
    expect(html).toContain('window.nativePerformanceNow');
    expect(html).not.toContain('/_expo/static/js/web/');
  });
});
