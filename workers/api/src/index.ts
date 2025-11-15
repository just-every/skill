import {
  authenticateRequest,
  requireAuthenticatedSession,
  sessionSuccessResponse,
  sessionFailureResponse,
  authFailureResponse,
  type AuthenticatedSession,
} from './sessionAuth';

type AssetFetcher = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
};

export interface Env {
  LOGIN_ORIGIN: string;
  BETTER_AUTH_URL?: string;
  LOGIN_SERVICE?: Fetcher;
  SESSION_COOKIE_DOMAIN?: string;
  APP_BASE_URL?: string;
  PROJECT_DOMAIN?: string;
  STRIPE_PRODUCTS?: string;
  EXPO_PUBLIC_WORKER_ORIGIN?: string;
  ASSETS?: AssetFetcher;
  STORAGE?: R2Bucket;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  json: 'application/json; charset=UTF-8',
  txt: 'text/plain; charset=UTF-8',
  html: 'text/html; charset=UTF-8',
  css: 'text/css; charset=UTF-8',
  js: 'application/javascript; charset=UTF-8',
  mjs: 'application/javascript; charset=UTF-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
};

const STATIC_ASSET_PREFIXES = ['/_expo/', '/assets/'];
const STATIC_ASSET_PATHS = new Set(['/favicon.ico', '/index.html', '/manifest.json']);
const SPA_EXTRA_ROUTES = ['/callback', '/app', '/logout', '/dev/sidebar'];
const PRERENDER_ROUTES: Record<string, string> = {
  '/': 'index.html',
  '/pricing': 'pricing.html',
  '/contact': 'contact.html',
};
const MARKETING_ROUTE_PREFIX = '/marketing/';

type RuntimeEnvPayload = {
  workerOrigin: string | null;
  workerOriginLocal: string | null;
  loginOrigin: string | null;
};

const Worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    void ctx;
    const url = new URL(request.url);
    const pathname = normalisePath(url.pathname);

    if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      return cors(new Response(null, { status: 204 }));
    }

    if (isStaticAssetPath(pathname)) {
      const assetResponse = await serveStaticAsset(request, env);
      if (assetResponse) {
        return assetResponse;
      }
    }

    if (pathname === '/marketing' || pathname.startsWith(MARKETING_ROUTE_PREFIX)) {
      return handleMarketingAsset(request, env, pathname);
    }

    const prerenderResponse = await servePrerenderedHtml(request, env, pathname);
    if (prerenderResponse) {
      return prerenderResponse;
    }

    switch (pathname) {
      case '/checkout':
        return jsonResponse({
          ok: true,
          message: 'Checkout placeholder',
          hint: 'Configure Stripe Checkout and redirect here',
        });
      case '/app/shell':
        return htmlResponse(workerShellHtml(env));
      case '/api/session':
        return handleSessionApi(request, env);
      case '/api/session/bootstrap':
        return handleSessionBootstrap(request, env);
      case '/api/session/logout':
        return handleSessionLogout(request, env);
      case '/api/me':
        return handleMe(request, env);
      case '/api/stripe/products':
        return handleStripeProducts(env);
      case '/api/status':
        return handleStatus(request, env);
      case '/api/runtime-env':
        return jsonResponse(resolveRuntimeEnvPayload(env, request));
      default:
        break;
    }

    if (shouldServeAppShell(pathname, env)) {
      const appShellResponse = await serveAppShell(request, env);
      if (appShellResponse) {
        return appShellResponse;
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

export default Worker;
export type { Env };

function normalisePath(pathname: string): string {
  if (pathname === '/') {
    return '/';
  }
  return pathname.replace(/\/+$/, '');
}

function isStaticAssetPath(pathname: string): boolean {
  if (STATIC_ASSET_PATHS.has(pathname)) {
    return true;
  }
  for (const prefix of STATIC_ASSET_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

async function serveStaticAsset(request: Request, env: Env): Promise<Response | null> {
  if (!env.ASSETS) {
    return htmlResponse(await landingPageHtml(env));
  }

  try {
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      return null;
    }
    return response;
  } catch (error) {
    console.warn('Asset fetch failed', error);
    return null;
  }
}

async function servePrerenderedHtml(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (!env.ASSETS) {
    return htmlResponse(await landingPageHtml(env));
  }

  const assetSuffix = PRERENDER_ROUTES[pathname];
  if (assetSuffix === undefined) {
    return null;
  }

  const assetPath = `/prerendered/${assetSuffix}`;
  const assetUrl = new URL(assetPath, request.url).toString();
  const prerenderResponse = await env.ASSETS.fetch(assetUrl);
  if (!prerenderResponse || !prerenderResponse.ok) {
    console.warn('Prerender asset missing', { pathname, assetPath, status: prerenderResponse?.status });
    return htmlResponse(await landingPageHtml(env));
  }

  let html = await prerenderResponse.text();
  html = injectRuntimeEnv(html, resolveRuntimeEnvPayload(env, request));

  const userAgent = request.headers.get('user-agent');
  const cacheHeader = userAgent && /bot|crawl|spider|slurp|bing|yahoo|duckduckgo|baidu|yandex|facebot|facebookexternalhit|linkedinbot|twitterbot|embedly|quora|pinterest|redditbot|slackbot|discordbot|telegrambot/i.test(userAgent)
    ? 'public, max-age=3600, stale-while-revalidate=86400'
    : 'no-cache';

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheHeader,
      'Vary': 'User-Agent',
      'X-Prerender-Route': pathname,
      'X-Prerender-Asset': assetPath,
    },
  });
}

