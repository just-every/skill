import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCloudflarePlan,
  createCloudflareClient,
  executeCloudflarePlan,
  type CloudflareClient,
  type CloudflarePlan
} from '../src/providers/cloudflare.js';
import { __cloudflareInternals } from '../src/providers/cloudflare.js';
import type { BootstrapEnv } from '../src/env.js';

const BASE_ENV: BootstrapEnv = {
  PROJECT_ID: 'starter',
  PROJECT_DOMAIN: 'https://starter.example',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
  CLOUDFLARE_API_TOKEN: 'token',
  LOGTO_ENDPOINT: 'https://auth.example.com',
  LOGTO_API_RESOURCE: 'https://starter.example/api',
  STRIPE_SECRET_KEY: 'sk_test_123',
  CLOUDFLARE_D1_NAME: 'starter-d1',
  CLOUDFLARE_R2_BUCKET: 'starter-assets'
};

describe('Cloudflare D1 fallbacks', () => {
  afterEach(() => {
    __cloudflareInternals.resetRunWranglerDelegate();
    vi.restoreAllMocks();
  });

  it('getD1Database falls back to list output when info is empty', async () => {
    const calls: string[][] = [];
    __cloudflareInternals.setRunWranglerDelegate(async (args) => {
      calls.push(args);
      if (args[0] === 'd1' && args[1] === 'info') {
        return '';
      }
      if (args[0] === 'd1' && args[1] === 'list') {
        return JSON.stringify([{ uuid: 'db-123', name: 'starter-d1' }]);
      }
      return '';
    });

    const client = createCloudflareClient(BASE_ENV);
    const database = await client.getD1Database('starter-d1');

    expect(database).toEqual({ id: 'db-123', name: 'starter-d1' });
    expect(calls).toEqual([
      ['d1', 'info', 'starter-d1', '--json'],
      ['d1', 'list', '--json']
    ]);
  });

  it('createD1Database falls back to list when create/info do not return details', async () => {
    const calls: string[][] = [];
    __cloudflareInternals.setRunWranglerDelegate(async (args) => {
      calls.push(args);
      if (args[0] === 'd1' && args[1] === 'create') {
        return '';
      }
      if (args[0] === 'd1' && args[1] === 'info') {
        return '';
      }
      if (args[0] === 'd1' && args[1] === 'list') {
        return JSON.stringify([{ uuid: 'db-456', name: 'starter-d1' }]);
      }
      return '';
    });

    const client = createCloudflareClient(BASE_ENV);
    const database = await client.createD1Database('starter-d1');

    expect(database).toEqual({ id: 'db-456', name: 'starter-d1' });
    expect(calls).toEqual([
      ['d1', 'create', 'starter-d1', '--json'],
      ['d1', 'info', 'starter-d1', '--json'],
      ['d1', 'list', '--json']
    ]);
  });

  it('executeCloudflarePlan succeeds with limited D1 permissions', async () => {
    const plan: CloudflarePlan = buildCloudflarePlan({
      ...BASE_ENV,
      CLOUDFLARE_D1_NAME: 'starter-d1'
    });

    const limitedClient: CloudflareClient = {
      getD1Database: vi.fn().mockResolvedValue(null),
      createD1Database: vi.fn().mockResolvedValue({ id: '', name: 'starter-d1' }),
      getR2Bucket: vi.fn().mockResolvedValue(null),
      createR2Bucket: vi.fn().mockResolvedValue({ name: 'starter-assets' })
    };

    const logger = vi.fn();
    const result = await executeCloudflarePlan(plan, BASE_ENV, {
      client: limitedClient,
      logger
    });

    expect(result.updates).toMatchObject({ CLOUDFLARE_R2_BUCKET: 'starter-assets' });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('D1 database -> create starter-d1'));
    expect(limitedClient.createD1Database).toHaveBeenCalledWith('starter-d1');
  });

  it('marks plan steps as skipped when capabilities are missing', () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: true,
      canUseD1: false,
      canUseR2: false
    });

    expect(plan.steps.find((step) => step.id === 'd1')?.status).toBe('skipped');
    expect(plan.steps.find((step) => step.id === 'r2')?.status).toBe('skipped');
    expect(plan.notes.some((note) => note.includes('Warning: No D1 permissions detected'))).toBe(true);
  });

  it('skips Cloudflare mutations when capabilities are missing', async () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: true,
      canUseD1: false,
      canUseR2: false
    });

    const client: CloudflareClient = {
      getD1Database: vi.fn(),
      createD1Database: vi.fn(),
      getR2Bucket: vi.fn(),
      createR2Bucket: vi.fn()
    };

    const logger = vi.fn();
    const result = await executeCloudflarePlan(plan, BASE_ENV, {
      client,
      logger
    });

    expect(client.createD1Database).not.toHaveBeenCalled();
    expect(client.createR2Bucket).not.toHaveBeenCalled();
    expect(result.updates).toMatchObject({ CLOUDFLARE_D1_ID: '', CLOUDFLARE_R2_BUCKET: '' });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('[skipped] D1 database'));
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('[skipped] R2 bucket'));
  });
});
