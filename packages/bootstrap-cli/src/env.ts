import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parse } from 'dotenv';
import { z } from 'zod';
import { formatRedactedMap, redactValue } from './logging.js';

const BASE_ENV_FILES = ['.env', '.env.local'];
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
  LOGTO_ENDPOINT: z.string().url('LOGTO_ENDPOINT must be a valid URL'),
  LOGTO_API_RESOURCE: z.string().min(1, 'LOGTO_API_RESOURCE is required'),
  LOGTO_MANAGEMENT_ENDPOINT: z.string().optional(),
  LOGTO_MANAGEMENT_AUTH_BASIC: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_TEST_SECRET_KEY: z.string().optional()
});

const GeneratedEnvSchema = z.object({
  CLOUDFLARE_D1_NAME: z.string().optional(),
  CLOUDFLARE_D1_ID: z.string().optional(),
  D1_DATABASE_ID: z.string().optional(),
  CLOUDFLARE_R2_BUCKET: z.string().optional(),
  LOGTO_APPLICATION_ID: z.string().optional(),
  LOGTO_ISSUER: z.string().optional(),
  LOGTO_JWKS_URI: z.string().optional(),
  LOGTO_M2M_APP_ID: z.string().optional(),
  LOGTO_M2M_APP_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_URL: z.string().optional(),
  STRIPE_PRODUCTS: z.string().optional(),
  STRIPE_PRODUCT_IDS: z.string().optional(),
  STRIPE_PRICE_IDS: z.string().optional(),
  EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI: z.string().optional(),
  EXPO_PUBLIC_LOGTO_REDIRECT_URI: z.string().optional(),
  EXPO_PUBLIC_LOGTO_REDIRECT_URI_LOCAL: z.string().optional(),
  EXPO_PUBLIC_LOGTO_REDIRECT_URI_PROD: z.string().optional(),
  EXPO_PUBLIC_WORKER_ORIGIN: z.string().optional(),
  EXPO_PUBLIC_WORKER_ORIGIN_LOCAL: z.string().optional(),
  EXPO_PUBLIC_LOGTO_APP_ID: z.string().optional(),
  EXPO_PUBLIC_LOGTO_ENDPOINT: z.string().optional(),
  EXPO_PUBLIC_API_RESOURCE: z.string().optional()
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

/**
 * Apply fallbacks and derivations to the environment layers before validation.
 * This allows sensible defaults and aliases to be applied non-invasively.
 *
 * Fallbacks (aliases):
 * - STRIPE_SECRET_KEY ← STRIPE_TEST_SECRET_KEY
 *
 * Auto-derived values:
 * - LOGTO_API_RESOURCE ← ${PROJECT_DOMAIN}/api
 * - APP_URL ← ${PROJECT_DOMAIN}${APP_BASE_URL || '/app'}
 * - WORKER_ORIGIN ← ${PROJECT_DOMAIN}
 */
function applyFallbacksAndDerivations(
  baseLayer: Record<string, string>,
  generatedLayer: Record<string, string>
): void {
  // Fallback: STRIPE_SECRET_KEY ← STRIPE_TEST_SECRET_KEY
  // Allows developers to use STRIPE_TEST_SECRET_KEY in .env without duplicating the value
  if (!baseLayer.STRIPE_SECRET_KEY && baseLayer.STRIPE_TEST_SECRET_KEY) {
    baseLayer.STRIPE_SECRET_KEY = baseLayer.STRIPE_TEST_SECRET_KEY;
  }

  // Fallback: LOGTO_API_RESOURCE ← ${PROJECT_DOMAIN}/api
  // Automatically derived from PROJECT_DOMAIN when missing
  if (!baseLayer.LOGTO_API_RESOURCE && baseLayer.PROJECT_DOMAIN) {
    const domain = baseLayer.PROJECT_DOMAIN.replace(/\/$/, '');
    baseLayer.LOGTO_API_RESOURCE = `${domain}/api`;
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
    placeValue(baseLayer, generatedLayer, key, String(rawValue), true);
  }
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