function normaliseAppBasePath(raw: string | undefined): string {
  if (!raw) {
    return '/app';
  }

  let candidate = raw.trim();
  if (!candidate) {
    return '/app';
  }

  if (!candidate.startsWith('/')) {
    try {
      const parsed = new URL(candidate);
      candidate = parsed.pathname || '/app';
    } catch {
      candidate = `/${candidate}`;
    }
  }

  if (!candidate.startsWith('/')) {
    candidate = `/${candidate}`;
  }

  if (candidate.length > 1) {
    candidate = candidate.replace(/\/+$/, '');
  }

  return candidate || '/app';
}

function shouldServeAppShell(pathname: string, env: Env): boolean {
  const base = normaliseAppBasePath(env.APP_BASE_URL);
  if (pathname === base) {
    return true;
  }
  if (base !== '/' && pathname.startsWith(`${base}/`)) {
    return true;
  }
  return SPA_EXTRA_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

async function serveAppShell(request: Request, env: Env): Promise<Response | null> {
  if (!env.ASSETS) {
    return null;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null;
  }

  const url = new URL(request.url);
  const baseOrigin = `${url.protocol}//${url.host}`;
  const indexUrl = new URL('/index.html', baseOrigin);
  const assetRequest = new Request(indexUrl.toString(), {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: request.headers,
  });

  try {
    const response = await env.ASSETS.fetch(assetRequest);
    if (response.status >= 400) {
      return htmlResponse(await landingPageHtml(env));
    }

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/html; charset=UTF-8');
    if (!headers.has('Cache-Control')) {
      headers.set('Cache-Control', 'no-store, max-age=0');
    }

    try {
      const html = await response.text();
      const payload = resolveRuntimeEnvPayload(env, request);
      const injected = injectRuntimeEnv(html, payload);
      return new Response(injected, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn('Failed to inject runtime env', error);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  } catch (error) {
    console.warn('Failed to serve app shell', error);
    return htmlResponse(await landingPageHtml(env));
  }
}

function resolveRuntimeEnvPayload(env: Env, request: Request): RuntimeEnvPayload {
  const { origin: requestOrigin } = new URL(request.url);
  return {
    workerOrigin: resolveWorkerOrigin(env, requestOrigin),
    workerOriginLocal: null,
    loginOrigin: env.LOGIN_ORIGIN,
  };
}

function resolveWorkerOrigin(env: Env, requestOrigin?: string): string | null {
  const configured = env.EXPO_PUBLIC_WORKER_ORIGIN;
  if (requestOrigin) {
    const host = new URL(requestOrigin).hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return requestOrigin;
    }
  }

  if (configured) {
    return configured;
  }

  if (requestOrigin) {
    return requestOrigin;
  }

  const landing = env.PROJECT_DOMAIN ? extractOriginFromUrl(env.PROJECT_DOMAIN) : null;
  return landing ?? null;
}

function extractOriginFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function injectRuntimeEnv(html: string, payload: RuntimeEnvPayload): string {
  const scriptContent = `(() => {\n    const env = ${JSON.stringify(payload)};\n    window.__JUSTEVERY_ENV__ = env;\n    try {\n      if (typeof window.dispatchEvent === 'function') {\n        const detail = {\n          workerOrigin: env.workerOrigin,\n          workerOriginLocal: env.workerOriginLocal,\n          loginOrigin: env.loginOrigin,\n        };\n        const event = typeof CustomEvent === 'function'\n          ? new CustomEvent('justevery:env-ready', { detail })\n          : new Event('justevery:env-ready');\n        if ('detail' in event && event.detail && typeof event.detail === 'object') {\n          Object.assign(event.detail, detail);\n        }\n        window.dispatchEvent(event);\n      }\n    } catch (eventError) {\n      console.warn('Failed to dispatch env-ready event', eventError);\n    }\n  })();`;

  const script = `<script>${scriptContent}</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}</head>`);
  }
  if (html.includes('<body')) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${script}`);
  }
  return `${script}${html}`;
}

async function resolveExpoBundlePath(env: Env): Promise<string | null> {
  if (!env.ASSETS) {
    return null;
  }

  try {
    const indexResponse = await env.ASSETS.fetch(new Request('https://placeholder/index.html'));
    if (!indexResponse.ok) {
      return null;
    }
    const html = await indexResponse.text();
    const scriptMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*>/);
    if (scriptMatch && scriptMatch[1]) {
      return scriptMatch[1];
    }
  } catch (error) {
    console.warn('Failed to resolve Expo bundle path', error);
  }
  return null;
}

async function landingPageHtml(env: Env): Promise<string> {
  const appUrl = env.APP_BASE_URL ?? '/app';
  const loginUrl = env.PROJECT_DOMAIN ?? env.LOGIN_ORIGIN ?? '/app';
  const landingUrl = env.PROJECT_DOMAIN ?? 'https://example.com';
  const bundlePath = await resolveExpoBundlePath(env);

  const runtimeShim = `<script id="justevery-runtime-shim">(function(){\n      if (typeof globalThis === 'undefined') { return; }\n      var target = globalThis;\n      if (typeof target.nativePerformanceNow !== 'function') {\n        var perf = target.performance && target.performance.now ? target.performance : { now: function () { return Date.now(); } };\n        var nativeNow = perf.now.bind(perf);\n        target.nativePerformanceNow = nativeNow;\n        if (typeof window !== 'undefined' && !window.nativePerformanceNow) {\n          window.nativePerformanceNow = nativeNow;\n        }\n      }\n      if (!target.__JUSTEVERY_IMPORT_META_ENV__) {\n        target.__JUSTEVERY_IMPORT_META_ENV__ = { MODE: 'production' };\n      }\n      if (typeof window !== 'undefined' && !window.__JUSTEVERY_IMPORT_META_ENV__) {\n        window.__JUSTEVERY_IMPORT_META_ENV__ = target.__JUSTEVERY_IMPORT_META_ENV__;\n      }\n    })();</script>`;

  const bundleScript = bundlePath ? `<script src="${bundlePath}" defer></script>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>justevery • Launch faster</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 20% 20%, #dbeafe, #111827); color: #0f172a; }
    main { padding: 2rem; border-radius: 1.5rem; backdrop-filter: blur(12px); background: rgba(255,255,255,0.82); max-width: 32rem; text-align: center; box-shadow: 0 30px 60px rgba(15,23,42,0.25); }
    h1 { font-size: clamp(2.6rem, 4vw, 3.2rem); margin-bottom: 1rem; }
    p { color: rgba(15,23,42,0.75); line-height: 1.5; margin-bottom: 2rem; }
    a.button { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.85rem 1.6rem; border-radius: 999px; background: #1d4ed8; color: white; text-decoration: none; font-weight: 600; letter-spacing: 0.02em; box-shadow: 0 20px 35px rgba(29,78,216,0.35); transition: transform 160ms ease, box-shadow 160ms ease; }
    a.button:hover { transform: translateY(-2px); box-shadow: 0 24px 45px rgba(29,78,216,0.4); }
    footer { margin-top: 1.5rem; font-size: 0.85rem; color: rgba(15,23,42,0.6); }
  </style>
  ${runtimeShim}
</head>
<body>
<main>
  <h1>Launch your product with confidence</h1>
  <p>justevery ships a turnkey stack powered by Cloudflare, Better Auth, and Stripe so you can focus on features, not plumbing. Sign in from the login service to mint a session, then let the Worker validate every request.</p>
  <a class="button" href="${loginUrl}">Open the login app →</a>
  <footer>Need the dashboard? Jump to <a href="${appUrl}">${appUrl}</a> or visit <a href="${landingUrl}">${landingUrl}</a>.</footer>
</main>
${bundleScript}
</body>
</html>`;
}

function workerShellHtml(env: Env): string {
  const origin = env.EXPO_PUBLIC_WORKER_ORIGIN ?? env.PROJECT_DOMAIN ?? '';
  const appUrl = env.APP_BASE_URL ?? '/app';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Worker Shell</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
      main { max-width: 640px; margin: 0 auto; padding: 48px 24px; display: grid; gap: 16px; }
      pre { background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: 12px; overflow: auto; }
      a { color: #38bdf8; }
    </style>
  </head>
  <body>
    <main>
      <h1>Cloudflare Worker Shell</h1>
      <p>This helper lives inside the deployed Worker so you can verify runtime configuration and open the dashboard from the same origin.</p>
      <ul>
        <li>Worker origin: <code>${origin || 'not configured'}</code></li>
        <li>App URL: <code>${appUrl}</code></li>
      </ul>
      <p><a href="${origin.replace(/\/+$/, '')}${appUrl}" target="_blank" rel="noopener">Open /app in new tab</a></p>
      <pre>${JSON.stringify(
        {
          loginOrigin: env.LOGIN_ORIGIN || null,
          workerOrigin: origin || null,
        },
        null,
        2,
      )}</pre>
    </main>
  </body>
</html>`;
}

async function handleSessionApi(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return sessionFailureResponse(auth);
  }
  return sessionSuccessResponse(auth.session);
}

