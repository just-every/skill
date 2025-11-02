export interface Env {
  SESSION_KV: KVNamespace;
  DB: D1Database;
  STORAGE: R2Bucket;
  STYTCH_PROJECT_ID: string;
  STYTCH_SECRET: string;
  STYTCH_PUBLIC_TOKEN?: string;
  STYTCH_LOGIN_URL?: string;
  STYTCH_REDIRECT_URL?: string;
  STYTCH_SSO_CONNECTION_ID?: string;
  STYTCH_ORGANIZATION_SLUG?: string;
  STYTCH_ORGANIZATION_ID?: string;
  STYTCH_SSO_DOMAIN?: string;
  APP_BASE_URL?: string;
  LANDING_URL?: string;
  STRIPE_PRODUCTS?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

const SESSION_COOKIE = "je_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // one week

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

type SessionRecord = {
  id: string;
  created_at: string;
  email?: string;
  stytch_session_id?: string;
  expires_at?: string;
};

const Worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = normalisePath(url.pathname);

    // Basic CORS for API endpoints
    if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
      return cors(new Response(null, { status: 204 }));
    }

    switch (pathname) {
      case "/":
        return htmlResponse(landingPageHtml(env));
      case "/login":
        return loginRedirect(url, env);
      case "/logout":
        return handleLogout(request, env);
      case "/auth/callback":
        return handleAuthCallback(request, url, env);
      case "/app":
        return handleApp(request, env);
      case "/payments":
        return htmlResponse(paymentsPageHtml());
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
      case "/api/debug/login-url":
        return handleDebugLoginUrl(request, env);
      case "/webhook/stripe":
        return handleStripeWebhook(request, env);
      default:
        return new Response("Not Found", { status: 404 });
    }
  },
};

export default Worker;

function normalisePath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

async function handleApp(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return redirectResponse("/login");
  }
  return htmlResponse(appPageHtml(session));
}

async function handleSessionApi(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  return jsonResponse({ authenticated: Boolean(session), session });
}

async function handleDebugLoginUrl(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }
  const url = new URL(request.url);
  const details = buildStytchSsoDetails(env, url);
  return jsonResponse({
    url: details.url,
    has_locator: details.hasLocator,
    derived_slug: details.derivedSlug,
    explicit_locator: details.explicitLocator,
    params: details.params,
    query: Object.fromEntries(url.searchParams.entries()),
  });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const sessionId = getCookie(request, SESSION_COOKIE);
  if (sessionId) {
    await env.SESSION_KV.delete(sessionId);
    try {
      await env.DB.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(sessionId).run();
    } catch (dbError) {
      console.warn("Failed to delete session in D1", dbError);
    }
  }

  const response = redirectResponse(env.LANDING_URL ?? "/");
  setCookie(response.headers, SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const session = await requireSession(request, env);
  if (!session) {
    return jsonResponse({ authenticated: false }, 401);
  }

  return jsonResponse({
    authenticated: true,
    session,
  });
}

