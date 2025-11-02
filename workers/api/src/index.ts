export interface Env {
  SESSION_KV: KVNamespace;
  DB: D1Database;
  STORAGE: R2Bucket;
  STYTCH_PROJECT_ID: string;
  STYTCH_SECRET: string;
  STYTCH_LOGIN_URL?: string;
  STYTCH_REDIRECT_URL?: string;
  APP_BASE_URL?: string;
  LANDING_URL?: string;
  STRIPE_PRODUCTS?: string;
}

const SESSION_COOKIE = "je_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // one week

type SessionRecord = {
  stytch_session_id: string;
  expires_at: string;
  email?: string;
  created_at: string;
};

type StytchSessionResponse = {
  session: {
    id: string;
    expires_at: string;
    attributes?: {
      email_address?: string;
    };
  };
};

const Worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = normalisePath(url.pathname);

    switch (pathname) {
      case "/":
        return htmlResponse(landingPageHtml(env));
      case "/login":
        return loginRedirect(url, env);
      case "/auth/callback":
        return handleAuthCallback(request, url, env);
      case "/app":
        return handleApp(request, env);
      case "/payments":
        return htmlResponse(paymentsPageHtml());
      case "/api/session":
        return handleSessionApi(request, env);
      case "/api/stripe/products":
        return handleStripeProducts(env);
      case "/webhook/stripe":
        return handleStripeWebhook(request);
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

async function handleStripeProducts(env: Env): Promise<Response> {
  try {
    const products = parseStripeProducts(env.STRIPE_PRODUCTS);
    return jsonResponse({ products });
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

async function handleStripeWebhook(request: Request): Promise<Response> {
  const payload = await request.text();
  console.log("Received Stripe webhook payload", payload.slice(0, 256));
  return new Response(null, { status: 204 });
}

function loginRedirect(url: URL, env: Env): Response {
  const redirectUrl =
    env.STYTCH_REDIRECT_URL ?? new URL("/auth/callback", url.origin).toString();
  const loginBase = env.STYTCH_LOGIN_URL ?? "https://login.justevery.com";
  const target = new URL(loginBase);
  target.searchParams.set("public_token", env.STYTCH_PROJECT_ID);
  target.searchParams.set("redirect_url", redirectUrl);
  return redirectResponse(target.toString());
}

async function handleAuthCallback(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const sessionToken =
    url.searchParams.get("session_token") ??
    (await extractSessionTokenFromRequest(request));

  if (!sessionToken) {
    return htmlResponse(errorPageHtml("Missing session token."), 400);
  }

  const stytchResponse = await authenticateWithStytch(sessionToken, env);
  if (!stytchResponse.ok) {
    const body = await safeJson(stytchResponse);
    console.error("Failed to authenticate with Stytch", body);
    return htmlResponse(errorPageHtml("Unable to verify session."), 401);
  }

  const payload = (await stytchResponse.json()) as StytchSessionResponse;
  const sessionId = crypto.randomUUID();
  const expiresAt = payload.session.expires_at ?? new Date().toISOString();

  const record: SessionRecord = {
    stytch_session_id: payload.session.id,
    expires_at: expiresAt,
    email: payload.session.attributes?.email_address,
    created_at: new Date().toISOString(),
  };

  const ttlSeconds = computeSessionTTL(expiresAt);
  await env.SESSION_KV.put(sessionId, JSON.stringify(record), {
    expirationTtl: ttlSeconds,
  });

  const headers = new Headers({
    Location: env.APP_BASE_URL ?? "/app",
  });
  setCookie(headers, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: ttlSeconds,
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
    return null;
  }
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await env.SESSION_KV.delete(sessionId);
    return null;
  }
  return record;
}

function computeSessionTTL(expiresAt: string | undefined): number {
  if (!expiresAt) {
    return DEFAULT_SESSION_TTL_SECONDS;
  }
  const expires = new Date(expiresAt).getTime();
  const ttl = Math.floor((expires - Date.now()) / 1000);
  return ttl > 0 ? ttl : DEFAULT_SESSION_TTL_SECONDS;
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
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
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
  const greeting = session.email ? `, ${session.email}` : "";
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
    <h2>Welcome${greeting}</h2>
    <p>Your Stytch session is active. This placeholder will evolve into the authenticated dashboard backed by Cloudflare D1.</p>
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