type SessionSnapshot = {
  session?: {
    expiresAt?: string;
    token?: string;
    [key: string]: unknown;
  };
  user?: Record<string, unknown> | null;
  [key: string]: unknown;
};

function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const session = (value as SessionSnapshot).session;
  return Boolean(session && typeof session === 'object');
}

function buildSessionCookie(token: string, env: Env, expiresAt?: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const parts = [
    `better-auth.session_token=${encodeURIComponent(trimmed)}`,
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=None',
  ];

  const domain = env.SESSION_COOKIE_DOMAIN?.trim();
  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  if (expiresAt) {
    const expires = new Date(expiresAt);
    if (!Number.isNaN(expires.getTime())) {
      parts.push(`Expires=${expires.toUTCString()}`);
    }
  }

  return parts.join('; ');
}

function buildExpiredSessionCookie(env: Env): string {
  const parts = [
    'better-auth.session_token=',
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=None',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
  ];
  const domain = env.SESSION_COOKIE_DOMAIN?.trim();
  if (domain) {
    parts.push(`Domain=${domain}`);
  }
  return parts.join('; ');
}

async function handleSessionBootstrap(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const token = typeof payload === 'object' && payload && 'token' in payload
    ? String((payload as { token?: string }).token ?? '').trim()
    : '';

  if (!token) {
    return jsonResponse({ error: 'invalid_token' }, 400);
  }

  const snapshot = typeof payload === 'object' && payload && 'session' in payload
    ? (payload as { session?: SessionSnapshot }).session
    : undefined;

  let expiresAt: string | undefined;
  if (isSessionSnapshot(snapshot)) {
    expiresAt = snapshot.session?.expiresAt;
  } else {
    const probeRequest = new Request(request.url, {
      headers: {
        cookie: `better-auth.session_token=${encodeURIComponent(token)}`,
      },
    });

    const authResult = await authenticateRequest(probeRequest, env);
    if (!authResult.ok) {
      return authFailureResponse(authResult);
    }
    expiresAt = authResult.session.expiresAt;
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  const sessionCookie = buildSessionCookie(token, env, expiresAt);
  if (sessionCookie) {
    headers.append('Set-Cookie', sessionCookie);
  }

  return new Response(JSON.stringify({ ok: true, cached: Boolean(snapshot) }), {
    status: 200,
    headers,
  });
}

async function handleSessionLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const headers = new Headers();
  headers.append('Set-Cookie', buildExpiredSessionCookie(env));
  return jsonResponse({ ok: true }, 200, headers);
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }

  const session = auth.session;
  return jsonResponse({
    authenticated: true,
    session: {
      email_address: session.emailAddress ?? null,
      session_id: session.sessionId,
      expires_at: session.expiresAt,
    },
  });
}