async function handleAssetsList(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!(await requireSession(request, env))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
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

  if (!(await requireSession(request, env))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
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

  if (!(await requireSession(request, env))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
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

  if (!(await requireSession(request, env))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
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

function loginRedirect(url: URL, env: Env): Response {
  const details = buildStytchSsoDetails(env, url);
  if (!details.hasLocator) {
    console.error(
      "Stytch SSO locator missing – set STYTCH_SSO_CONNECTION_ID or STYTCH_ORGANIZATION_SLUG.",
    );
    return htmlResponse(
      errorPageHtml(
        "SSO configuration is incomplete. Provide a Stytch connection ID or organization slug.",
      ),
      500,
    );
  }
  return redirectResponse(details.url);
}

type StytchSsoDetails = {
  url: string;
  hasLocator: boolean;
  derivedSlug: string | null;
  explicitLocator: boolean;
  params: Record<string, string>;
};

function buildStytchSsoDetails(env: Env, url: URL): StytchSsoDetails {
  const redirectUrl =
    env.STYTCH_REDIRECT_URL ?? new URL("/auth/callback", url.origin).toString();
  const loginBase = env.STYTCH_LOGIN_URL ?? "https://login.justevery.com";
  const target = new URL(loginBase);
  const publicToken = env.STYTCH_PUBLIC_TOKEN ?? env.STYTCH_PROJECT_ID;
  if (!env.STYTCH_PUBLIC_TOKEN) {
    console.warn("STYTCH_PUBLIC_TOKEN missing; falling back to STYTCH_PROJECT_ID for hosted login.");
  }
  target.searchParams.set("public_token", publicToken);
  target.searchParams.set("redirect_url", redirectUrl);
  target.searchParams.set("login_redirect_url", redirectUrl);
  target.searchParams.set("signup_redirect_url", redirectUrl);

  const validOrgSlug =
    env.STYTCH_ORGANIZATION_SLUG &&
    !env.STYTCH_ORGANIZATION_SLUG.includes('://') &&
    !env.STYTCH_ORGANIZATION_SLUG.includes('.');

  const locatorParams: Array<[string, string | undefined]> = [
    ["connection_id", env.STYTCH_SSO_CONNECTION_ID],
    ["organization_slug", validOrgSlug ? env.STYTCH_ORGANIZATION_SLUG : undefined],
    ["organization_id", env.STYTCH_ORGANIZATION_ID],
    ["domain", env.STYTCH_SSO_DOMAIN],
  ];
  for (const [key, value] of locatorParams) {
    if (value) {
      target.searchParams.set(key, value);
    }
  }

  const passthroughKeys = [
    "connection_id",
    "connection_slug",
    "organization_slug",
    "organization_id",
    "domain",
    "email",
  ];
  for (const key of passthroughKeys) {
    const incoming = url.searchParams.get(key);
    if (incoming) {
      target.searchParams.set(key, incoming);
    }
  }

  if (env.STYTCH_SSO_DOMAIN && !url.searchParams.get("domain")) {
    target.searchParams.set("domain", env.STYTCH_SSO_DOMAIN);
  }

  const explicitLocator =
    target.searchParams.has("connection_id") || target.searchParams.has("organization_slug");

  const derivedSlug = explicitLocator ? null : deriveOrganizationSlug(env.LANDING_URL);

  const hasLocator = explicitLocator;

  if (!target.pathname || target.pathname === "/") {
    target.pathname = "/v1/public/sso/start";
  }

  if (!explicitLocator && derivedSlug) {
    target.searchParams.set("organization_slug", derivedSlug);
  }

  const params = Object.fromEntries(target.searchParams.entries());
  return {
    url: target.toString(),
    hasLocator,
    derivedSlug,
    explicitLocator,
    params,
  };
}

function deriveOrganizationSlug(landingUrl?: string): string | null {
  if (!landingUrl) return null;
  try {
    const host = new URL(landingUrl).hostname;
    const parts = host.split(".");
    if (parts.length >= 3) {
      const candidate = parts[0];
      return candidate && candidate !== "www" ? candidate : null;
    }
  } catch (error) {
    console.warn("Failed to derive organization slug from LANDING_URL", error);
  }
  return null;
}

async function handleAuthCallback(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const status = url.searchParams.get("status");
  const sessionToken =
    url.searchParams.get("session_token") ??
    (await extractSessionTokenFromRequest(request));

  const targetLocation = env.APP_BASE_URL ?? "/app";
  let verified = false;

  if (sessionToken) {
    try {
      const response = await authenticateWithStytch(sessionToken, env);
      if (response.ok) {
        verified = true;
      } else {
        const body = await safeJson(response);
        console.warn("Stytch session verification failed", body);
      }
    } catch (error) {
      console.warn("Stytch verification errored", error);
    }
  }

  if (!verified && status !== "success") {
    return htmlResponse(errorPageHtml("Unable to verify session."), 401);
  }

  const sessionId = generateSessionId();
  const record: SessionRecord = {
    id: sessionId,
    created_at: new Date().toISOString(),
  };

  await env.SESSION_KV.put(sessionId, JSON.stringify(record), {
    expirationTtl: DEFAULT_SESSION_TTL_SECONDS,
  });

  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_SECONDS * 1000).toISOString();
  const stytchSessionId = sessionToken ?? `status:${status ?? "success"}`;

  try {
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, stytch_session_id, expires_at) VALUES (?1, ?2, ?3, ?4)`,
    )
      .bind(sessionId, null, stytchSessionId, expiresAt)
      .run();
  } catch (dbError) {
    console.warn("Failed to persist session in D1", dbError);
  }

  const headers = new Headers({ Location: targetLocation });
  setCookie(headers, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: DEFAULT_SESSION_TTL_SECONDS,
  });

  return new Response(null, { status: 302, headers });
}

async function authenticateWithStytch(
  sessionToken: string,
  env: Env,
): Promise<Response> {
  const endpoint = "https://api.stytch.com/v1/sessions/authenticate";
  const credentials = `${env.STYTCH_PROJECT_ID}:${env.STYTCH_SECRET}`;
  const authorization = `Basic ${btoa(credentials)}`;

  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_token: sessionToken }),
  });
}

async function getSession(
  request: Request,
  env: Env,
): Promise<SessionRecord | null> {
  const sessionId = getCookie(request, SESSION_COOKIE);
  if (!sessionId) {
    return null;
  }
  const record = await env.SESSION_KV.get<SessionRecord>(sessionId, "json");
  if (!record) {
    await env.SESSION_KV.delete(sessionId);
    return null;
  }
  const dbSession = await env.DB.prepare(
    `SELECT s.id, s.stytch_session_id, s.expires_at, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?1
      LIMIT 1`,
  )
    .bind(sessionId)
    .first<{ id: string; stytch_session_id: string; expires_at: string; email: string }>();

  if (dbSession) {
    return record;
  }

  if (!record.email || !record.stytch_session_id || !record.expires_at) {
    return record;
  }

  const user = await env.DB.prepare(
    `INSERT INTO users (id, email)
       VALUES (?1, ?2)
       ON CONFLICT(email) DO UPDATE SET email = excluded.email
       RETURNING id`,
  )
    .bind(generateSessionId(), record.email)
    .first<{ id: string }>();

  if (!user) {
    return record;
  }

  try {
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, stytch_session_id, expires_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id,
                                       stytch_session_id = excluded.stytch_session_id,
                                       expires_at = excluded.expires_at`,
    )
      .bind(sessionId, user.id, record.stytch_session_id, record.expires_at)
      .run();
  } catch (error) {
    console.warn('Failed to backfill session in D1', error);
  }

  return record;
}

async function extractSessionTokenFromRequest(
  request: Request,
): Promise<string | null> {
  if (request.method !== "POST") {
    return null;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    return (body["session_token"] as string | undefined) ?? null;
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const value = form.get("session_token");
    return typeof value === "string" ? value : null;
  }
  return null;
}

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAge?: number;
  domain?: string;
};

