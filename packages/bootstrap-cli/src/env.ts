import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { relative, resolve } from 'node:path';
import { parse } from 'dotenv';
import { z } from 'zod';
import { formatRedactedMap, redactValue } from './logging.js';

const HOME_ENV_FILE = resolve(homedir(), '.env');
const BASE_ENV_FILES = [HOME_ENV_FILE, '.env', '.env.local'];
const GENERATED_ENV_FILES = ['.env.local.generated'];
const ENV_FILES = [...BASE_ENV_FILES, ...GENERATED_ENV_FILES];

const BaseEnvSchema = z.object({
  PROJECT_ID: z.string().min(1, 'PROJECT_ID is required'),
  PROJECT_DOMAIN: z.string().optional(),
  APP_URL: z.string().optional(),
  APP_BASE_URL: z.string().optional(),
  WORKER_ORIGIN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1, 'CLOUDFLARE_ACCOUNT_ID is required'),
  CLOUDFLARE_API_TOKEN: z.string().min(1, 'CLOUDFLARE_API_TOKEN is required'),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  LOGIN_ORIGIN: z.string().optional(),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  BILLING_CHECKOUT_TOKEN: z.string().optional(),
  STRIPE_MODE: z.string().optional(),
  STRIPE_LIVE_SECRET_KEY: z.string().optional(),
  STRIPE_TEST_SECRET_KEY: z.string().optional(),
  FONT_AWESOME_PACKAGE_TOKEN: z.string().optional()
});

