import { createSessionVerifier, type Session, type VerifySessionResult } from '@justevery/auth-shared';
import type { Env } from './index';

/**
 * Authenticated session with user information
 */
export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  emailAddress: string;
  expiresAt: string;
  session: Session;
};

/**
 * Authentication failure reasons
 */
export type AuthFailureReason =
  | 'missing_cookie'
  | 'unauthorized'
  | 'fetch_failed'
  | 'upstream_error'
  | 'parse_error'
  | 'invalid_session_format';

/**
 * Authentication result types
 */
export type AuthSuccess = {
  ok: true;
  session: AuthenticatedSession;
};

export type AuthFailure = {
  ok: false;
  reason: AuthFailureReason;
  error?: unknown;
  errorDescription?: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Per-request cache to avoid multiple auth checks
 */
const requestSessionCache = new WeakMap<Request, AuthResult>();

const LOCAL_HOST_HINTS = ['127.0.0.1', 'localhost'];

const mask = (value?: string | null) => {
  if (!value) return value ?? '';
  if (value.length <= 8) return `${value[0]}***${value[value.length - 1]}`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
};

const hostLooksLocal = (candidate?: string | null) => {
  if (!candidate) return false;
  return LOCAL_HOST_HINTS.some((hint) => candidate.includes(hint));
};

const shouldTrace = (request: Request, env: Env): boolean => {
  const header = request.headers.get('x-debug-session-trace');
  if (header && ['1', 'true', 'yes'].includes(header.toLowerCase())) return true;
  try {
    const host = new URL(request.url).hostname;
    if (hostLooksLocal(host)) return true;
  } catch {
    // ignore
  }
  return (
    hostLooksLocal(env.LOGIN_ORIGIN) ||
    hostLooksLocal(env.BETTER_AUTH_URL) ||
    hostLooksLocal(env.SESSION_COOKIE_DOMAIN) ||
    hostLooksLocal(env.PROJECT_DOMAIN)
  );
};

const getRequestId = (request: Request): string => {
  const existing = (request as unknown as { __traceId?: string }).__traceId;
  if (existing) return existing;
  const next =
    request.headers.get('cf-ray') ||
    request.headers.get('x-request-id') ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(16).slice(2));
  (request as unknown as { __traceId?: string }).__traceId = next;
  return next;
};

const trace = (request: Request, env: Env, label: string, data: Record<string, unknown>) => {
  if (!shouldTrace(request, env)) return;
  const requestId = getRequestId(request);
  console.info('[session-trace]', label, { requestId, ...data });
};

/**
 * Authenticate a request using Better Auth session verification
 */
export async function authenticateRequest(request: Request, env: Env): Promise<AuthResult> {
  // Check request cache
  const cached = requestSessionCache.get(request);
  if (cached) {
    trace(request, env, 'authenticate.cached', {
      result: cached.ok ? 'ok' : 'fail',
    });
    return cached;
  }

  // Local dev bypass: trust a deterministic token on localhost to avoid real Better Auth dependency.
  const bypass = localDevBypass(request, env);
  if (bypass) {
    requestSessionCache.set(request, bypass);
    trace(request, env, 'authenticate.dev-bypass', { ok: bypass.ok });
    return bypass;
  }

  // Create session verifier
  const verifySession = createSessionVerifier({
    loginOrigin: env.LOGIN_ORIGIN,
    betterAuthUrl: env.BETTER_AUTH_URL,
    cacheTtl: 300, // 5 minutes
    // Use Cloudflare's Cache API if available, otherwise falls back to in-memory
    cache: typeof caches !== 'undefined' && 'default' in caches ? (caches as any).default : undefined,
    fetchImpl: resolveLoginFetcher(env),
  });

  // Verify session
  const result = await verifySession(request);

  trace(request, env, 'authenticate.verify', {
    ok: result.ok,
    detail: result.detail ?? result.error,
  });

  if (!result.ok) {
    const reason = (result.error as AuthFailureReason) ?? 'unauthorized';
    const failure: AuthFailure = {
      ok: false,
      reason,
      errorDescription: result.detail ?? result.error,
    };
    trace(request, env, 'authenticate.failure', {
      reason,
      description: failure.errorDescription,
    });
    requestSessionCache.set(request, failure);
    return failure;
  }

  // Map session to AuthenticatedSession
  const session = result.session;
  const expiresAtValue = session.session.expiresAt;
  const expiresAt = normalizeTimestamp(expiresAtValue);
  const authenticatedSession: AuthenticatedSession = {
    sessionId: session.session.id,
    userId: session.user.id,
    emailAddress: session.user.email,
    expiresAt,
    session,
  };

  const success: AuthSuccess = {
    ok: true,
    session: authenticatedSession,
  };

  trace(request, env, 'authenticate.success', {
    sessionId: mask(session.session.id),
    userId: mask(session.user.id),
    email: mask(session.user.email),
    expiresAt,
  });

  requestSessionCache.set(request, success);
  return success;
}