function setCookie(
  headers: Headers,
  name: string,
  value: string,
  options: CookieOptions = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  headers.append("Set-Cookie", parts.join("; "));
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
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
  const loginUrl = "/login";
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
  <p>justevery ships a turnkey stack powered by Cloudflare, Stytch, and Stripe so you can focus on features, not plumbing.</p>
  <a class="button" href="${loginUrl}">Sign in with Stytch →</a>
  <footer>Need the dashboard? Jump to <a href="${appUrl}">${appUrl}</a> or visit <a href="${landingUrl}">${landingUrl}</a>.</footer>
</main>
</body>
</html>`;
}

function appPageHtml(session: SessionRecord): string {
  const createdAt = new Date(session.created_at).toUTCString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>justevery • App</title>
  <style>
    :root { font-family: Inter, system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
    body { margin: 0; padding: 0; background: linear-gradient(140deg,#0f172a 0%,#1e293b 45%,#312e81 100%); min-height: 100vh; }
    header { padding: 2rem 3rem; display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.9rem; opacity: 0.7; }
    main { padding: 0 3rem 4rem 3rem; display: grid; gap: 2rem; }
    section { background: rgba(15,23,42,0.72); border: 1px solid rgba(148,163,184,0.2); border-radius: 1.2rem; padding: 2rem; box-shadow: 0 24px 48px rgba(15,23,42,0.35); }
    h2 { margin-top: 0; font-size: 1.5rem; }
    p { color: rgba(226,232,240,0.78); line-height: 1.6; }
    a.cta { display: inline-flex; align-items: center; gap: 0.4rem; background: #38bdf8; color: #0f172a; padding: 0.7rem 1.2rem; border-radius: 999px; font-weight: 600; text-decoration: none; box-shadow: 0 14px 28px rgba(56,189,248,0.32); }
  </style>
</head>
<body>
<header>
  <h1>justevery</h1>
  <nav>
    <a class="cta" href="/payments">Payments preview</a>
  </nav>
</header>
<main>
  <section>
    <h2>Welcome back</h2>
    <p>Your session was issued at <code>${createdAt}</code>. This placeholder will evolve into the authenticated dashboard backed by Cloudflare D1.</p>
  </section>
  <section>
    <h2>Next steps</h2>
    <p>Hydrate data from <code>/api/stripe/products</code>, surface subscription status, and fan out to future modules.</p>
  </section>
</main>
</body>
</html>`;
}

function paymentsPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>justevery • Payments Preview</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #0b1120; color: #e2e8f0; margin: 0; padding: 3rem; }
    main { max-width: 48rem; margin: 0 auto; display: grid; gap: 1.5rem; }
    section { background: rgba(15,23,42,0.82); border: 1px solid rgba(30,58,138,0.45); border-radius: 1.2rem; padding: 2rem; }
    h1 { font-size: clamp(2rem, 3vw, 2.6rem); margin-bottom: 0.75rem; }
    p { line-height: 1.7; color: rgba(148,163,184,0.85); }
    code { background: rgba(15,23,42,0.9); padding: 0.15rem 0.35rem; border-radius: 0.35rem; }
  </style>
</head>
<body>
<main>
  <section>
    <h1>Stripe products landing soon</h1>
    <p>This placeholder pulls static configuration from the Worker environment. Replace it with live data from Stripe or cache Stripe API responses via R2.</p>
    <p>Try hitting <code>/api/stripe/products</code> from the client to hydrate your UI.</p>
  </section>
</main>
</body>
</html>`;
}

function errorPageHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>justevery • Authentication error</title>
  <style>
    body { margin: 0; display: grid; place-items: center; min-height: 100vh; font-family: system-ui, sans-serif; background: #111827; color: #f8fafc; }
    main { padding: 2.5rem; border-radius: 1.5rem; background: rgba(15,23,42,0.92); border: 1px solid rgba(148,163,184,0.18); max-width: 30rem; text-align: center; box-shadow: 0 30px 60px rgba(15,23,42,0.45); }
    a { color: #60a5fa; }
  </style>
</head>
<body>
<main>
  <h1>Authentication failed</h1>
  <p>${message}</p>
  <p><a href="/login">Try signing in again</a></p>
</main>
</body>
</html>`;
}

async function requireSession(
  request: Request,
  env: Env,
): Promise<SessionRecord | null> {
  return getSession(request, env);
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
