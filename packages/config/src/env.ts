export type ResolvedEnv = {
  PROJECT_NAME: string;
  PROJECT_ID: string;
  PROJECT_DOMAIN: string;
  APP_URL: string;
  STRIPE_PRODUCTS: string;
  APP_BASE_URL?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  CLOUDFLARE_ZONE_ID?: string;
  LOGIN_ORIGIN?: string;
  BETTER_AUTH_URL?: string;
  SESSION_ENDPOINT?: string;
  EXPO_PUBLIC_LOGIN_ORIGIN?: string;
  EXPO_PUBLIC_BETTER_AUTH_URL?: string;
  EXPO_PUBLIC_SESSION_ENDPOINT?: string;
};

const REQUIRED_KEYS = [
  'PROJECT_NAME',
  'PROJECT_ID',
  'PROJECT_DOMAIN',
  'APP_URL',
  'STRIPE_PRODUCTS',
] as const;

const OPTIONAL_KEYS = [
  'APP_BASE_URL',
  'STRIPE_WEBHOOK_SECRET',
  'CLOUDFLARE_ZONE_ID',
  'LOGIN_ORIGIN',
  'BETTER_AUTH_URL',
  'SESSION_ENDPOINT',
  'EXPO_PUBLIC_LOGIN_ORIGIN',
  'EXPO_PUBLIC_BETTER_AUTH_URL',
  'EXPO_PUBLIC_SESSION_ENDPOINT',
] as const;

const URL_KEYS = new Set<keyof ResolvedEnv>([
  'PROJECT_DOMAIN',
  'APP_URL',
  'LOGIN_ORIGIN',
  'BETTER_AUTH_URL',
  'SESSION_ENDPOINT',
  'EXPO_PUBLIC_LOGIN_ORIGIN',
  'EXPO_PUBLIC_BETTER_AUTH_URL',
  'EXPO_PUBLIC_SESSION_ENDPOINT',
]);

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/i;

export function requiredEnv(): readonly typeof REQUIRED_KEYS[number][] {
  return REQUIRED_KEYS;
}

export function resolveEnv(getter: (key: string) => string | undefined): ResolvedEnv {
  const values: Partial<ResolvedEnv> = {};

  for (const key of REQUIRED_KEYS) {
    const raw = getter(key);
    if (!isNonEmptyString(raw)) {
      throw new Error(`Missing environment variable: ${key}`);
    }
    const value = raw.trim();
    validateValue(key, value);
    values[key] = value;
  }

  for (const key of OPTIONAL_KEYS) {
    const raw = getter(key);
    const value = normaliseOptional(raw);
    if (value === undefined) {
      continue;
    }
    validateValue(key, value);
    values[key] = value;
  }

  return values as ResolvedEnv;
}

function validateValue(key: keyof ResolvedEnv, value: string): void {
  if (URL_KEYS.has(key) && !isValidUrl(value)) {
    throw new Error(`Invalid URL provided for ${key}`);
  }

  if (key === 'PROJECT_ID' && !PROJECT_ID_PATTERN.test(value)) {
    throw new Error('PROJECT_ID must contain only letters, numbers, hyphen, or underscore');
  }

}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normaliseOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