const GeneratedEnvSchema = z.object({
  CLOUDFLARE_D1_NAME: z.string().optional(),
  CLOUDFLARE_D1_ID: z.string().optional(),
  D1_DATABASE_ID: z.string().optional(),
  CLOUDFLARE_R2_BUCKET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  LOGIN_ORIGIN: z.string().optional(),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_URL: z.string().optional(),
  STRIPE_PRODUCTS: z.string().optional(),
  STRIPE_PRODUCT_DEFINITIONS: z.string().optional(),
  STRIPE_PRODUCT_IDS: z.string().optional(),
  STRIPE_PRICE_IDS: z.string().optional(),
  EXPO_PUBLIC_WORKER_ORIGIN: z.string().optional(),
  EXPO_PUBLIC_WORKER_ORIGIN_LOCAL: z.string().optional(),
  D1_DATABASE_NAME: z.string().optional()
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;
export type GeneratedEnv = z.infer<typeof GeneratedEnvSchema>;
export type BootstrapEnv = BaseEnv & GeneratedEnv;

export interface EnvSource {
  path: string;
  exists: boolean;
  category: 'base' | 'generated';
}

export interface EnvReport {
  sources: EnvSource[];
  redacted: Record<string, string>;
  summary: string;
}

export interface LoadEnvironmentOptions {
  cwd?: string;
  overrides?: Partial<Record<string, string | undefined>>;
}

export interface LoadEnvironmentResult {
  env: BootstrapEnv;
  base: BaseEnv;
  generated: GeneratedEnv;
  missingGenerated: string[];
  report: EnvReport;
}

const BASE_KEYS = new Set(Object.keys(BaseEnvSchema.shape));
const GENERATED_KEYS = new Set(Object.keys(GeneratedEnvSchema.shape));
const GENERATED_OVERRIDE_BLOCKLIST = new Set([
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_URL'
]);

export class BootstrapEnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Environment validation failed:\n${issues.map((issue) => `  • ${issue}`).join('\n')}`);
  }
}

export function loadBootstrapEnvironment(options: LoadEnvironmentOptions = {}): LoadEnvironmentResult {
  const cwd = options.cwd ?? process.cwd();
  const baseLayer: Record<string, string> = {};
  const generatedLayer: Record<string, string> = {};
  const sources: EnvSource[] = [];

  for (const entry of ENV_FILES) {
    const filePath = resolve(cwd, entry);
    const exists = existsSync(filePath);
    const category: EnvSource['category'] = GENERATED_ENV_FILES.includes(entry) ? 'generated' : 'base';
    sources.push({ path: filePath, exists, category });
    if (!exists) continue;

    const parsed = parse(readFileSync(filePath));
    distributeEntries(parsed, baseLayer, generatedLayer, category === 'generated');
  }

  applyOverrides(baseLayer, generatedLayer, process.env);
  if (options.overrides) {
    applyOverrides(baseLayer, generatedLayer, options.overrides);
  }

  // Apply fallbacks and derivations before validation
  applyFallbacksAndDerivations(baseLayer, generatedLayer);

  const baseResult = BaseEnvSchema.safeParse(baseLayer);
  if (!baseResult.success) {
    const issues = baseResult.error.issues.map((issue) => issue.message);
    throw new BootstrapEnvError(issues);
  }

  const generatedResult = GeneratedEnvSchema.safeParse(generatedLayer);
  if (!generatedResult.success) {
    const issues = generatedResult.error.issues.map((issue) => issue.message);
    throw new BootstrapEnvError(issues);
  }

  const env: BootstrapEnv = {
    ...baseResult.data,
    ...generatedResult.data
  };

  const validationIssues = validateRequiredKeys(env);
  if (validationIssues.length > 0) {
    throw new BootstrapEnvError(validationIssues);
  }

  const redactedEntries = Object.entries(env).map(([key, value]) => [
    key,
    redactValue(key, value ?? '')
  ]) as Array<[string, string]>;

  const baseSources = sources.filter((source) => source.exists && source.category === 'base');
  const generatedSources = sources.filter(
    (source) => source.exists && source.category === 'generated'
  );

  const missingGenerated = [...GENERATED_KEYS].filter((key) => env[key as keyof BootstrapEnv] == null);

  const summaryLines = [
    `Base env sources: ${
      baseSources.length ? baseSources.map((source) => relative(cwd, source.path)).join(', ') : 'none'
    }`,
    `Generated env sources: ${
      generatedSources.length
        ? generatedSources.map((source) => relative(cwd, source.path)).join(', ')
        : 'none'
    }`
  ];

  if (missingGenerated.length > 0) {
    summaryLines.push(`Missing generated values: ${missingGenerated.join(', ')}`);
  }

  summaryLines.push('Resolved variables:');
  summaryLines.push(formatRedactedMap(redactedEntries));

  return {
    env,
    base: baseResult.data,
    generated: generatedResult.data,
    missingGenerated,
    report: {
      sources,
      redacted: Object.fromEntries(redactedEntries),
      summary: summaryLines.join('\n')
    }
  };
}

function validateRequiredKeys(env: BootstrapEnv): string[] {
  const issues: string[] = [];
  if (!env.BETTER_AUTH_URL) {
    issues.push('BETTER_AUTH_URL is required');
  }
  if (!env.LOGIN_ORIGIN) {
    issues.push('LOGIN_ORIGIN is required');
  }
  if (!env.SESSION_COOKIE_DOMAIN) {
    issues.push('SESSION_COOKIE_DOMAIN is required');
  }
  if (!env.STRIPE_SECRET_KEY) {
    issues.push('STRIPE_SECRET_KEY is required');
  }
  if (!env.STRIPE_PRODUCTS || env.STRIPE_PRODUCTS.trim() === '') {
    issues.push('STRIPE_PRODUCTS is required and must describe at least one plan');
  }
  const hasD1 = Boolean(env.CLOUDFLARE_D1_ID || env.D1_DATABASE_ID);
  if (!hasD1) {
    issues.push('D1 database binding (CLOUDFLARE_D1_ID or D1_DATABASE_ID) is required');
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    issues.push('CLOUDFLARE_ACCOUNT_ID is required');
  }
  if (!env.CLOUDFLARE_API_TOKEN) {
    issues.push('CLOUDFLARE_API_TOKEN is required');
  }
  if (!env.CLOUDFLARE_R2_BUCKET) {
    issues.push('CLOUDFLARE_R2_BUCKET is required');
  }
  if (issues.length > 0) {
    return issues;
  }
  return [];
}

/**
 * Apply fallbacks and derivations to the environment layers before validation.
 * This allows sensible defaults and aliases to be applied non-invasively.
 *
 * Fallbacks (aliases):
 * - STRIPE_SECRET_KEY ← STRIPE_TEST_SECRET_KEY
 *
 * Auto-derived values:
 * - APP_URL ← ${PROJECT_DOMAIN}${APP_BASE_URL || '/app'}
 * - WORKER_ORIGIN ← ${PROJECT_DOMAIN}
 */
function applyFallbacksAndDerivations(
  baseLayer: Record<string, string>,
  generatedLayer: Record<string, string>
): void {
  // Fallbacks for STRIPE secrets: derive from MODE or specific test/live keys.
  if (!baseLayer.STRIPE_SECRET_KEY) {
    const mode = baseLayer.STRIPE_MODE?.trim().toLowerCase();
    if (mode === 'live' && baseLayer.STRIPE_LIVE_SECRET_KEY) {
      baseLayer.STRIPE_SECRET_KEY = baseLayer.STRIPE_LIVE_SECRET_KEY;
    } else if (mode === 'test' && baseLayer.STRIPE_TEST_SECRET_KEY) {
      baseLayer.STRIPE_SECRET_KEY = baseLayer.STRIPE_TEST_SECRET_KEY;
    }
  }
  if (!baseLayer.STRIPE_SECRET_KEY && baseLayer.STRIPE_LIVE_SECRET_KEY) {
    baseLayer.STRIPE_SECRET_KEY = baseLayer.STRIPE_LIVE_SECRET_KEY;
  }
  if (!baseLayer.STRIPE_SECRET_KEY && baseLayer.STRIPE_TEST_SECRET_KEY) {
    baseLayer.STRIPE_SECRET_KEY = baseLayer.STRIPE_TEST_SECRET_KEY;
  }

  // Derivation: APP_URL ← PROJECT_DOMAIN + APP_BASE_URL
  // Derived from PROJECT_DOMAIN + APP_BASE_URL (defaults to '/app')
  if (!baseLayer.APP_URL && baseLayer.PROJECT_DOMAIN) {
    const domain = baseLayer.PROJECT_DOMAIN.replace(/\/$/, '');
    const basePath = baseLayer.APP_BASE_URL ?? '/app';
    const normalisedBasePath = basePath.startsWith('/') ? basePath : `/${basePath}`;
    baseLayer.APP_BASE_URL = normalisedBasePath;
    baseLayer.APP_URL = `${domain}${normalisedBasePath}`;
  }

  // Derivation: WORKER_ORIGIN ← PROJECT_DOMAIN
  // Defaults to PROJECT_DOMAIN when missing
  if (!baseLayer.WORKER_ORIGIN && baseLayer.PROJECT_DOMAIN) {
    baseLayer.WORKER_ORIGIN = baseLayer.PROJECT_DOMAIN.replace(/\/$/, '');
  }

  if (
    !generatedLayer.STRIPE_PRODUCT_DEFINITIONS &&
    generatedLayer.STRIPE_PRODUCTS &&
    !generatedLayer.STRIPE_PRODUCTS.includes('priceId')
  ) {
    generatedLayer.STRIPE_PRODUCT_DEFINITIONS = generatedLayer.STRIPE_PRODUCTS;
  }
}

function distributeEntries(
  source: Record<string, string>,
  baseLayer: Record<string, string>,
  generatedLayer: Record<string, string>,
  preferGenerated: boolean
): void {
  for (const [key, value] of Object.entries(source)) {
    placeValue(baseLayer, generatedLayer, key, value, preferGenerated);
  }
}

function applyOverrides(
  baseLayer: Record<string, string>,
  generatedLayer: Record<string, string>,
  overrides: Partial<Record<string, string | undefined>>
): void {
  for (const [key, rawValue] of Object.entries(overrides)) {
    if (typeof rawValue === 'undefined') continue;
    if (shouldSkipGeneratedOverride(key, generatedLayer)) {
      continue;
    }
    placeValue(baseLayer, generatedLayer, key, String(rawValue), true);
  }
}

function shouldSkipGeneratedOverride(
  key: string,
  generatedLayer: Record<string, string>
): boolean {
  if (!GENERATED_KEYS.has(key)) {
    return false;
  }
  if (!GENERATED_OVERRIDE_BLOCKLIST.has(key)) {
    return false;
  }
  return Boolean(generatedLayer[key]);
}

function placeValue(
  baseLayer: Record<string, string>,
  generatedLayer: Record<string, string>,
  key: string,
  value: string,
  preferGenerated: boolean
): void {
  if (GENERATED_KEYS.has(key)) {
    generatedLayer[key] = value;
    return;
  }
  if (BASE_KEYS.has(key)) {
    baseLayer[key] = value;
    return;
  }
  if (preferGenerated) {
    generatedLayer[key] = value;
  } else {
    baseLayer[key] = value;
  }
}

export function mergeGeneratedValues(
  result: LoadEnvironmentResult,
  updates: Partial<GeneratedEnv>
): LoadEnvironmentResult {
  if (!updates || Object.keys(updates).length === 0) {
    return result;
  }

  const nextGenerated: GeneratedEnv = {
    ...result.generated,
    ...updates
  };

  const nextEnv: BootstrapEnv = {
    ...result.env,
    ...updates
  };

  const missingGenerated = [...GENERATED_KEYS].filter(
    (key) => nextGenerated[key as keyof GeneratedEnv] == null
  );

  return {
    ...result,
    generated: nextGenerated,
    env: nextEnv,
    missingGenerated
  };
}
