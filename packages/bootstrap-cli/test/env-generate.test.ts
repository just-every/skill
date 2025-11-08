import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BaseEnv, BootstrapEnv, GeneratedEnv } from '../src/env.js';
import { buildGeneratedFiles } from '../src/env/files.js';
import { writeFileIfChanged } from '../src/files.js';
import { runEnvGenerate } from '../src/index.js';
import * as logtoProvider from '../src/providers/logto.js';
import * as stripeProvider from '../src/providers/stripe.js';
import type { StripeClient } from '../src/providers/stripe.js';

const ENV_KEYS_TO_CLEAN = [
  'PROJECT_ID',
  'PROJECT_DOMAIN',
  'APP_URL',
  'APP_BASE_URL',
  'WORKER_ORIGIN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
  'LOGTO_ENDPOINT',
  'LOGTO_API_RESOURCE',
  'LOGTO_MANAGEMENT_ENDPOINT',
  'LOGTO_MANAGEMENT_AUTH_BASIC',
  'STRIPE_SECRET_KEY',
  'STRIPE_TEST_SECRET_KEY',
  'STRIPE_PRODUCTS',
  'STRIPE_WEBHOOK_SECRET'
];

const SAMPLE_BASE_ENV: BaseEnv = {
  PROJECT_ID: 'demo',
  PROJECT_DOMAIN: 'https://demo.example',
  APP_URL: 'https://demo.example/app',
  APP_BASE_URL: '/app',
  WORKER_ORIGIN: 'https://worker.demo.example',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_ZONE_ID: 'zone-123',
  LOGTO_ENDPOINT: 'https://auth.demo.example',
  LOGTO_API_RESOURCE: 'https://api.demo.example',
  LOGTO_MANAGEMENT_ENDPOINT: 'https://auth.demo.example',
  LOGTO_MANAGEMENT_AUTH_BASIC: 'basic-token',
  STRIPE_SECRET_KEY: 'sk_test_abc'
};

const SAMPLE_GENERATED_ENV: GeneratedEnv = {
  CLOUDFLARE_D1_NAME: 'demo-d1',
  CLOUDFLARE_D1_ID: 'db_123',
  D1_DATABASE_ID: 'db_123',
  CLOUDFLARE_R2_BUCKET: 'demo-assets',
  LOGTO_APPLICATION_ID: 'logto-app',
  STRIPE_WEBHOOK_SECRET: 'whsec_abc',
  STRIPE_WEBHOOK_URL: 'https://demo.example/api/webhooks/stripe',
  STRIPE_PRODUCT_IDS: 'prod_123',
  STRIPE_PRICE_IDS: 'price_123'
};

const SAMPLE_ENV: BootstrapEnv = {
  ...SAMPLE_BASE_ENV,
  ...SAMPLE_GENERATED_ENV
};

function clearEnvOverrides(): void {
  for (const key of ENV_KEYS_TO_CLEAN) {
    delete process.env[key];
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearEnvOverrides();

  vi.spyOn(logtoProvider, 'buildLogtoPlan').mockReturnValue({
    provider: 'logto',
    endpoint: SAMPLE_BASE_ENV.LOGTO_ENDPOINT,
    steps: [],
    notes: []
  });
  vi.spyOn(logtoProvider, 'formatLogtoPlan').mockReturnValue('logto plan');
  vi.spyOn(logtoProvider, 'provisionLogto').mockResolvedValue({
    applicationId: 'logto-app-generated',
    applicationSecret: 'logto-secret',
    apiResourceId: 'logto-resource'
  });

  vi.spyOn(stripeProvider, 'buildStripePlan').mockResolvedValue({
    provider: 'stripe',
    steps: [],
    notes: [],
    warnings: []
  });
  vi.spyOn(stripeProvider, 'formatStripePlan').mockReturnValue('stripe plan');
  vi.spyOn(stripeProvider, 'createStripeClient').mockResolvedValue({} as StripeClient);
  vi.spyOn(stripeProvider, 'executeStripePlan').mockResolvedValue({
    products: [
      {
        productId: 'prod_generated',
        productName: 'Pro',
        priceIds: ['price_generated']
      }
    ],
    webhook: {
      webhookId: 'wh_generated',
      webhookSecret: 'whsec_generated'
    },
    warnings: []
  });
});

afterEach(() => {
  clearEnvOverrides();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'bootstrap-cli-env-'));
}

