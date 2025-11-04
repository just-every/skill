type AssetFetcher = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
};

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  STYTCH_PROJECT_ID: string;
  STYTCH_SECRET: string;
  APP_BASE_URL?: string;
  LANDING_URL?: string;
  STRIPE_PRODUCTS?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  EXPO_PUBLIC_STYTCH_PUBLIC_TOKEN?: string;
  EXPO_PUBLIC_STYTCH_BASE_URL?: string;
  EXPO_PUBLIC_WORKER_ORIGIN?: string;
  ASSETS?: AssetFetcher;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  json: "application/json; charset=UTF-8",
  txt: "text/plain; charset=UTF-8",
  html: "text/html; charset=UTF-8",
  css: "text/css; charset=UTF-8",
  js: "application/javascript; charset=UTF-8",
  mjs: "application/javascript; charset=UTF-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  pdf: "application/pdf",
};

const textEncoder = new TextEncoder();

const STATIC_ASSET_PREFIXES = ["/_expo/", "/assets/"];
const STATIC_ASSET_PATHS = new Set(["/favicon.ico", "/index.html", "/manifest.json"]);
const SPA_EXTRA_ROUTES = ["/login", "/payments"];

type RuntimeEnvPayload = {
  stytchPublicToken: string | null;
  stytchBaseUrl: string | null;
  workerOrigin: string | null;
};

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

function normaliseAppBasePath(raw: string | undefined): string {
  if (!raw) {
    return "/app";
  }

  let candidate = raw.trim();
  if (!candidate) {
    return "/app";
  }

  if (!candidate.startsWith("/")) {
    try {
      const parsed = new URL(candidate);
      candidate = parsed.pathname || "/app";
    } catch {
      candidate = `/${candidate}`;
    }
  }

  if (!candidate.startsWith("/")) {
    candidate = `/${candidate}`;
  }

  if (candidate.length > 1) {
    candidate = candidate.replace(/\/+$/, "");
  }

  return candidate || "/app";
}

function shouldServeAppShell(pathname: string, env: Env): boolean {
  const base = normaliseAppBasePath(env.APP_BASE_URL);
  if (pathname === base) {
    return true;
  }
  if (base !== "/" && pathname.startsWith(`${base}/`)) {
    return true;
  }

  for (const route of SPA_EXTRA_ROUTES) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      return true;
    }
  }

  return false;
}

async function serveStaticAsset(request: Request, env: Env): Promise<Response | null> {
  if (!env.ASSETS) {
    return null;
  }

  try {
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      return null;
    }
    return response;
  } catch (error) {
    console.warn("Asset fetch failed", error);
    return null;
  }
}

async function serveAppShell(request: Request, env: Env): Promise<Response | null> {
  if (!env.ASSETS) {
    return null;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const url = new URL(request.url);
  const baseOrigin = `${url.protocol}//${url.host}`;
  const indexUrl = new URL("/index.html", baseOrigin);
  const assetRequest = new Request(indexUrl.toString(), {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: request.headers,
  });

  try {
    const response = await env.ASSETS.fetch(assetRequest);
    if (response.status >= 400) {
      return null;
    }

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "text/html; charset=UTF-8");
    if (!headers.has("Cache-Control")) {
      headers.set("Cache-Control", "no-store, max-age=0");
    }

    let body: BodyInit | null = response.body;

    try {
      const payload = resolveRuntimeEnvPayload(env);
      if (payload.stytchPublicToken || payload.stytchBaseUrl || payload.workerOrigin) {
        const html = await response.clone().text();
        const injected = injectRuntimeEnv(html, payload);
        body = injected;
      }
    } catch (error) {
      console.warn("Failed to inject runtime env", error);
      body = response.body;
    }

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.warn("Failed to serve app shell", error);
    return null;
  }
}

function resolveRuntimeEnvPayload(env: Env): RuntimeEnvPayload {
  return {
    stytchPublicToken: env.EXPO_PUBLIC_STYTCH_PUBLIC_TOKEN ?? null,
    stytchBaseUrl: env.EXPO_PUBLIC_STYTCH_BASE_URL ?? null,
    workerOrigin: resolveWorkerOrigin(env),
  };
}

