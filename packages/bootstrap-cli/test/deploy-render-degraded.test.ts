import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/deploy/render.js';
import type { BootstrapEnv } from '../src/env.js';

const BASE_ENV: BootstrapEnv = {
  PROJECT_ID: 'demo',
  PROJECT_DOMAIN: 'https://demo.example.com',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_ZONE_ID: 'zone-123',
  LOGTO_ENDPOINT: 'https://auth.example.com',
  LOGTO_API_RESOURCE: 'https://api.example.com',
  LOGTO_APPLICATION_ID: 'app-123',
  STRIPE_SECRET_KEY: 'sk_test_123'
};

describe('renderTemplate with degraded mode', () => {
  it('renders D1 binding when D1 database ID is present', () => {
    const template = `
name = "{{PROJECT_ID}}-worker"

{{D1_BINDING_SECTION}}

{{R2_BINDING_SECTION}}
`.trim();

    const env: BootstrapEnv = {
      ...BASE_ENV,
      CLOUDFLARE_D1_ID: 'db-123',
      CLOUDFLARE_D1_NAME: 'demo-d1',
      CLOUDFLARE_R2_BUCKET: 'demo-bucket'
    };

    const result = renderTemplate(template, env);

    expect(result).toContain('[[d1_databases]]');
    expect(result).toContain('binding = "DB"');
    expect(result).toContain('database_name = "demo-d1"');
    expect(result).toContain('database_id = "db-123"');
  });

  it('renders R2 binding when R2 bucket is configured', () => {
    const template = `
name = "{{PROJECT_ID}}-worker"

{{D1_BINDING_SECTION}}

{{R2_BINDING_SECTION}}
`.trim();

    const env: BootstrapEnv = {
      ...BASE_ENV,
      CLOUDFLARE_D1_ID: 'db-123',
      CLOUDFLARE_D1_NAME: 'demo-d1',
      CLOUDFLARE_R2_BUCKET: 'demo-bucket'
    };

    const result = renderTemplate(template, env);

    expect(result).toContain('[[r2_buckets]]');
    expect(result).toContain('binding = "STORAGE"');
    expect(result).toContain('bucket_name = "demo-bucket"');
  });

  it('renders comment when D1 database ID is missing', () => {
    const template = `
name = "{{PROJECT_ID}}-worker"

{{D1_BINDING_SECTION}}

{{R2_BINDING_SECTION}}
`.trim();

    const env: BootstrapEnv = {
      ...BASE_ENV,
      CLOUDFLARE_D1_ID: undefined,
      D1_DATABASE_ID: undefined,
      CLOUDFLARE_R2_BUCKET: 'demo-bucket'
    };

    const result = renderTemplate(template, env);

    expect(result).toContain('# D1 binding skipped (no database ID available)');
    expect(result).not.toContain('[[d1_databases]]');
    expect(result).not.toContain('binding = "DB"');
  });

  it('renders comment when R2 bucket is not configured', () => {
    const template = `
name = "{{PROJECT_ID}}-worker"

{{D1_BINDING_SECTION}}

{{R2_BINDING_SECTION}}
`.trim();

    const env: BootstrapEnv = {
      ...BASE_ENV,
      CLOUDFLARE_D1_ID: 'db-123',
      CLOUDFLARE_D1_NAME: 'demo-d1',
      CLOUDFLARE_R2_BUCKET: undefined
    };

    const result = renderTemplate(template, env);

    expect(result).toContain('# R2 binding skipped (no bucket configured)');
    expect(result).not.toContain('[[r2_buckets]]');
    expect(result).not.toContain('binding = "STORAGE"');
  });

  it('renders both comments when both D1 and R2 are unavailable', () => {
    const template = `
name = "{{PROJECT_ID}}-worker"

{{D1_BINDING_SECTION}}

{{R2_BINDING_SECTION}}
`.trim();

    const env: BootstrapEnv = {
      ...BASE_ENV,
      CLOUDFLARE_D1_ID: undefined,
      D1_DATABASE_ID: undefined,
      CLOUDFLARE_R2_BUCKET: undefined
    };

    const result = renderTemplate(template, env);

    expect(result).toContain('# D1 binding skipped (no database ID available)');
    expect(result).toContain('# R2 binding skipped (no bucket configured)');
    expect(result).not.toContain('[[d1_databases]]');
    expect(result).not.toContain('[[r2_buckets]]');
  });

  it('uses D1_DATABASE_ID if CLOUDFLARE_D1_ID is not set', () => {
    const template = `
{{D1_BINDING_SECTION}}
`.trim();

    const env: BootstrapEnv = {
      ...BASE_ENV,
      D1_DATABASE_ID: 'db-456',
      CLOUDFLARE_D1_ID: undefined,
      CLOUDFLARE_D1_NAME: 'demo-d1'
    };

    const result = renderTemplate(template, env);

    expect(result).toContain('database_id = "db-456"');
  });

  it('prefers CLOUDFLARE_D1_ID over D1_DATABASE_ID when both are set', () => {
    const template = `
{{D1_BINDING_SECTION}}
`.trim();

    const env: BootstrapEnv = {
      ...BASE_ENV,
      D1_DATABASE_ID: 'db-old',
      CLOUDFLARE_D1_ID: 'db-new',
      CLOUDFLARE_D1_NAME: 'demo-d1'
    };

    const result = renderTemplate(template, env);

    expect(result).toContain('database_id = "db-new"');
  });

  it('escapes TOML special characters in binding values', () => {
    const template = `
{{D1_BINDING_SECTION}}
`.trim();

    const env: BootstrapEnv = {
      ...BASE_ENV,
      CLOUDFLARE_D1_ID: 'db-123',
      CLOUDFLARE_D1_NAME: 'test"db\\with\nspecial\tchars'
    };

    const result = renderTemplate(template, env);

    expect(result).toContain('database_name = "test\\"db\\\\with\\nspecial\\tchars"');
  });

  it('renders complete wrangler config in degraded mode', () => {
    const template = `
name = "{{PROJECT_ID}}-worker"
main = "src/index.ts"

[vars]
PROJECT_ID = "{{PROJECT_ID}}"

{{D1_BINDING_SECTION}}

{{R2_BINDING_SECTION}}
`.trim();

    const env: BootstrapEnv = {
      ...BASE_ENV,
      CLOUDFLARE_D1_ID: undefined,
      CLOUDFLARE_R2_BUCKET: undefined
    };

    const result = renderTemplate(template, env);

    // Should still have basic config
    expect(result).toContain('name = "demo-worker"');
    expect(result).toContain('main = "src/index.ts"');
    expect(result).toContain('PROJECT_ID = "demo"');

    // Should skip bindings
    expect(result).toContain('# D1 binding skipped');
    expect(result).toContain('# R2 binding skipped');

    // Should not throw errors
    expect(result).not.toContain('{{');
    expect(result).not.toContain('}}');
  });
});
