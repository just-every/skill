import type { Session, SessionVerifierOptions, VerifySessionResult } from './types';

/**
 * In-memory cache fallback
 */
class MemoryCache {
  private store = new Map<string, { value: Session; expiresAt: number }>();

  async get(key: string): Promise<Session | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: Session, ttl: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  clear(): void {
    this.store.clear();
  }
}

const memoryCache = new MemoryCache();

/**
 * Creates a session verifier function
 *
 * @example
 * ```ts
 * const verifySession = createSessionVerifier({
 *   loginOrigin: 'https://login.justevery.com',
 *   cacheTtl: 300, // 5 minutes
 *   cache: caches.default, // or undefined for in-memory
 * });
 *
 * const result = await verifySession(request);
 * if (result.ok) {
 *   console.log('User:', result.session.user.email);
 * } else {
 *   console.error('Auth failed:', result.error);
 * }
 * ```
 */
export function createSessionVerifier(options: SessionVerifierOptions) {
  const { loginOrigin, cacheTtl = 300, cache } = options;

  return async function verifySession(request: Request): Promise<VerifySessionResult> {
    // Extract cookie header
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) {
      return {
        ok: false,
        error: 'missing_cookie',
        status: 401,
      };
    }

    // Check cache first
    const cacheKey = `session:${hashString(cookieHeader)}`;

    // Try cache
    const cached = cache
      ? await getCachedSession(cache, cacheKey)
      : await memoryCache.get(cacheKey);

    if (cached) {
      return { ok: true, session: cached };
    }

    // Fetch from login worker
    const sessionUrl = `${loginOrigin}/api/auth/session`;

    let response: Response;
    try {
      response = await fetch(sessionUrl, {
        method: 'GET',
        headers: {
          cookie: cookieHeader,
        },
      });
    } catch (error) {
      return {
        ok: false,
        error: 'fetch_failed',
        detail: error instanceof Error ? error.message : String(error),
        status: 502,
      };
    }

    if (!response.ok) {
      if (response.status === 401) {
        return {
          ok: false,
          error: 'unauthorized',
          status: 401,
        };
      }
      return {
        ok: false,
        error: 'upstream_error',
        detail: `${response.status} ${response.statusText}`,
        status: 502,
      };
    }

    // Parse session
    let session: Session;
    try {
      session = await response.json();
    } catch (error) {
      return {
        ok: false,
        error: 'parse_error',
        detail: error instanceof Error ? error.message : String(error),
        status: 502,
      };
    }

    // Validate session
    if (!session || !session.session || !session.user) {
      return {
        ok: false,
        error: 'invalid_session_format',
        status: 401,
      };
    }

    const hydrated = hydrateSession(session);

    // Cache the result
    if (cache) {
      await setCachedSession(cache, cacheKey, hydrated, cacheTtl);
    } else {
      await memoryCache.set(cacheKey, hydrated, cacheTtl);
    }

    return { ok: true, session: hydrated };
  };
}

/**
 * Simple hash function for cache keys
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get cached session from Cache API
 */
async function getCachedSession(cache: Cache, key: string): Promise<Session | undefined> {
  const url = `https://cache.internal/${key}`;
  const cached = await cache.match(url);
  if (!cached) return undefined;

  try {
    const session = await cached.json() as Session;
    return session;
  } catch {
    return undefined;
  }
}

/**
 * Set cached session in Cache API
 */
async function setCachedSession(
  cache: Cache,
  key: string,
  session: Session,
  ttl: number
): Promise<void> {
  const url = `https://cache.internal/${key}`;
  const response = new Response(JSON.stringify(session), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `max-age=${ttl}`,
    },
  });
  await cache.put(url, response);
}

function hydrateSession(payload: Session): NonNullable<Session> {
  if (!payload || !payload.session || !payload.user) {
    throw new Error('invalid_session_format');
  }

  const toDate = (value: unknown): Date => {
    if (value instanceof Date) return value;
    const date = new Date(value as string);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  };

  return {
    session: {
      ...payload.session,
      createdAt: toDate(payload.session.createdAt),
      updatedAt: toDate(payload.session.updatedAt),
      expiresAt: toDate(payload.session.expiresAt),
    },
    user: {
      ...payload.user,
      createdAt: toDate(payload.user.createdAt),
      updatedAt: toDate(payload.user.updatedAt),
    },
  };
}
