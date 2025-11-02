export type ResolvedEnv = {
  PROJECT_ID: string;
  LANDING_URL: string;
  APP_URL: string;
  STRIPE_PRODUCTS: string;
};

const REQUIRED_KEYS = [
  'PROJECT_ID',
  'LANDING_URL',
  'APP_URL',
  'STRIPE_PRODUCTS',
] as const;

export function requiredEnv(): readonly string[] {
  return REQUIRED_KEYS;
}

export function resolveEnv(getter: (key: string) => string | undefined): ResolvedEnv {
  const values: Partial<ResolvedEnv> = {};
  for (const key of REQUIRED_KEYS) {
    const value = getter(key);
    if (!value) {
      throw new Error(`Missing environment variable: ${key}`);
    }
    values[key] = value as string;
  }
  return values as ResolvedEnv;
}
