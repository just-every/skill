/**
 * Worker environment configuration (Cloudflare Workers)
 *
 * Typed access to Cloudflare Worker bindings (env parameter).
 */

/**
 * Creates a typed environment getter from Cloudflare Worker env bindings.
 */
export function createWorkerEnvGetter<T extends Record<string, unknown>>(
  env: T
): (key: keyof T) => string | undefined {
  return (key: keyof T): string | undefined => {
    const value = env[key];
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
}

/**
 * Extracts required keys from worker env, throws if missing.
 */
export function getRequiredWorkerEnv<T extends Record<string, unknown>, K extends keyof T>(
  env: T,
  keys: readonly K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;

  for (const key of keys) {
    const value = env[key];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing required worker env: ${String(key)}`);
    }
    result[key] = value;
  }

  return result;
}

/**
 * Extracts optional keys from worker env, skips undefined/null/empty.
 */
export function getOptionalWorkerEnv<T extends Record<string, unknown>, K extends keyof T>(
  env: T,
  keys: readonly K[]
): Partial<Pick<T, K>> {
  const result = {} as Partial<Pick<T, K>>;

  for (const key of keys) {
    const value = env[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    result[key] = value;
  }

  return result;
}

/**
 * Validates that required worker env keys are present and non-empty.
 */
export function validateWorkerEnv<T extends Record<string, unknown>>(
  env: T,
  requiredKeys: readonly (keyof T)[]
): void {
  const missing: (keyof T)[] = [];

  for (const key of requiredKeys) {
    const value = env[key];
    if (value === undefined || value === null || value === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required worker env variables: ${missing.map(String).join(', ')}`
    );
  }
}
