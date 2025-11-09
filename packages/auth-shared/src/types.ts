/**
 * Session shape returned by Better Auth /api/auth/session endpoint
 */
export type Session = {
  session: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    token: string;
    ipAddress?: string;
    userAgent?: string;
    userId: string;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    image?: string;
  };
} | null;

/**
 * Options for the session verifier
 */
export type SessionVerifierOptions = {
  /**
   * Origin of the login worker (e.g., https://login.justevery.com)
   */
  loginOrigin: string;

  /**
   * Optional override for the Better Auth API base (defaults to `${loginOrigin}/api/auth`).
   */
  betterAuthUrl?: string;

  /**
   * Optional override for the session endpoint (defaults to `${betterAuthUrl}/session`).
   */
  sessionEndpoint?: string;

  /**
   * Optional cache TTL in seconds (default: 300 = 5 minutes)
   */
  cacheTtl?: number;

  /**
   * Optional cache instance (in-memory or caches.default)
   */
  cache?: Cache;
};

/**
 * Result of session verification
 */
export type VerifySessionResult =
  | { ok: true; session: NonNullable<Session> }
  | { ok: false; error: string; status: number; detail?: string };
