import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyOptions } from 'jose';

type AssetFetcher = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
};

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  LOGTO_ISSUER: string;
  LOGTO_JWKS_URI: string;
  LOGTO_API_RESOURCE: string;
  LOGTO_ENDPOINT?: string;
  LOGTO_APPLICATION_ID?: string;
  APP_BASE_URL?: string;
  PROJECT_DOMAIN?: string;
  STRIPE_PRODUCTS?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  EXPO_PUBLIC_LOGTO_ENDPOINT?: string;
  EXPO_PUBLIC_LOGTO_APP_ID?: string;
  EXPO_PUBLIC_API_RESOURCE?: string;
  EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI?: string;
  EXPO_PUBLIC_LOGTO_REDIRECT_URI?: string;
  EXPO_PUBLIC_LOGTO_REDIRECT_URI_LOCAL?: string;
  EXPO_PUBLIC_LOGTO_REDIRECT_URI_PROD?: string;
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
const SPA_EXTRA_ROUTES = ["/", "/pricing", "/contact", "/callback", "/app"];
const MARKETING_ROUTE_PREFIX = "/marketing/";

type RuntimeEnvPayload = {
  logtoEndpoint: string | null;
  logtoAppId: string | null;
  apiResource: string | null;
  postLogoutRedirectUri: string | null;
  workerOrigin: string | null;
  workerOriginLocal: string | null;
  logtoRedirectUri: string | null;
  logtoRedirectUriLocal: string | null;
  logtoRedirectUriProd: string | null;
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
      console.warn("Failed to inject runtime env", error);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  } catch (error) {
    console.warn("Failed to serve app shell", error);
    return null;
  }
}