function localDevBypass(request: Request, env: Env): AuthResult | null {
  const devToken = env.DEV_SESSION_TOKEN ?? 'devtoken';
  if (!devToken) return null;

  const token = readSessionToken(request, devToken);
  const isMatch = token === devToken;
  trace(request, env, 'dev-bypass.check', {
    provided: Boolean(token),
    match: isMatch,
  });
  if (!isMatch) return null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const session: AuthenticatedSession = {
    sessionId: 'dev-session',
    userId: 'dev-user',
    emailAddress: 'dev@example.com',
    expiresAt: expiresAt.toISOString(),
    session: {
      session: {
        id: 'dev-session',
        createdAt: now,
        updatedAt: now,
        expiresAt,
        token,
        userId: 'dev-user',
        ipAddress: '127.0.0.1',
        userAgent: request.headers.get('user-agent') ?? 'dev',
      },
      user: {
        id: 'dev-user',
        email: 'dev@example.com',
        emailVerified: true,
        name: 'Dev User',
        createdAt: now,
        updatedAt: now,
      },
    },
  };

  console.info('[auth][dev-bypass] issuing dev session');
  return { ok: true, session };
}

function readSessionToken(request: Request, devToken?: string): string | null {
  const headerToken = request.headers.get('x-session-token');
  if (headerToken) return headerToken.trim();

  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  if (devToken && cookie.includes(devToken)) return devToken;
  const match = cookie
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.toLowerCase().startsWith('better-auth.session_token='));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : null;
}

/**
 * Require an authenticated session (convenience wrapper)
 */
export async function requireAuthenticatedSession(request: Request, env: Env): Promise<AuthResult> {
  return authenticateRequest(request, env);
}

/**
 * Interpret auth failure for HTTP response
 */
export function interpretAuthFailure(
  failure: AuthFailure
): { status: number; error: string; description: string } {
  const description = failure.errorDescription ?? failure.reason;

  switch (failure.reason) {
    case 'missing_cookie':
      return {
        status: 401,
        error: 'missing_cookie',
        description: 'Authentication cookie required',
      };
    case 'unauthorized':
      return {
        status: 401,
        error: 'unauthorized',
        description: 'Invalid or expired session',
      };
    case 'fetch_failed':
    case 'upstream_error':
      return {
        status: 502,
        error: 'bad_gateway',
        description: description || 'Unable to verify session',
      };
    case 'parse_error':
    case 'invalid_session_format':
      return {
        status: 502,
        error: 'bad_gateway',
        description: description || 'Invalid session response',
      };
    default:
      return {
        status: 401,
        error: 'unauthorized',
        description: description || 'Authentication failed',
      };
  }
}

/**
 * Create a success response for session API
 */
export function sessionSuccessResponse(session: AuthenticatedSession): Response {
  return new Response(
    JSON.stringify({
      authenticated: true,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      emailAddress: session.emailAddress,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    }
  );
}

/**
 * Create a failure response for session API
 */
export function sessionFailureResponse(failure: AuthFailure): Response {
  return new Response(
    JSON.stringify({
      authenticated: false,
      sessionId: null,
      expiresAt: null,
      emailAddress: null,
    }),
    {
      status: interpretAuthFailure(failure).status,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    }
  );
}

/**
 * Create a standard auth failure response
 */
export function authFailureResponse(failure: AuthFailure): Response {
  const { status, error, description } = interpretAuthFailure(failure);
  return new Response(
    JSON.stringify({
      error,
      error_description: description,
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    }
  );
}

function resolveLoginFetcher(env: Env): typeof fetch | undefined {
  const service = env.LOGIN_SERVICE;
  const isLocalLogin = env.BETTER_AUTH_URL?.includes('127.0.0.1:9787') || env.LOGIN_ORIGIN?.includes('127.0.0.1:9787');

  // When using the local dev proxy on 9787 we want to hit HTTP directly, not the service binding
  if (!isLocalLogin && service && typeof service.fetch === 'function') {
    return service.fetch.bind(service);
  }
  return undefined;
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  try {
    return new Date(value as any).toISOString();
  } catch {
    return new Date().toISOString();
  }
}