function resolveWorkerOrigin(env: Env): string | null {
  if (env.EXPO_PUBLIC_WORKER_ORIGIN) {
    return env.EXPO_PUBLIC_WORKER_ORIGIN;
  }

  const landing = env.LANDING_URL ? extractOriginFromUrl(env.LANDING_URL) : null;
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
  const scriptContent = `(() => {
    const env = ${JSON.stringify(payload)};
    window.__JUSTEVERY_ENV__ = env;
    try {
      if (typeof window.dispatchEvent === 'function') {
        const detail = { stytchPublicToken: env.stytchPublicToken, stytchBaseUrl: env.stytchBaseUrl };
        const event = typeof CustomEvent === 'function'
          ? new CustomEvent('justevery:env-ready', { detail })
          : new Event('justevery:env-ready');
        if ('detail' in event) {
          (event as CustomEvent<typeof detail>).detail.stytchPublicToken ??= env.stytchPublicToken;
          (event as CustomEvent<typeof detail>).detail.stytchBaseUrl ??= env.stytchBaseUrl;
        }
        window.dispatchEvent(event);
      }
    } catch (eventError) {
      console.warn('Failed to dispatch env-ready event', eventError);
    }
    const extractUrl = (input) => {
      if (!input) return null;
      if (typeof input === 'string') return input;
      if (typeof URL !== 'undefined' && input instanceof URL) {
        return input.toString();
      }
      if (typeof Request !== 'undefined' && input instanceof Request) {
        return input.url;
      }
      if (typeof input === 'object' && typeof input.url === 'string') {
        return input.url;
      }
      return null;
    };

    const rewriteIfStytch = (input) => {
      if (!env || !env.stytchBaseUrl) return null;
      const raw = extractUrl(input);
      if (!raw) return null;
      let parsed;
      try {
        parsed = new URL(raw);
      } catch (error) {
        return null;
      }
      const host = (parsed.hostname || '').toLowerCase();
      if (!host.endsWith('stytch.com')) {
        return null;
      }
      try {
        const base = new URL(env.stytchBaseUrl);
        const pathAndQuery = parsed.pathname + parsed.search + parsed.hash;
        const rewritten = new URL(pathAndQuery, base);
        return rewritten.toString();
      } catch (error) {
        console.warn('Stytch URL rewrite failed', error);
        return null;
      }
    };

    const originalRequest = window.Request;
    if (typeof originalRequest === 'function') {
      window.Request = new Proxy(originalRequest, {
        construct(target, args) {
          if (args && args.length > 0) {
            const rewritten = rewriteIfStytch(args[0]);
            if (rewritten) {
              args[0] = rewritten;
            }
          }
          return new target(...args);
        },
      });
    }

    if (typeof window.fetch === 'function') {
      const originalFetch = window.fetch;
      window.fetch = function patchedFetch(resource, init) {
        const rewritten = rewriteIfStytch(resource);
        if (rewritten) {
          if (typeof Request !== 'undefined' && resource instanceof Request) {
            const cloned = resource.clone();
            resource = new Request(rewritten, cloned);
          } else if (typeof URL !== 'undefined' && resource instanceof URL) {
            resource = new URL(rewritten);
          } else {
            resource = rewritten;
          }
        }
        return originalFetch.call(this, resource, init);
      };
    }

    if (typeof window.XMLHttpRequest === 'function') {
      const originalOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        const rewritten = rewriteIfStytch(url);
        return originalOpen.call(this, method, rewritten || url, ...rest);
      };
    }
  })();`;

  const script = `<script>${scriptContent}</script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}</head>`);
  }
  if (html.includes("<body")) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${script}`);
  }
  return `${script}${html}`;
}

const Worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = normalisePath(url.pathname);

    // Basic CORS for API endpoints
    if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
      return cors(new Response(null, { status: 204 }));
    }

    if (isStaticAssetPath(pathname)) {
      const assetResponse = await serveStaticAsset(request, env);
      if (assetResponse) {
        return assetResponse;
      }
    }

    switch (pathname) {
      case "/":
        return htmlResponse(landingPageHtml(env));
      case "/logout":
        return handleLogout(request, env);
      case "/checkout":
        return jsonResponse({
          ok: true,
          message: 'Checkout placeholder',
          hint: 'Configure Stripe Checkout and redirect here',
        });
      case "/api/session":
        return handleSessionApi(request, env);
      case "/api/me":
        return handleMe(request, env);
      case "/api/assets/list":
        return handleAssetsList(request, env);
      case "/api/assets/get":
        return handleAssetsGet(request, env);
      case "/api/assets/put":
        return handleAssetsPut(request, env);
      case "/api/assets/delete":
        return handleAssetsDelete(request, env);
      case "/api/stripe/products":
        return handleStripeProducts(env);
      case "/webhook/stripe":
        return handleStripeWebhook(request, env);
      default:
        break;
    }

    if (shouldServeAppShell(pathname, env)) {
      const appShellResponse = await serveAppShell(request, env);
      if (appShellResponse) {
        return appShellResponse;
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

export default Worker;

function normalisePath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

type AuthenticatedSession = {
  sessionJwt: string;
  sessionId: string;
  expiresAt: string;
  userId: string;
  emailAddress?: string | null;
};

type StytchAuthenticateResponse = {
  session_token: string;
  session: {
    session_id: string;
    expires_at: string;
    attributes?: {
      ip_address?: string | null;
      user_agent?: string | null;
    } | null;
  };
  user: {
    user_id: string;
    email?: string | null;
    emails?: Array<{ email: string; primary?: boolean | null }>;
  };
};

const requestSessionCache = new WeakMap<Request, AuthenticatedSession | null>();

function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token.trim();
}

function resolveStytchBaseUrl(env: Env): string {
  return env.STYTCH_PROJECT_ID.startsWith("project-live-")
    ? "https://api.stytch.com"
    : "https://test.stytch.com";
}

async function authenticateRequest(request: Request, env: Env): Promise<AuthenticatedSession | null> {
  if (requestSessionCache.has(request)) {
    return requestSessionCache.get(request) ?? null;
  }

  const sessionJwt = extractBearerToken(request);
  if (!sessionJwt) {
    requestSessionCache.set(request, null);
    return null;
  }

  const baseUrl = resolveStytchBaseUrl(env);
  const credentials = btoa(`${env.STYTCH_PROJECT_ID}:${env.STYTCH_SECRET}`);

  let stytchResponse: Response;
  try {
    stytchResponse = await fetch(`${baseUrl}/v1/sessions/authenticate`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_jwt: sessionJwt }),
    });
  } catch (error) {
    console.error("Stytch request failed", error);
    requestSessionCache.set(request, null);
    return null;
  }

  if (!stytchResponse.ok) {
    const errorBody = await stytchResponse.text().catch(() => "<unavailable>");
    console.warn("Stytch authentication rejected", stytchResponse.status, errorBody);
    requestSessionCache.set(request, null);
    return null;
  }

  const body = (await stytchResponse.json()) as StytchAuthenticateResponse;

  const primaryEmail = body.user.email ?? body.user.emails?.find((entry) => entry.primary)?.email ?? null;

  const normalised: AuthenticatedSession = {
    sessionJwt,
    sessionId: body.session.session_id,
    expiresAt: body.session.expires_at,
    memberId: body.user.user_id,
    memberEmail: primaryEmail,
    organizationId: '',
    organizationName: null,
  };

  requestSessionCache.set(request, normalised);
  return normalised;
}

async function requireAuthenticatedSession(request: Request, env: Env): Promise<AuthenticatedSession | null> {
  return authenticateRequest(request, env);
}

function unauthorizedResponse(): Response {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

async function handleSessionApi(request: Request, env: Env): Promise<Response> {
  const session = await authenticateRequest(request, env);
  if (!session) {
    return jsonResponse({ authenticated: false, session: null }, 401);
  }
  return jsonResponse({
    authenticated: true,
    session: {
      session_id: session.sessionId,
      expires_at: session.expiresAt,
      email_address: session.emailAddress ?? null,
    },
  });
}

async function handleLogout(_request: Request, _env: Env): Promise<Response> {
  return jsonResponse({
    ok: true,
    message: 'Sessions are managed by the Stytch frontend SDK; clear tokens there to log out.',
  });
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const session = await requireAuthenticatedSession(request, env);
  if (!session) {
    return unauthorizedResponse();
  }

  return jsonResponse({
    authenticated: true,
    session: {
      email_address: session.emailAddress ?? null,
      session_id: session.sessionId,
      expires_at: session.expiresAt,
    },
  });
}

async function handleAssetsList(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!(await requireAuthenticatedSession(request, env))) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const prefix = parseKey(url.searchParams.get("prefix"), { allowEmpty: true });
  if (prefix === null) {
    return jsonResponse({ error: "Invalid prefix" }, 400);
  }

  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limitValue = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  const limit =
    limitValue && Number.isFinite(limitValue)
      ? Math.min(Math.max(limitValue, 1), 1000)
      : undefined;

  const list = await env.STORAGE.list({
    prefix: prefix === "" ? undefined : prefix,
    cursor,
    limit,
  });

  const nextCursor = 'cursor' in list ? (list as { cursor?: string }).cursor : undefined;

  return jsonResponse({
    prefix,
    objects: list.objects.map((object) => ({
      key: object.key,
      size: object.size,
      etag: object.etag,
      uploaded: object.uploaded ? object.uploaded.toISOString() : null,
    })),
    cursor: nextCursor ?? null,
    truncated: list.truncated,
  });
}

async function handleAssetsGet(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!(await requireAuthenticatedSession(request, env))) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const key = parseKey(url.searchParams.get("key"));
  if (!key) {
    return jsonResponse({ error: "Missing or invalid key" }, 400);
  }

  const object = await env.STORAGE.get(key);
  if (!object) {
    return jsonResponse({ error: "Not Found" }, 404);
  }

  const etag = object.httpEtag ?? object.etag ?? undefined;
  const ifNoneMatch = request.headers.get("if-none-match");
  const cacheControl = object.httpMetadata?.cacheControl ?? "private, max-age=60";
  const lastModified = object.uploaded ? object.uploaded.toUTCString() : undefined;
  if (etag && ifNoneMatch === etag) {
    const headers = new Headers({ ETag: etag, "Cache-Control": cacheControl });
    if (lastModified) headers.set("Last-Modified", lastModified);
    return cors(new Response(null, { status: 304, headers }));
  }

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  const extension = key.split(".").pop()?.toLowerCase();
  if (!headers.has("Content-Type")) {
    headers.set(
      "Content-Type",
      extension
        ? CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream"
        : "application/octet-stream",
    );
  }
  headers.set("Cache-Control", cacheControl);
  if (lastModified) headers.set("Last-Modified", lastModified);
  if (etag) headers.set("ETag", etag);
  if (typeof object.size === "number") {
    headers.set("Content-Length", object.size.toString());
  }

  return cors(
    new Response(object.body, {
      status: 200,
      headers,
    }),
  );
}

async function handleAssetsPut(request: Request, env: Env): Promise<Response> {
  if (request.method !== "PUT") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!(await requireAuthenticatedSession(request, env))) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const key = parseKey(url.searchParams.get("key"));
  if (!key) {
    return jsonResponse({ error: "Missing or invalid key" }, 400);
  }

  const body = await request.arrayBuffer();
  const contentType = request.headers.get("content-type") ?? undefined;

  await env.STORAGE.put(key, body, {
    httpMetadata: contentType ? { contentType } : undefined,
  });

  return jsonResponse({ ok: true, key });
}

async function handleAssetsDelete(request: Request, env: Env): Promise<Response> {
  if (request.method !== "DELETE") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!(await requireAuthenticatedSession(request, env))) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const key = parseKey(url.searchParams.get("key"));
  if (!key) {
    return jsonResponse({ error: "Missing or invalid key" }, 400);
  }

  await env.STORAGE.delete(key);

  return jsonResponse({ ok: true, deleted: key });
}

async function handleStripeProducts(env: Env): Promise<Response> {
  try {
    const products = parseStripeProducts(env.STRIPE_PRODUCTS);
    return jsonResponse({ products });
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const rawBody = await request.text();
  const isVerified = await verifyStripeSignature(request, rawBody, env);
  if (!isVerified) {
    return jsonResponse({ error: "Invalid or missing Stripe signature" }, 400);
  }

  try {
    const event = JSON.parse(rawBody);
    const auditId =
      typeof event?.id === "string" && event.id.trim() !== ""
        ? event.id
        : `stripe-${generateSessionId()}`;
    const auditAction =
      typeof event?.type === "string" && event.type.trim() !== ""
        ? event.type
        : "stripe.unknown";

    try {
      await env.DB.prepare(
        `INSERT INTO audit_log (id, user_id, action, metadata) VALUES (?1, ?2, ?3, ?4)`,
      )
        .bind(auditId, null, auditAction, rawBody)
        .run();
    } catch (dbError) {
      console.error("Failed to persist Stripe webhook event", dbError);
    }

    console.log("Stripe event received", event.type ?? "unknown", event.id ?? "");
  } catch (error) {
    console.warn("Stripe webhook JSON parse failed", error);
  }

  return jsonResponse({ ok: true }, 200);
}


function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json; charset=UTF-8" },
    }),
  );
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}

function generateSessionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function landingPageHtml(env: Env): string {
  const appUrl = env.APP_BASE_URL ?? "/app";
  const loginUrl = appUrl;
  const landingUrl = env.LANDING_URL ?? "https://justevery.com";
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
</head>
<body>
<main>
  <h1>Launch your product with confidence</h1>
  <p>justevery ships a turnkey stack powered by Cloudflare, Stytch, and Stripe so you can focus on features, not plumbing. Sign in from the web client to obtain a Stytch session, then let the Worker validate every request.</p>
  <a class="button" href="${loginUrl}">Open the app →</a>
  <footer>Need the dashboard? Jump to <a href="${appUrl}">${appUrl}</a> or visit <a href="${landingUrl}">${landingUrl}</a>.</footer>
</main>
</body>
</html>`;
}


