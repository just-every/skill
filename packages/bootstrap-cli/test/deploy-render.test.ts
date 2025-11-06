import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/deploy/render.js';
import type { BootstrapEnv } from '../src/env.js';

const BASE_ENV: BootstrapEnv = {
  PROJECT_ID: 'demo',
  PROJECT_DOMAIN: 'https://demo.example',
  APP_URL: 'https://demo.example/app',
  APP_BASE_URL: '/app',
  WORKER_ORIGIN: 'https://worker.demo.example',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_ZONE_ID: 'zone-123',
  CLOUDFLARE_D1_NAME: 'demo-d1',
  CLOUDFLARE_R2_BUCKET: 'demo-assets',
  LOGTO_ENDPOINT: 'https://auth.demo.example',
  LOGTO_API_RESOURCE: 'https://api.demo.example',
  LOGTO_APPLICATION_ID: 'logto-app',
  STRIPE_PRODUCTS: '[{"name":"pro","amount":1000,"currency":"usd"}]'
};

describe('renderTemplate', () => {
  it('throws when encountering an unknown placeholder', () => {
    const template = 'name = "{{PROJECT_ID}}"\nunknown = "{{MISSING}}"\n';
    expect(() => renderTemplate(template, BASE_ENV)).toThrow(/Unknown template placeholder: MISSING/);
  });

  it('escapes TOML string values', () => {
    const env: BootstrapEnv = {
      ...BASE_ENV,
      LOGTO_ENDPOINT: 'https://demo.example/path"with"quote\\slash\nnewline',
      LOGTO_API_RESOURCE: 'https://api.demo.example/resource?x=1&y=2'
    };
    const rendered = renderTemplate(
      'endpoint = "{{LOGTO_ENDPOINT}}"\nresource = "{{LOGTO_API_RESOURCE}}"\n',
      env
    );
    expect(rendered).toContain('endpoint = "https://demo.example/path\\"with\\"quote\\\\slash\\nnewline"');
    expect(rendered).toContain('resource = "https://api.demo.example/resource?x=1&y=2"');
  });

  it('replaces all placeholders without leaving remnants', () => {
    const rendered = renderTemplate('name = "{{PROJECT_ID}}"\n', BASE_ENV);
    expect(rendered).toBe('name = "demo"\n');
    expect(rendered.includes('{{')).toBe(false);
  });

  it('omits D1 and R2 bindings when capabilities are missing', () => {
    const env: BootstrapEnv = {
      ...BASE_ENV,
      CLOUDFLARE_D1_ID: 'db_123',
      CLOUDFLARE_R2_BUCKET: 'demo-assets'
    };
    const capabilities = {
      authenticated: true,
      canUseD1: false,
      canUseR2: false
    };

    const rendered = renderTemplate(
      '{{D1_BINDING_SECTION}}\n{{R2_BINDING_SECTION}}\n',
      env,
      { capabilities }
    );

    expect(rendered).toContain('# D1 binding skipped');
    expect(rendered).toContain('# R2 binding skipped');
    expect(rendered).not.toContain('[[d1_databases]]');
    expect(rendered).not.toContain('[[r2_buckets]]');
  });
});
