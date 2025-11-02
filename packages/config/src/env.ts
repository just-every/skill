export type ResolvedEnv = {
  PROJECT_ID: string;
  LANDING_URL: string;
  APP_URL: string;
  STRIPE_PRODUCTS: string;
  STYTCH_PROJECT_ID: string;
  STYTCH_SECRET: string;
  STYTCH_PUBLIC_TOKEN?: string;
  STYTCH_LOGIN_URL?: string;
  STYTCH_REDIRECT_URL?: string;
  STYTCH_SSO_CONNECTION_ID?: string;
  STYTCH_ORGANIZATION_SLUG?: string;
  STYTCH_ORGANIZATION_ID?: string;
  STYTCH_SSO_DOMAIN?: string;
  APP_BASE_URL?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  CLOUDFLARE_ZONE_ID?: string;
};

const REQUIRED_KEYS = [
  'PROJECT_ID',
  'LANDING_URL',
  'APP_URL',
  'STRIPE_PRODUCTS',
  'STYTCH_PROJECT_ID',
  'STYTCH_SECRET',
] as const;

const OPTIONAL_KEYS = [
  'STYTCH_PUBLIC_TOKEN',
  'STYTCH_LOGIN_URL',
  'STYTCH_REDIRECT_URL',
  'STYTCH_SSO_CONNECTION_ID',
  'STYTCH_ORGANIZATION_SLUG',
  'STYTCH_ORGANIZATION_ID',
  'STYTCH_SSO_DOMAIN',
  'APP_BASE_URL',
  'STRIPE_WEBHOOK_SECRET',
  'CLOUDFLARE_ZONE_ID',
] as const;

const URL_KEYS = new Set<keyof ResolvedEnv>([
  'LANDING_URL',
  'APP_URL',
  'STYTCH_LOGIN_URL',
  'STYTCH_REDIRECT_URL',
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

  if (key === 'STYTCH_ORGANIZATION_SLUG' && value.includes('://')) {
    throw new Error('STYTCH_ORGANIZATION_SLUG must be a slug, not a URL');
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