async function handleMarketingAsset(request: Request, env: Env, pathname: string): Promise<Response> {
  if (!env.STORAGE) {
    return jsonResponse({ error: 'storage_not_configured' }, 503);
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const suffix = pathname.length > MARKETING_ROUTE_PREFIX.length
    ? pathname.slice(MARKETING_ROUTE_PREFIX.length)
    : '';
  const key = parseMarketingKey(suffix);
  if (!key) {
    return jsonResponse({ error: 'Not Found' }, 404);
  }

  try {
    const metadata = request.method === 'HEAD'
      ? await env.STORAGE.head(key)
      : await env.STORAGE.get(key);

    if (!metadata) {
      return jsonResponse({ error: 'Not Found' }, 404);
    }

    const headers = new Headers();
    const extension = key.split('.').pop()?.toLowerCase() ?? '';
    const contentType = metadata.httpMetadata?.contentType ?? CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', metadata.httpMetadata?.cacheControl ?? 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    if (typeof metadata.size === 'number') {
      headers.set('Content-Length', metadata.size.toString());
    }

    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }

    const objectBody = (metadata as { body?: ReadableStream | null }).body;
    if (!objectBody) {
      return jsonResponse({ error: 'Not Found' }, 404);
    }

    return new Response(objectBody, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Failed to serve marketing asset', error);
    return jsonResponse({ error: 'Internal Server Error' }, 500);
  }
}

