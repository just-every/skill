/**
 * Web environment configuration (Expo/React Native Web)
 *
 * Handles EXPO_PUBLIC_ prefixed variables, window.__ENV__ injection,
 * and runtime env resolution.
 */

export type WebEnvSource =
  | 'static'    // process.env / EXPO_PUBLIC_
  | 'injected'  // window.__JUSTEVERY_ENV__
  | 'runtime';  // /api/runtime-env fetch

export interface WebEnvConfig<T> {
  staticEnv: T;
  injectedEnv?: Partial<T>;
  source: WebEnvSource;
}

export type WebEnvGetter = (key: string, prefix?: string) => string | undefined;

/**
 * Creates an environment getter for web/Expo environments.
 * Reads from process.env with optional EXPO_PUBLIC_ prefix.
 */
export function createWebEnvGetter(prefix = 'EXPO_PUBLIC_'): WebEnvGetter {
  const source = typeof process !== 'undefined' && process.env ? process.env : {};

  return (key: string, customPrefix?: string): string | undefined => {
    const actualPrefix = customPrefix ?? prefix;
    const prefixedKey = actualPrefix ? `${actualPrefix}${key}` : key;
    const value = source[prefixedKey];

    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
}

/**
 * Reads injected environment from window global.
 * Returns undefined if not in browser or not injected.
 */
export function getInjectedEnv<T = Record<string, unknown>>(): T | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const candidate = (window as { __JUSTEVERY_ENV__?: T }).__JUSTEVERY_ENV__;
  return candidate;
}

/**
 * Normalizes a string value (trims, returns undefined for empty).
 */
export function normalizeValue(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parses a comma/space-separated list into an array.
 */
export function parseList(value?: string): string[] {
  if (!value || typeof value !== 'string') {
    return [];
  }
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Fetches runtime environment from a worker endpoint.
 * Returns null if fetch fails or not in browser.
 */
export async function fetchRuntimeEnv<T = Record<string, unknown>>(
  endpoint = '/api/runtime-env'
): Promise<T | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.warn('Failed to fetch runtime env', error);
    return null;
  }
}

/**
 * Helper to merge static, injected, and runtime env sources.
 * Priority: runtime > injected > static (right to left)
 */
export function mergeEnv<T extends Record<string, unknown>>(
  staticEnv: T,
  injectedEnv?: Partial<T>,
  runtimeEnv?: Partial<T>
): T {
  return {
    ...staticEnv,
    ...(injectedEnv ?? {}),
    ...(runtimeEnv ?? {}),
  } as T;
}
