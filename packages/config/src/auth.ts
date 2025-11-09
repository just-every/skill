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
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

export function resolveAuthConfig(getter: (key: string) => string | undefined): AuthConfig {
  const loginOrigin = normaliseOrigin(
    getter('LOGIN_ORIGIN') ??
      getter('EXPO_PUBLIC_LOGIN_ORIGIN') ??
      DEFAULT_LOGIN_ORIGIN
  );

  const betterAuthBaseUrl = ensureBetterAuthBaseUrl(
    getter('BETTER_AUTH_URL') ?? getter('EXPO_PUBLIC_BETTER_AUTH_URL'),
    loginOrigin
  );

  const sessionEndpoint = ensureSessionEndpoint(
    getter('SESSION_ENDPOINT') ?? getter('EXPO_PUBLIC_SESSION_ENDPOINT'),
    betterAuthBaseUrl
  );

  return {
    loginOrigin,
    betterAuthBaseUrl,
    sessionEndpoint,
  };
}

export function ensureBetterAuthBaseUrl(value: string | undefined, loginOrigin: string): string {
  const sanitizedOrigin = trimTrailingSlash(loginOrigin || DEFAULT_LOGIN_ORIGIN) || DEFAULT_LOGIN_ORIGIN;
  const fallback = `${sanitizedOrigin}${DEFAULT_API_PATH}`;
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const url = ABSOLUTE_URL_PATTERN.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed, sanitizedOrigin);
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = DEFAULT_API_PATH;
    }
    url.search = '';
    url.hash = '';
    return trimTrailingSlash(url.toString());
  } catch {
    return fallback;
  }
}

export function ensureSessionEndpoint(value: string | undefined, betterAuthBaseUrl: string): string {
  const base = trimTrailingSlash(betterAuthBaseUrl) || `${DEFAULT_LOGIN_ORIGIN}${DEFAULT_API_PATH}`;
  const fallback = `${base}/session`;
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (ABSOLUTE_URL_PATTERN.test(trimmed)) {
    try {
      const absolute = new URL(trimmed);
      const baseUrl = new URL(base);
      if (absolute.origin === baseUrl.origin && absolute.pathname.replace(/\/+$/, '') === '/session') {
        return fallback;
      }
      return trimTrailingSlash(absolute.toString());
    } catch {
      return fallback;
    }
  }

  const relative = trimmed.replace(/^\/+/, '');
  if (!relative) {
    return fallback;
  }
  return `${base}/${relative}`;
}

function normaliseOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_LOGIN_ORIGIN;
  }
  try {
    const url = new URL(trimmed);
    return trimTrailingSlash(url.toString());
  } catch {
    if (!ABSOLUTE_URL_PATTERN.test(trimmed)) {
      try {
        const candidate = trimmed.replace(/^\/+/, '');
        const url = new URL(`https://${candidate}`);
        return trimTrailingSlash(url.toString());
      } catch {
        return DEFAULT_LOGIN_ORIGIN;
      }
    }
    return DEFAULT_LOGIN_ORIGIN;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
