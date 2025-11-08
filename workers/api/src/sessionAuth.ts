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

/**
 * Authenticate a request using Better Auth session verification
 */
export async function authenticateRequest(request: Request, env: Env): Promise<AuthResult> {
  // Check request cache
  const cached = requestSessionCache.get(request);
  if (cached) {
    return cached;
  }

  // Create session verifier
  const verifySession = createSessionVerifier({
    loginOrigin: env.LOGIN_ORIGIN,
    cacheTtl: 300, // 5 minutes
    // Use Cloudflare's Cache API if available, otherwise falls back to in-memory
    cache: typeof caches !== 'undefined' && 'default' in caches ? (caches as any).default : undefined,
  });

  // Verify session
  const result = await verifySession(request);

  if (!result.ok) {
    const reason = (result.error as AuthFailureReason) ?? 'unauthorized';
    const failure: AuthFailure = {
      ok: false,
      reason,
      errorDescription: result.detail ?? result.error,
    };
    requestSessionCache.set(request, failure);
    return failure;
  }

  // Map session to AuthenticatedSession
  const session = result.session;
  const authenticatedSession: AuthenticatedSession = {
    sessionId: session.session.id,
    userId: session.user.id,
    emailAddress: session.user.email,
    expiresAt: session.session.expiresAt.toISOString(),
    session,
  };

  const success: AuthSuccess = {
    ok: true,
    session: authenticatedSession,
  };

  requestSessionCache.set(request, success);
  return success;
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