function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe('env file generation', () => {
  it('produces expected key-value pairs for web and worker files', () => {
    const { generatedEnvContents, devVarsContents } = buildGeneratedFiles({
      base: SAMPLE_BASE_ENV,
      generated: SAMPLE_GENERATED_ENV
    });

    expect(generatedEnvContents).toContain('PROJECT_ID=demo');
    expect(generatedEnvContents).toContain('EXPO_PUBLIC_LOGTO_ENDPOINT=https://auth.demo.example');
    expect(generatedEnvContents).toContain('EXPO_PUBLIC_WORKER_ORIGIN=https://worker.demo.example');
    expect(generatedEnvContents).toContain('CLOUDFLARE_D1_ID=db_123');
    expect(devVarsContents).toContain('STRIPE_SECRET_KEY=sk_test_abc');
    expect(devVarsContents).toContain('LOGTO_APPLICATION_ID=logto-app');
  });

  it('writes files once and remains idempotent on subsequent writes', async () => {
    const dir = createTempDir();
    try {
      const { generatedEnvContents, devVarsContents } = buildGeneratedFiles({
        base: SAMPLE_BASE_ENV,
        generated: SAMPLE_GENERATED_ENV
      });

      const firstGenerated = await writeFileIfChanged(
        dir,
        '.env.local.generated',
        generatedEnvContents
      );
      const firstDevVars = await writeFileIfChanged(
        dir,
        'workers/api/.dev.vars',
        devVarsContents
      );

      expect(firstGenerated.changed).toBe(true);
      expect(firstDevVars.changed).toBe(true);

      const secondGenerated = await writeFileIfChanged(
        dir,
        '.env.local.generated',
        generatedEnvContents
      );
      const secondDevVars = await writeFileIfChanged(
        dir,
        'workers/api/.dev.vars',
        devVarsContents
      );

      expect(secondGenerated.changed).toBe(false);
      expect(secondDevVars.changed).toBe(false);
    } finally {
      removeTempDir(dir);
    }
  });

  it('detects differences in check-only mode without writing', async () => {
    const dir = createTempDir();
    try {
      const { generatedEnvContents } = buildGeneratedFiles({
        base: SAMPLE_BASE_ENV,
        generated: SAMPLE_GENERATED_ENV
      });

      await writeFileIfChanged(dir, '.env.local.generated', generatedEnvContents);
      const path = join(dir, '.env.local.generated');
      writeFileSync(path, 'modified');

      const result = await writeFileIfChanged(
        dir,
        '.env.local.generated',
        generatedEnvContents,
        { checkOnly: true }
      );

      expect(result.changed).toBe(true);
      expect(result.skipped).toBe(true);
    } finally {
      removeTempDir(dir);
    }
  });

  it('reports changes but preserves filesystem when checkOnly is used on new files', async () => {
    const dir = createTempDir();
    try {
      const { generatedEnvContents } = buildGeneratedFiles({
        base: SAMPLE_BASE_ENV,
        generated: SAMPLE_GENERATED_ENV
      });
      const result = await writeFileIfChanged(
        dir,
        '.env.local.generated',
        generatedEnvContents,
        { checkOnly: true }
      );

      expect(result.changed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(existsSync(join(dir, '.env.local.generated'))).toBe(false);
    } finally {
      removeTempDir(dir);
    }
  });

  it('runs the env generate command, preserving idempotency and check mode', async () => {
    const dir = createTempDir();
    try {
      const envFile = [
        `PROJECT_ID=${SAMPLE_BASE_ENV.PROJECT_ID}`,
        `PROJECT_DOMAIN=${SAMPLE_BASE_ENV.PROJECT_DOMAIN}`,
        `APP_URL=${SAMPLE_BASE_ENV.APP_URL}`,
        `APP_BASE_URL=${SAMPLE_BASE_ENV.APP_BASE_URL}`,
        `WORKER_ORIGIN=${SAMPLE_BASE_ENV.WORKER_ORIGIN}`,
        `CLOUDFLARE_ACCOUNT_ID=${SAMPLE_BASE_ENV.CLOUDFLARE_ACCOUNT_ID}`,
        `CLOUDFLARE_API_TOKEN=${SAMPLE_BASE_ENV.CLOUDFLARE_API_TOKEN}`,
        `CLOUDFLARE_ZONE_ID=${SAMPLE_BASE_ENV.CLOUDFLARE_ZONE_ID}`,
        `LOGTO_ENDPOINT=${SAMPLE_BASE_ENV.LOGTO_ENDPOINT}`,
        `LOGTO_API_RESOURCE=${SAMPLE_BASE_ENV.LOGTO_API_RESOURCE}`,
        `LOGTO_MANAGEMENT_ENDPOINT=${SAMPLE_BASE_ENV.LOGTO_MANAGEMENT_ENDPOINT}`,
        `LOGTO_MANAGEMENT_AUTH_BASIC=${SAMPLE_BASE_ENV.LOGTO_MANAGEMENT_AUTH_BASIC}`,
        `STRIPE_SECRET_KEY=${SAMPLE_BASE_ENV.STRIPE_SECRET_KEY}`
      ].join('\n');

      writeFileSync(join(dir, '.env'), envFile);

      await runEnvGenerate({ cwd: dir });

      const generatedPath = join(dir, '.env.local.generated');
      const devVarsPath = join(dir, 'workers/api/.dev.vars');
      expect(existsSync(generatedPath)).toBe(true);
      expect(existsSync(devVarsPath)).toBe(true);

      const firstGenerated = readFileSync(generatedPath, 'utf8');
      const firstDevVars = readFileSync(devVarsPath, 'utf8');

      // Should exit cleanly when nothing changes.
      await runEnvGenerate({ cwd: dir, checkOnly: true });

      // Modify a file to trigger diff detection.
      writeFileSync(generatedPath, `${firstGenerated}# drift\n`);
      await expect(runEnvGenerate({ cwd: dir, checkOnly: true })).rejects.toThrowError(
        /Differences detected/
      );

      // Restore original contents and ensure re-run succeeds.
      writeFileSync(generatedPath, firstGenerated);
      writeFileSync(devVarsPath, firstDevVars);
      await runEnvGenerate({ cwd: dir, checkOnly: true });
    } finally {
      removeTempDir(dir);
    }
  });

  it('skips writing files when invoked with checkOnly before files exist', async () => {
    const dir = createTempDir();
    try {
      const envFile = [
        `PROJECT_ID=${SAMPLE_BASE_ENV.PROJECT_ID}`,
        `PROJECT_DOMAIN=${SAMPLE_BASE_ENV.PROJECT_DOMAIN}`,
        `APP_URL=${SAMPLE_BASE_ENV.APP_URL}`,
        `APP_BASE_URL=${SAMPLE_BASE_ENV.APP_BASE_URL}`,
        `WORKER_ORIGIN=${SAMPLE_BASE_ENV.WORKER_ORIGIN}`,
        `CLOUDFLARE_ACCOUNT_ID=${SAMPLE_BASE_ENV.CLOUDFLARE_ACCOUNT_ID}`,
        `CLOUDFLARE_API_TOKEN=${SAMPLE_BASE_ENV.CLOUDFLARE_API_TOKEN}`,
        `LOGTO_ENDPOINT=${SAMPLE_BASE_ENV.LOGTO_ENDPOINT}`,
        `LOGTO_API_RESOURCE=${SAMPLE_BASE_ENV.LOGTO_API_RESOURCE}`,
        `LOGTO_MANAGEMENT_ENDPOINT=${SAMPLE_BASE_ENV.LOGTO_MANAGEMENT_ENDPOINT}`,
        `LOGTO_MANAGEMENT_AUTH_BASIC=${SAMPLE_BASE_ENV.LOGTO_MANAGEMENT_AUTH_BASIC}`,
        `STRIPE_SECRET_KEY=${SAMPLE_BASE_ENV.STRIPE_SECRET_KEY}`
      ].join('\n');
      writeFileSync(join(dir, '.env'), envFile);

      await expect(runEnvGenerate({ cwd: dir, checkOnly: true })).rejects.toThrow(
        /Differences detected/
      );

      expect(existsSync(join(dir, '.env.local.generated'))).toBe(false);
      expect(existsSync(join(dir, 'workers/api/.dev.vars'))).toBe(false);
    } finally {
      removeTempDir(dir);
    }
  });

  it('produces stable .env.local.generated with only a starter .env present', async () => {
    const dir = createTempDir();
    try {
      // Create only a minimal starter .env without .env.local or .env.local.generated
      const starterEnvFile = [
        `PROJECT_ID=${SAMPLE_BASE_ENV.PROJECT_ID}`,
        `PROJECT_DOMAIN=${SAMPLE_BASE_ENV.PROJECT_DOMAIN}`,
        `APP_URL=${SAMPLE_BASE_ENV.APP_URL}`,
        `APP_BASE_URL=${SAMPLE_BASE_ENV.APP_BASE_URL}`,
        `WORKER_ORIGIN=${SAMPLE_BASE_ENV.WORKER_ORIGIN}`,
        `CLOUDFLARE_ACCOUNT_ID=${SAMPLE_BASE_ENV.CLOUDFLARE_ACCOUNT_ID}`,
        `CLOUDFLARE_API_TOKEN=${SAMPLE_BASE_ENV.CLOUDFLARE_API_TOKEN}`,
        `CLOUDFLARE_ZONE_ID=${SAMPLE_BASE_ENV.CLOUDFLARE_ZONE_ID}`,
        `LOGTO_ENDPOINT=${SAMPLE_BASE_ENV.LOGTO_ENDPOINT}`,
        `LOGTO_API_RESOURCE=${SAMPLE_BASE_ENV.LOGTO_API_RESOURCE}`,
        `LOGTO_MANAGEMENT_ENDPOINT=${SAMPLE_BASE_ENV.LOGTO_MANAGEMENT_ENDPOINT}`,
        `LOGTO_MANAGEMENT_AUTH_BASIC=${SAMPLE_BASE_ENV.LOGTO_MANAGEMENT_AUTH_BASIC}`,
        `STRIPE_SECRET_KEY=${SAMPLE_BASE_ENV.STRIPE_SECRET_KEY}`
      ].join('\n');

      writeFileSync(join(dir, '.env'), starterEnvFile);

      // First run: generates files
      await runEnvGenerate({ cwd: dir });

      const generatedPath = join(dir, '.env.local.generated');
      const devVarsPath = join(dir, 'workers/api/.dev.vars');
      expect(existsSync(generatedPath)).toBe(true);
      expect(existsSync(devVarsPath)).toBe(true);

      const firstGenerated = readFileSync(generatedPath, 'utf8');
      const firstDevVars = readFileSync(devVarsPath, 'utf8');

      // Second run: should be idempotent with no changes
      await runEnvGenerate({ cwd: dir });

      const secondGenerated = readFileSync(generatedPath, 'utf8');
      const secondDevVars = readFileSync(devVarsPath, 'utf8');

      expect(secondGenerated).toBe(firstGenerated);
      expect(secondDevVars).toBe(firstDevVars);

      // Verify expected content in generated files
      expect(firstGenerated).toContain('Autogenerated by bootstrap CLI');
      expect(firstGenerated).toContain(`PROJECT_ID=demo`);
      expect(firstGenerated).toContain('CLOUDFLARE_D1_NAME=demo-d1');
      expect(firstGenerated).toContain('LOGTO_APPLICATION_ID=logto-app-generated');
      expect(firstDevVars).toContain('Autogenerated by bootstrap CLI');
      expect(firstDevVars).toContain('STRIPE_SECRET_KEY=sk_test_abc');
      expect(firstDevVars).toContain('LOGTO_APPLICATION_ID=logto-app-generated');
    } finally {
      removeTempDir(dir);
    }
  });

  it('derives env vars from PROJECT_DOMAIN when only starter .env present', async () => {
    const dir = createTempDir();
    try {
      // Minimal .env with fallback capabilities
      const starterEnvFile = [
        'PROJECT_ID=test-project',
        'PROJECT_DOMAIN=https://test.example.com',
        'CLOUDFLARE_ACCOUNT_ID=cf-test',
        'CLOUDFLARE_API_TOKEN=token-test',
        'CLOUDFLARE_ZONE_ID=zone-test',
        'LOGTO_ENDPOINT=https://auth.test.example.com',
        'STRIPE_TEST_SECRET_KEY=sk_test_123'
        // Note: APP_URL, WORKER_ORIGIN, LOGTO_API_RESOURCE should be derived
      ].join('\n');

      writeFileSync(join(dir, '.env'), starterEnvFile);
      await runEnvGenerate({ cwd: dir });

      const generatedPath = join(dir, '.env.local.generated');
      const devVarsPath = join(dir, 'workers/api/.dev.vars');
      const generated = readFileSync(generatedPath, 'utf8');
      const devVars = readFileSync(devVarsPath, 'utf8');

      // Verify fallbacks worked - STRIPE_SECRET_KEY falls back to STRIPE_TEST_SECRET_KEY (written to .dev.vars)
      expect(devVars).toContain('STRIPE_SECRET_KEY=sk_test_123');
      // Should have derived LOGTO_API_RESOURCE from PROJECT_DOMAIN
      expect(generated).toContain('LOGTO_API_RESOURCE=https://test.example.com/api');
      // Should have derived APP_URL from PROJECT_DOMAIN
      expect(generated).toContain('APP_URL=https://test.example.com/app');
      // Should have derived WORKER_ORIGIN from PROJECT_DOMAIN
      expect(generated).toContain('WORKER_ORIGIN=https://test.example.com');
    } finally {
      removeTempDir(dir);
    }
  });
});