function parseKey(
  raw: string | null,
  options: { allowEmpty?: boolean } = {},
): string | null {
  if (raw === null || raw === undefined) {
    return options.allowEmpty ? "" : null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return options.allowEmpty ? "" : null;
  }

  const normalised = trimmed.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!normalised) {
    return options.allowEmpty ? "" : null;
  }

  if (normalised.includes("..") || normalised.includes("\\") || normalised.includes("\0")) {
    return null;
  }

  return normalised;
}

function parseStripeProducts(raw: string | undefined): unknown[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.log("STRIPE_PRODUCTS not JSON, attempting to parse shorthand", error);
  }

  const shorthand = raw.split(";").map((segment) => segment.trim()).filter(Boolean);
  return shorthand.map((segment) => {
    const [namePart, rest] = segment.split(":");
    const [amount = "0", currency = "usd", interval = "month"] = (rest ?? "").split(",").map((piece) => piece.trim());
    return {
      name: namePart ?? "",
      amount: Number.parseInt(amount, 10) || 0,
      currency,
      interval,
    };
  });
}

async function safeJson(response: Response): Promise<unknown | null> {
  try {
    return await response.clone().json();
  } catch (error) {
    console.warn("Unable to parse JSON", error);
    return null;
  }
}

async function verifyStripeSignature(
  request: Request,
  payload: string,
  env: Env,
): Promise<boolean> {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("STRIPE_WEBHOOK_SECRET is not configured; rejecting webhook");
    return false;
  }

  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return false;
  }

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") {
      const parsed = Number.parseInt(value ?? "", 10);
      if (Number.isFinite(parsed)) {
        timestamp = parsed;
      }
    } else if (key === "v1" && value) {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, textEncoder.encode(signedPayload)),
    );
    const expectedHex = bufferToHex(digest);

    for (const signature of signatures) {
      if (timingSafeEqualHex(expectedHex, signature)) {
        return true;
      }
    }
  } catch (error) {
    console.error("Failed to verify Stripe signature", error);
    return false;
  }

  return false;
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(expected: string, candidate: string): boolean {
  if (expected.length !== candidate.length) {
    return false;
  }

  const expectedBytes = hexToUint8Array(expected);
  const candidateBytes = hexToUint8Array(candidate);
  if (expectedBytes.length !== candidateBytes.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expectedBytes.length; i += 1) {
    mismatch |= expectedBytes[i] ^ candidateBytes[i];
  }
  return mismatch === 0;
}

function hexToUint8Array(hex: string): Uint8Array {
  const normalised = hex.trim().toLowerCase();
  if (normalised.length % 2 !== 0) {
    return new Uint8Array();
  }

  const result = new Uint8Array(normalised.length / 2);
  for (let i = 0; i < normalised.length; i += 2) {
    const byte = Number.parseInt(normalised.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      return new Uint8Array();
    }
    result[i / 2] = byte;
  }
  return result;
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-session-token",
  );
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
