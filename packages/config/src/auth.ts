export interface AuthConfig {
  /** Origin serving the Better Auth worker UI. */
  loginOrigin: string;
  /** Base URL for Better Auth API endpoints (defaults to `${loginOrigin}/api/auth`). */
  betterAuthBaseUrl: string;
  /** Fully qualified session endpoint (defaults to `${betterAuthBaseUrl}/session`). */
  sessionEndpoint: string;
}

export const DEFAULT_LOGIN_ORIGIN = 'https://login.justevery.com';
const DEFAULT_API_PATH = '/api/auth';

export function resolveAuthConfig(getter: (key: string) => string | undefined): AuthConfig {
  const loginOrigin = normaliseUrl(
    getter('LOGIN_ORIGIN') ??
      getter('EXPO_PUBLIC_LOGIN_ORIGIN') ??
      DEFAULT_LOGIN_ORIGIN
  );

  const betterAuthBaseUrl = normaliseUrl(
    getter('BETTER_AUTH_URL') ??
      getter('EXPO_PUBLIC_BETTER_AUTH_URL') ??
      `${loginOrigin}${DEFAULT_API_PATH}`
  );

  const sessionEndpoint = normaliseUrl(
    getter('SESSION_ENDPOINT') ??
      getter('EXPO_PUBLIC_SESSION_ENDPOINT') ??
      `${betterAuthBaseUrl}/session`
  );

  return {
    loginOrigin,
    betterAuthBaseUrl,
    sessionEndpoint,
  };
}

function normaliseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_LOGIN_ORIGIN;
  }
  try {
    const url = new URL(trimmed);
    const normalized = url.toString();
    return normalized.endsWith('/') ? normalized.replace(/\/+$/, '') : normalized;
  } catch {
    if (trimmed.startsWith('/')) {
      return `${DEFAULT_LOGIN_ORIGIN}${trimmed}`;
    }
    return trimmed;
  }
}
