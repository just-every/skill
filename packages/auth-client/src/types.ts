export interface SessionRecord {
  id: string;
  userId?: string;
  expiresAt?: string;
  issuedAt?: string;
  [key: string]: unknown;
}

export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  [key: string]: unknown;
}

export interface SessionPayload {
  session: SessionRecord | null;
  user?: SessionUser | null;
  error?: unknown;
  [key: string]: unknown;
}

export interface SessionClientOptions {
  /**
   * Fully qualified base URL for Better Auth APIs. Defaults to https://login.justevery.com/api/auth.
   */
  baseUrl?: string;
  /**
   * Custom fetch implementation (for SSR/tests).
   */
  fetch?: typeof fetch;
  /**
   * Credentials mode for fetch requests (defaults to `include`).
   */
  credentials?: RequestCredentials;
}

export interface EmailSignInParams {
  email: string;
  password: string;
}

export interface EmailSignUpParams {
  name?: string;
  email: string;
  password: string;
  callbackURL?: string;
}

export interface VerificationEmailParams {
  email: string;
  callbackURL?: string;
}

export interface SocialSignInParams {
  provider: string;
  returnUrl?: string;
  state?: Record<string, unknown>;
}

export interface PasskeyAuthParams {
  name?: string;
  credential: Record<string, unknown>;
}