function resolveRuntimeEnvPayload(env: Env, request: Request): RuntimeEnvPayload {
  const { origin: requestOrigin } = new URL(request.url);
  return {
    logtoEndpoint:
      env.EXPO_PUBLIC_LOGTO_ENDPOINT ?? env.LOGTO_ENDPOINT ?? null,
    logtoAppId:
      env.EXPO_PUBLIC_LOGTO_APP_ID ?? env.LOGTO_APPLICATION_ID ?? null,
    apiResource:
      env.EXPO_PUBLIC_API_RESOURCE ?? env.LOGTO_API_RESOURCE ?? null,
    postLogoutRedirectUri: env.EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI ?? null,
    workerOrigin: resolveWorkerOrigin(env, requestOrigin),
    workerOriginLocal: env.EXPO_PUBLIC_WORKER_ORIGIN_LOCAL ?? null,
    logtoRedirectUri: env.EXPO_PUBLIC_LOGTO_REDIRECT_URI ?? null,
    logtoRedirectUriLocal: env.EXPO_PUBLIC_LOGTO_REDIRECT_URI_LOCAL ?? null,
    logtoRedirectUriProd: env.EXPO_PUBLIC_LOGTO_REDIRECT_URI_PROD ?? null,
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
  const scriptContent = `(() => {
    const env = ${JSON.stringify(payload)};
    window.__JUSTEVERY_ENV__ = env;
    try {
      if (typeof window.dispatchEvent === 'function') {
        const detail = {
          logtoEndpoint: env.logtoEndpoint,
          logtoAppId: env.logtoAppId,
          apiResource: env.apiResource,
          logtoPostLogoutRedirectUri: env.postLogoutRedirectUri,
          workerOrigin: env.workerOrigin,
          workerOriginLocal: env.workerOriginLocal,
          logtoRedirectUri: env.logtoRedirectUri,
          logtoRedirectUriLocal: env.logtoRedirectUriLocal,
          logtoRedirectUriProd: env.logtoRedirectUriProd,
        };
        const event = typeof CustomEvent === 'function'
          ? new CustomEvent('justevery:env-ready', { detail })
          : new Event('justevery:env-ready');
        if ('detail' in event && event.detail && typeof event.detail === 'object') {
          Object.assign(event.detail, detail);
        }
        window.dispatchEvent(event);
      }
    } catch (eventError) {
      console.warn('Failed to dispatch env-ready event', eventError);
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

    if (pathname === "/marketing" || pathname.startsWith(MARKETING_ROUTE_PREFIX)) {
      return handleMarketingAsset(request, env, pathname);
    }

    switch (pathname) {
      case "/checkout":
        return jsonResponse({
          ok: true,
          message: 'Checkout placeholder',
          hint: 'Configure Stripe Checkout and redirect here',
        });
      case "/app/shell":
        return htmlResponse(workerShellHtml(env));
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
      case "/api/status":
        return handleStatus(request, env);
      case "/api/subscription":
        return handleSubscription(request, env);
      case "/api/runtime-env":
        return jsonResponse(resolveRuntimeEnvPayload(env, request));
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

type AuthFailureReason =
  | 'missing_token'
  | 'invalid_token'
  | 'insufficient_scope'
  | 'upstream_error';

type AuthSuccess = {
  ok: true;
  session: AuthenticatedSession;
};

type AuthFailure = {
  ok: false;
  reason: AuthFailureReason;
  error?: unknown;
  errorDescription?: string;
};

type AuthResult = AuthSuccess | AuthFailure;

const requestSessionCache = new WeakMap<Request, AuthResult>();

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJwksUrl: string | null = null;

function getRemoteJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks && cachedJwksUrl === jwksUri) {
    return cachedJwks;
  }
  const url = new URL(jwksUri);
  cachedJwks = createRemoteJWKSet(url);
  cachedJwksUrl = jwksUri;
  return cachedJwks;
}

function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token.trim();
}

async function authenticateRequest(request: Request, env: Env): Promise<AuthResult> {
  const cached = requestSessionCache.get(request);
  if (cached) {
    return cached;
  }

  const sessionJwt = extractBearerToken(request);
  if (!sessionJwt) {
    const failure: AuthFailure = { ok: false, reason: 'missing_token', errorDescription: 'Bearer token required' };
    requestSessionCache.set(request, failure);
    return failure;
  }

  let payload: JWTPayload;
  try {
    const jwks = getRemoteJwks(env.LOGTO_JWKS_URI);
    const options: JWTVerifyOptions = {
      issuer: env.LOGTO_ISSUER,
      audience: env.LOGTO_API_RESOURCE,
    };

    ({ payload } = await jwtVerify(sessionJwt, jwks, options));
  } catch (error) {
    const failure = classifyJwtError(error);
    requestSessionCache.set(request, failure);
    return failure;
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(env.LOGTO_API_RESOURCE)) {
    const failure: AuthFailure = {
      ok: false,
      reason: 'insufficient_scope',
      errorDescription: 'Access token audience does not match LOGTO_API_RESOURCE',
    };
    requestSessionCache.set(request, failure);
    return failure;
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  const sub = typeof payload.sub === 'string' ? payload.sub : null;
  const claims = payload as Record<string, unknown>;
  const email = typeof claims.email === 'string' ? (claims.email as string) : null;
  const sid = typeof claims.sid === 'string' ? (claims.sid as string) : null;
  const jti = typeof payload.jti === 'string' ? payload.jti : null;

  if (!sub || !exp) {
    const failure: AuthFailure = {
      ok: false,
      reason: 'invalid_token',
      errorDescription: 'JWT missing required subject or expiry claims',
    };
    requestSessionCache.set(request, failure);
    return failure;
  }

  const normalised: AuthenticatedSession = {
    sessionJwt,
    sessionId: sid ?? jti ?? sub,
    expiresAt: new Date(exp * 1000).toISOString(),
    userId: sub,
    emailAddress: email,
  };

  const success: AuthSuccess = { ok: true, session: normalised };
  requestSessionCache.set(request, success);
  return success;
}

async function requireAuthenticatedSession(request: Request, env: Env): Promise<AuthResult> {
  return authenticateRequest(request, env);
}

function classifyJwtError(error: unknown): AuthFailure {
  const errorObject = error as { code?: string; message?: string } | undefined;
  const code = errorObject?.code ?? (errorObject && 'name' in errorObject ? (errorObject as { name?: string }).name : undefined);

  let reason: AuthFailureReason = 'invalid_token';
  let description = 'JWT verification failed';

  if (code === 'ERR_JWT_EXPIRED') {
    description = 'JWT expired';
  } else if (code && code.startsWith('ERR_JWKS')) {
    reason = 'upstream_error';
    description = 'Failed to resolve JWKS for token verification';
  } else if (error instanceof TypeError) {
    reason = 'upstream_error';
    description = error.message || 'Network error while verifying token';
  }

  if (reason === 'upstream_error') {
    console.error('JWT verification failed due to upstream error', error);
  } else {
    console.error('JWT verification failed', error);
  }

  return {
    ok: false,
    reason,
    error,
    errorDescription: description,
  };
}

function interpretAuthFailure(
  failure: AuthFailure,
): { status: number; challenge?: string; error: string; description: string } {
  const description = failure.errorDescription ??
    (failure.reason === 'missing_token'
      ? 'Bearer token required'
      : failure.reason === 'insufficient_scope'
        ? 'Access token audience does not match LOGTO_API_RESOURCE'
        : failure.reason === 'upstream_error'
          ? 'Unable to validate token via identity provider'
          : 'JWT verification failed');

  switch (failure.reason) {
    case 'missing_token':
      return {
        status: 401,
        challenge: `Bearer realm="worker", error="invalid_request", error_description="${description}"`,
        error: 'invalid_request',
        description,
      };
    case 'invalid_token':
      return {
        status: 401,
        challenge: `Bearer realm="worker", error="invalid_token", error_description="${description}"`,
        error: 'invalid_token',
        description,
      };
    case 'insufficient_scope':
      return {
        status: 403,
        challenge: `Bearer realm="worker", error="insufficient_scope", error_description="${description}"`,
        error: 'insufficient_scope',
        description,
      };
    case 'upstream_error':
      return {
        status: 502,
        error: 'bad_gateway',
        description,
      };
    default:
      return {
        status: 401,
        challenge: `Bearer realm="worker", error="invalid_token", error_description="${description}"`,
        error: 'invalid_token',
        description,
      };
  }
}

function sessionSuccessResponse(session: AuthenticatedSession): Response {
  return jsonResponse({
    authenticated: true,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    emailAddress: session.emailAddress ?? null,
  });
}

function sessionFailureResponse(failure: AuthFailure): Response {
  const { status, challenge } = interpretAuthFailure(failure);
  const headers: Record<string, string> = {};
  if (challenge) {
    headers['WWW-Authenticate'] = challenge;
  }
  return jsonResponse(
    {
      authenticated: false,
      sessionId: null,
      expiresAt: null,
      emailAddress: null,
    },
    status,
    headers,
  );
}

function authFailureResponse(failure: AuthFailure): Response {
  const { status, challenge, error, description } = interpretAuthFailure(failure);
  const headers: Record<string, string> = {};
  if (challenge) {
    headers['WWW-Authenticate'] = challenge;
  }
  return jsonResponse({ error, error_description: description }, status, headers);
}

async function handleSessionApi(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return sessionFailureResponse(auth);
  }

  return sessionSuccessResponse(auth.session);
}

async function handleMarketingAsset(request: Request, env: Env, pathname: string): Promise<Response> {
  if (!env.STORAGE) {
    return jsonResponse({ error: "Storage binding not configured" }, 500);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const suffix = pathname.length > MARKETING_ROUTE_PREFIX.length
    ? pathname.slice(MARKETING_ROUTE_PREFIX.length)
    : "";
  const key = parseMarketingKey(suffix);
  if (!key) {
    return jsonResponse({ error: "Not Found" }, 404);
  }

  try {
    const metadata = request.method === "HEAD"
      ? await env.STORAGE.head(key)
      : await env.STORAGE.get(key);

    if (!metadata) {
      return jsonResponse({ error: "Not Found" }, 404);
    }

    const headers = new Headers();
    const extension = key.split(".").pop()?.toLowerCase() ?? "";
    const contentType = metadata.httpMetadata?.contentType ?? CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
    headers.set("Content-Type", contentType);
    headers.set(
      "Cache-Control",
      metadata.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable",
    );
    headers.set("Access-Control-Allow-Origin", "*");
    if (typeof metadata.size === "number") {
      headers.set("Content-Length", metadata.size.toString());
    }

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }

    const objectBody = (metadata as { body?: ReadableStream | null }).body;
    if (!objectBody) {
      return jsonResponse({ error: "Not Found" }, 404);
    }

    return new Response(objectBody, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Failed to serve marketing asset", error);
    return jsonResponse({ error: "Internal Server Error" }, 500);
  }
}

function extractProviderError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const { error, error_description: errorDescription } = payload as {
    error?: unknown;
    error_description?: unknown;
  };

  const errorText = typeof error === 'string' ? error : null;
  const descriptionText = typeof errorDescription === 'string' ? errorDescription : null;

  if (errorText && descriptionText) {
    return `${errorText}: ${descriptionText}`;
  }
  return descriptionText ?? errorText;
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
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

async function handleAssetsList(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
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

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
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

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
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

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
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

async function handleStatus(request: Request, env: Env): Promise<Response> {
  const timestamp = new Date().toISOString();
  const region = (request as Request & { cf?: { colo?: string } }).cf?.colo ?? null;
  return jsonResponse({ status: 'ok', timestamp, region, workerOrigin: env.EXPO_PUBLIC_WORKER_ORIGIN ?? env.PROJECT_DOMAIN ?? null });
}

async function handleSubscription(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }

  const payload = {
    subscription: {
      active: false,
      plan: null,
      expiresAt: null,
    },
    userId: auth.session.userId,
    message: 'Subscription API stub — replace with Stripe Billing integration.',
  };

  return jsonResponse(payload);
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

function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=UTF-8" });
  if (extraHeaders) {
    if (extraHeaders instanceof Headers) {
      extraHeaders.forEach((value, key) => headers.set(key, value));
    } else if (Array.isArray(extraHeaders)) {
      for (const [key, value] of extraHeaders) {
        headers.set(key, value);
      }
    } else if (typeof extraHeaders === 'object') {
      for (const [key, value] of Object.entries(extraHeaders)) {
        if (value !== undefined) {
          headers.set(key, value as string);
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

function generateSessionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function landingPageHtml(env: Env): string {
  const appUrl = env.APP_BASE_URL ?? "/app";
  const loginUrl = appUrl;
  const landingUrl = env.PROJECT_DOMAIN ?? "https://example.com";
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
  <p>justevery ships a turnkey stack powered by Cloudflare, Logto, and Stripe so you can focus on features, not plumbing. Sign in from the web client to obtain a Logto session, then let the Worker validate every request.</p>
  <a class="button" href="${loginUrl}">Open the app →</a>
  <footer>Need the dashboard? Jump to <a href="${appUrl}">${appUrl}</a> or visit <a href="${landingUrl}">${landingUrl}</a>.</footer>
</main>
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
      <pre>${JSON.stringify({
        logtoEndpoint: env.LOGTO_ENDPOINT ?? env.EXPO_PUBLIC_LOGTO_ENDPOINT ?? null,
        apiResource: env.LOGTO_API_RESOURCE ?? env.EXPO_PUBLIC_API_RESOURCE ?? null,
        workerOrigin: origin || null,
      }, null, 2)}</pre>
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

function parseMarketingKey(raw: string): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  const candidate = parseKey(raw, {});
  if (!candidate) {
    return null;
  }

  if (candidate.endsWith('/')) {
    return null;
  }

  const fullKey = candidate.startsWith('marketing/') ? candidate : `marketing/${candidate}`;
  if (!fullKey.startsWith('marketing/') || fullKey === 'marketing/') {
    return null;
  }

  return fullKey;
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
