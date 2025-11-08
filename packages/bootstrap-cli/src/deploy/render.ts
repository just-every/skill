import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import type { BootstrapEnv } from '../env.js';
import type { CloudflareCapabilities } from '../providers/cloudflare.js';
import { writeFileIfChanged, type FileWriteResult } from '../files.js';

export interface RenderOptions {
  cwd?: string;
  checkOnly?: boolean;
  env: BootstrapEnv;
  capabilities?: CloudflareCapabilities;
}

const TEMPLATE_PATH = 'workers/api/wrangler.toml.template';
const OUTPUT_PATH = 'workers/api/wrangler.toml';

export async function renderWranglerConfig(options: RenderOptions): Promise<FileWriteResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const templatePath = resolve(cwd, TEMPLATE_PATH);
  const template = await fs.readFile(templatePath, 'utf8');
  const rendered = renderTemplate(template, options.env, {
    capabilities: options.capabilities
  });
  return writeFileIfChanged(cwd, OUTPUT_PATH, rendered, {
    checkOnly: options.checkOnly
  });
}

export function renderTemplate(
  template: string,
  env: BootstrapEnv,
  options: { capabilities?: CloudflareCapabilities } = {}
): string {
  const substitutions = buildSubstitutions(env, options.capabilities);
  const seen = new Set<string>();

  const rendered = template.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    if (!substitutions.hasOwnProperty(key)) {
      throw new Error(`Unknown template placeholder: ${key}`);
    }
    seen.add(key);
    return substitutions[key];
  });

  if (rendered.includes('{{')) {
    throw new Error('Unresolved template placeholders detected after rendering');
  }

  return rendered;
}

function buildSubstitutions(
  env: BootstrapEnv,
  capabilities?: CloudflareCapabilities
): Record<string, string> {
  const d1Name = env.CLOUDFLARE_D1_NAME ?? `${env.PROJECT_ID}-d1`;
  const r2Bucket = env.CLOUDFLARE_R2_BUCKET ?? `${env.PROJECT_ID}-assets`;
  const stripeProducts = env.STRIPE_PRODUCTS ?? '[]';

  const projectDomain = env.PROJECT_DOMAIN ?? '';
  const appBaseUrl = env.APP_BASE_URL ?? '/app';
  const appUrl = env.APP_URL ?? (projectDomain ? `${trimTrailingSlash(projectDomain)}${appBaseUrl}` : appBaseUrl);
  const workerOrigin = env.WORKER_ORIGIN ?? (appUrl ? originFromUrl(appUrl) : '');
  const projectHost = deriveProjectHost(projectDomain);

  // Determine if we should include D1/R2 bindings based on whether IDs are present
  const canUseD1 = capabilities?.canUseD1 !== false;
  const canUseR2 = capabilities?.canUseR2 !== false;
  const hasD1 = canUseD1 && !!(env.D1_DATABASE_ID || env.CLOUDFLARE_D1_ID);
  const hasR2 = canUseR2 && !!env.CLOUDFLARE_R2_BUCKET;

  const map: Record<string, string> = {
    PROJECT_ID: escapeToml(env.PROJECT_ID),
    BETTER_AUTH_URL: escapeToml(env.BETTER_AUTH_URL ?? `${trimTrailingSlash(projectDomain)}/api/auth`),
    LOGIN_ORIGIN: escapeToml(env.LOGIN_ORIGIN ?? projectDomain),
    SESSION_COOKIE_DOMAIN: escapeToml(env.SESSION_COOKIE_DOMAIN ?? projectHost),
    EXPO_PUBLIC_WORKER_ORIGIN_LOCAL: escapeToml(
      env.EXPO_PUBLIC_WORKER_ORIGIN_LOCAL ?? 'http://127.0.0.1:8787'
    ),
    PROJECT_DOMAIN: escapeToml(projectDomain),
    APP_BASE_URL: escapeToml(appBaseUrl),
    STRIPE_PRODUCTS: escapeToml(stripeProducts),
    EXPO_PUBLIC_WORKER_ORIGIN: escapeToml(env.EXPO_PUBLIC_WORKER_ORIGIN ?? workerOrigin),
    CLOUDFLARE_ZONE_ID: escapeToml(env.CLOUDFLARE_ZONE_ID ?? ''),
    D1_DATABASE_NAME: escapeToml(d1Name),
    D1_DATABASE_ID: escapeToml(env.CLOUDFLARE_D1_ID ?? env.D1_DATABASE_ID ?? ''),
    R2_BUCKET_NAME: escapeToml(r2Bucket),
    PROJECT_HOST: escapeToml(projectHost),
    // Conditional binding sections
    D1_BINDING_SECTION: hasD1
      ? `[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${escapeToml(d1Name)}"\ndatabase_id = "${escapeToml(env.CLOUDFLARE_D1_ID ?? env.D1_DATABASE_ID ?? '')}"`
      : '# D1 binding skipped (no database ID available)',
    R2_BINDING_SECTION: hasR2
      ? `[[r2_buckets]]\nbinding = "STORAGE"\nbucket_name = "${escapeToml(r2Bucket)}"`
      : '# R2 binding skipped (no bucket configured)'
  };

  return map;
}

function trimTrailingSlash(value?: string): string {
  if (!value) return '';
  return value.replace(/\/$/, '');
}

function originFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

function deriveProjectHost(domain?: string): string {
  if (!domain) return '';
  const trimmed = domain.replace(/^https?:\/\//, '');
  return trimmed.split('/')[0].split(':')[0];
}

function escapeToml(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\"/g, '\\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