function parseMarketingKey(raw: string): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const candidate = parseKey(raw, {});
  if (!candidate || candidate.endsWith('/')) {
    return null;
  }
  const fullKey = candidate.startsWith('marketing/') ? candidate : `marketing/${candidate}`;
  if (!fullKey.startsWith('marketing/') || fullKey === 'marketing/') {
    return null;
  }
  return fullKey;
}

function parseKey(raw: string | null, options: { allowEmpty?: boolean } = {}): string | null {
  if (raw === null || raw === undefined) {
    return options.allowEmpty ? '' : null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return options.allowEmpty ? '' : null;
  }

  const normalised = trimmed.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (!normalised) {
    return options.allowEmpty ? '' : null;
  }

  if (normalised.includes('..') || normalised.includes('\\') || normalised.includes('\0')) {
    return null;
  }

  return normalised;
}

async function handleStripeProducts(env: Env): Promise<Response> {
  try {
    const products = parseStripeProducts(env.STRIPE_PRODUCTS);
    return jsonResponse({ products: normaliseProductsForResponse(products) });
  } catch (error) {
    console.warn('stripe products parse error', error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

export type BillingProduct = {
  id: string;
  name: string;
  description?: string;
  priceId: string;
  unitAmount: number;
  currency: string;
  interval?: string;
  metadata?: Record<string, string>;
};

function parseStripeProducts(raw: string | undefined): BillingProduct[] {
  if (!raw || raw.trim() === '') {
    return [];
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => normalizeStripeProductEntry(entry))
          .filter((entry): entry is BillingProduct => Boolean(entry));
      }
    } catch (error) {
      console.warn('STRIPE_PRODUCTS JSON parse failed', error);
    }
  }

  return parseLegacyStripeProducts(trimmed);
}

function normalizeStripeProductEntry(raw: unknown): BillingProduct | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  const priceId = stringFrom(entry.priceId ?? entry.price_id ?? '');
  if (!priceId) {
    return null;
  }

  const unitAmount = typeof entry.unitAmount === 'number'
    ? entry.unitAmount
    : typeof entry.amount === 'number'
      ? entry.amount
      : 0;
  if (unitAmount <= 0) {
    return null;
  }

  const name = sanitizeString(stringFrom(entry.name ?? entry.productName ?? '', 'Plan'));
  const id = stringFrom(entry.id ?? entry.productId ?? priceId);
  const currency = sanitizeString(stringFrom(entry.currency ?? 'usd', 'usd')).toLowerCase();
  const intervalCandidate = typeof entry.interval === 'string'
    ? sanitizeString(entry.interval)
    : '';
  const interval = intervalCandidate || undefined;
  const description = typeof entry.description === 'string' ? entry.description : undefined;
  const metadata = normalizeMetadata(entry.metadata);

  return {
    id,
    name,
    description,
    priceId,
    unitAmount,
    currency,
    interval,
    metadata,
  };
}

