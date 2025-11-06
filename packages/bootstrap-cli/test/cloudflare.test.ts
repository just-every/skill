import { describe, expect, it } from 'vitest';
import { buildCloudflarePlan, formatCloudflarePlan } from '../src/providers/cloudflare.js';
import type { BootstrapEnv } from '../src/env.js';

const BASE_ENV: BootstrapEnv = {
  PROJECT_ID: 'demo',
  PROJECT_DOMAIN: 'https://demo.just',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_ZONE_ID: 'zone-123',
  CLOUDFLARE_D1_NAME: 'demo-d1',
  CLOUDFLARE_R2_BUCKET: 'demo-assets',
  LOGTO_ENDPOINT: 'https://auth.example.com',
  LOGTO_API_RESOURCE: 'https://api.example.com',
  LOGTO_APPLICATION_ID: 'logto-app',
  STRIPE_SECRET_KEY: 'sk_test_12345',
  STRIPE_WEBHOOK_SECRET: 'whsec_12345'
};

describe('buildCloudflarePlan', () => {
  it('produces deterministic plan contents', () => {
    const plan = buildCloudflarePlan(BASE_ENV);
    expect(plan.provider).toBe('cloudflare');
    expect(plan.steps.map((step) => step.id)).toEqual(['worker', 'd1', 'r2']);
    expect(plan.notes[0]).toContain('zone');
    const summary = formatCloudflarePlan(plan);
    expect(summary).toContain('demo-d1');
    expect(summary).toContain('demo-assets');
  });

  it('computes defaults when optional values are missing', () => {
    const plan = buildCloudflarePlan({
      ...BASE_ENV,
      CLOUDFLARE_D1_NAME: undefined,
      CLOUDFLARE_R2_BUCKET: undefined
    });
    expect(plan.steps.find((step) => step.id === 'd1')?.detail).toContain('demo-d1');
    expect(plan.steps.find((step) => step.id === 'r2')?.detail).toContain('demo-assets');
  });
});
