import { describe, expect, it } from 'vitest';
import { __deployInternals } from '../src/tasks.js';
import type { BootstrapEnv } from '../src/env.js';

const { slugifyBucketName, deriveR2BucketName } = __deployInternals;

describe('deploy helpers', () => {
  it('slugifies bucket names to meet Cloudflare constraints', () => {
    expect(slugifyBucketName('My Bucket!!')).toBe('my-bucket');
    expect(slugifyBucketName('A')).toBe('aas');
    expect(
      slugifyBucketName('UPPER-CASE-LONG-NAME-WITH-CHARACTERS-THAT-EXCEED-LIMIT-12345')
    ).toBe('upper-case-long-name-with-characters-that-exceed-limit-123');
    expect(slugifyBucketName('project-assets-99999')).toBe('project-assets-999');
    expect(slugifyBucketName('project99999')).toBe('project999');
  });

  it('derives bucket name from env override', () => {
    const env = {
      PROJECT_ID: 'demo',
      PROJECT_DOMAIN: 'https://demo.just',
      CLOUDFLARE_ACCOUNT_ID: 'cf-account',
      CLOUDFLARE_API_TOKEN: 'token',
      LOGTO_ENDPOINT: 'https://auth.example.com',
      LOGTO_API_RESOURCE: 'https://api.example.com',
      STRIPE_SECRET_KEY: 'sk',
      STRIPE_WEBHOOK_SECRET: 'wh',
      CLOUDFLARE_R2_BUCKET: 'My Custom Bucket'
    } as unknown as BootstrapEnv;

    expect(deriveR2BucketName(env)).toBe('my-custom-bucket');
  });

  it('falls back to project-id derived bucket name', () => {
    const env = {
      PROJECT_ID: 'Starter_Project',
      PROJECT_DOMAIN: 'https://starter.just',
      CLOUDFLARE_ACCOUNT_ID: 'cf-account',
      CLOUDFLARE_API_TOKEN: 'token',
      LOGTO_ENDPOINT: 'https://auth.example.com',
      LOGTO_API_RESOURCE: 'https://api.example.com',
      STRIPE_SECRET_KEY: 'sk',
      STRIPE_WEBHOOK_SECRET: 'wh'
    } as unknown as BootstrapEnv;

    expect(deriveR2BucketName(env)).toBe('starter-project-assets');
  });
});