function parseLegacyStripeProducts(raw: string): BillingProduct[] {
  const entries = raw.split(';').map((segment) => segment.trim()).filter(Boolean);
  return entries
    .map<BillingProduct | null>((segment) => {
      const [namePart, rest] = segment.split(':');
      const name = namePart?.trim();
      if (!name) {
        return null;
      }
      const [amountRaw, currencyRaw = 'usd', intervalRaw = 'month'] = (rest ?? '')
        .split(',')
        .map((piece) => piece.trim());
      const amount = Number.parseInt(amountRaw, 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }
      const currency = currencyRaw.toLowerCase() || 'usd';
      const interval = intervalRaw || 'month';
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const priceId = slug ? `legacy:${slug}` : `legacy:${Date.now()}`;

      return {
        id: slug || priceId,
        name,
        priceId,
        unitAmount: amount,
        currency,
        interval,
      };
    })
    .filter((entry): entry is BillingProduct => Boolean(entry));
}

function sanitizeString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  const sanitized = trimmed.replace(/^[\\"']+/, '').replace(/[\\"']+$/, '');
  return sanitized.trim();
}

function stringFrom(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function normaliseCurrency(value?: string): string {
  const raw = value ?? 'usd';
  const cleaned = sanitizeString(raw || 'usd');
  return (cleaned || 'usd').toLowerCase();
}

function normaliseInterval(value: string | undefined): string | undefined {
  const sanitised = sanitizeString((value ?? '').toString()).toLowerCase();
  if (!sanitised) {
    return 'month';
  }
  if (['monthly', 'mo'].includes(sanitised)) {
    return 'month';
  }
  if (['yearly', 'annual', 'annually', 'yr'].includes(sanitised)) {
    return 'year';
  }
  return sanitised;
}

function normalizeMetadata(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const metadata: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') {
      metadata[key] = raw;
    } else if (typeof raw === 'number' || typeof raw === 'boolean') {
      metadata[key] = String(raw);
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normaliseProductsForResponse(products: BillingProduct[]): BillingProduct[] {
  if (products.length === 0) {
    return products;
  }

  const hasRealPriceIds = products.some((product) => !product.priceId.startsWith('legacy:'));

  const mapped = products
    .filter((product) => (hasRealPriceIds ? !product.priceId.startsWith('legacy:') : true))
    .map((product): BillingProduct | null => {
      const name = sanitizeString(product.name);
      const priceId = sanitizeString(product.priceId);
      if (!priceId) {
        return null;
      }
      const currency = normaliseCurrency(product.currency);
      const interval = normaliseInterval(product.interval);
      return {
        ...product,
        name,
        priceId,
        currency,
        interval,
      };
    });

  return mapped.filter((product): product is BillingProduct => product !== null);
}

async function handleStatus(request: Request, env: Env): Promise<Response> {
  const timestamp = new Date().toISOString();
  const region = (request as Request & { cf?: { colo?: string } }).cf?.colo ?? null;
  return jsonResponse({
    status: 'ok',
    timestamp,
    region,
    workerOrigin: env.EXPO_PUBLIC_WORKER_ORIGIN ?? env.PROJECT_DOMAIN ?? null,
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}

function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=UTF-8' });
  if (extraHeaders) {
    if (extraHeaders instanceof Headers) {
      extraHeaders.forEach((value, key) => headers.append(key, value));
    } else if (Array.isArray(extraHeaders)) {
      for (const [key, value] of extraHeaders) {
        headers.append(key, value);
      }
    } else if (typeof extraHeaders === 'object') {
      for (const [key, value] of Object.entries(extraHeaders)) {
        if (value !== undefined) {
          headers.append(key, value as string);
        }
      }
    }
  }

  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers,
    }),
  );
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-token');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
