import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectCloudflareCapabilities,
  buildCloudflarePlan,
  executeCloudflarePlan,
  createCloudflareClient,
  type CloudflareClient,
  __cloudflareInternals
} from '../src/providers/cloudflare.js';
import type { BootstrapEnv } from '../src/env.js';

const BASE_ENV: BootstrapEnv = {
  PROJECT_ID: 'test-project',
  PROJECT_DOMAIN: 'https://test.example.com',
  CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
  CLOUDFLARE_API_TOKEN: 'test-api-token',
  LOGTO_ENDPOINT: 'https://auth.example.com',
  LOGTO_API_RESOURCE: 'https://api.example.com',
  STRIPE_SECRET_KEY: 'sk_test_123'
};

describe('detectCloudflareCapabilities', () => {
  afterEach(() => {
    __cloudflareInternals.resetRunWranglerDelegate();
    vi.restoreAllMocks();
  });

  it('detects full capabilities when all commands succeed', async () => {
    __cloudflareInternals.setRunWranglerDelegate(async (args) => {
      if (args[0] === 'whoami') {
        return 'You are logged in as user@example.com';
      }
      if (args[0] === 'd1' && args[1] === 'list') {
        return JSON.stringify([]);
      }
      if (args[0] === 'r2' && args[1] === 'bucket' && args[2] === 'list') {
        return JSON.stringify([]);
      }
      return '';
    });

    const capabilities = await detectCloudflareCapabilities(BASE_ENV);

    expect(capabilities).toEqual({
      authenticated: true,
      canUseD1: true,
      canUseR2: true,
      userEmail: 'user@example.com'
    });
  });

  it('detects no D1 permission when d1 list fails', async () => {
    __cloudflareInternals.setRunWranglerDelegate(async (args) => {
      if (args[0] === 'whoami') {
        return 'You are logged in as user@example.com';
      }
      if (args[0] === 'd1' && args[1] === 'list') {
        return ''; // Empty = no permission
      }
      if (args[0] === 'r2' && args[1] === 'bucket' && args[2] === 'list') {
        return JSON.stringify([]);
      }
      return '';
    });

    const capabilities = await detectCloudflareCapabilities(BASE_ENV);

    expect(capabilities).toEqual({
      authenticated: true,
      canUseD1: false,
      canUseR2: true,
      userEmail: 'user@example.com'
    });
  });

  it('detects no R2 permission when r2 list fails', async () => {
    __cloudflareInternals.setRunWranglerDelegate(async (args) => {
      if (args[0] === 'whoami') {
        return 'You are logged in as user@example.com';
      }
      if (args[0] === 'd1' && args[1] === 'list') {
        return JSON.stringify([]);
      }
      if (args[0] === 'r2' && args[1] === 'bucket' && args[2] === 'list') {
        return ''; // Empty = no permission
      }
      return '';
    });

    const capabilities = await detectCloudflareCapabilities(BASE_ENV);

    expect(capabilities).toEqual({
      authenticated: true,
      canUseD1: true,
      canUseR2: false,
      userEmail: 'user@example.com'
    });
  });

  it('detects no permissions when not authenticated', async () => {
    __cloudflareInternals.setRunWranglerDelegate(async () => {
      return ''; // All commands fail
    });

    const capabilities = await detectCloudflareCapabilities(BASE_ENV);

    expect(capabilities).toEqual({
      authenticated: false,
      canUseD1: false,
      canUseR2: false,
      userEmail: undefined
    });
  });

  it('extracts email from whoami output', async () => {
    __cloudflareInternals.setRunWranglerDelegate(async (args) => {
      if (args[0] === 'whoami') {
        return 'You are logged in with an API Token, associated with the email test.user+tag@example.co.uk';
      }
      if (args[0] === 'd1' && args[1] === 'list') {
        return JSON.stringify([]);
      }
      if (args[0] === 'r2' && args[1] === 'bucket' && args[2] === 'list') {
        return JSON.stringify([]);
      }
      return '';
    });

    const capabilities = await detectCloudflareCapabilities(BASE_ENV);

    expect(capabilities.userEmail).toBe('test.user+tag@example.co.uk');
  });
});

describe('buildCloudflarePlan with capabilities', () => {
  it('marks D1 step as skipped when no D1 permission', () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: true,
      canUseD1: false,
      canUseR2: true,
      userEmail: 'user@example.com'
    });

    const d1Step = plan.steps.find((s) => s.id === 'd1');
    expect(d1Step?.status).toBe('skipped');
    expect(d1Step?.detail).toContain('no D1 permissions');
    expect(plan.notes).toContain('Warning: No D1 permissions detected');
  });

  it('marks R2 step as skipped when no R2 permission', () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: true,
      canUseD1: true,
      canUseR2: false,
      userEmail: 'user@example.com'
    });

    const r2Step = plan.steps.find((s) => s.id === 'r2');
    expect(r2Step?.status).toBe('skipped');
    expect(r2Step?.detail).toContain('no R2 permissions');
    expect(plan.notes).toContain('Warning: No R2 permissions detected');
  });

  it('marks both steps as skipped when no permissions', () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: false,
      canUseD1: false,
      canUseR2: false
    });

    const d1Step = plan.steps.find((s) => s.id === 'd1');
    const r2Step = plan.steps.find((s) => s.id === 'r2');

    expect(d1Step?.status).toBe('skipped');
    expect(r2Step?.status).toBe('skipped');
  });

  it('includes authenticated user email in notes', () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: true,
      canUseD1: true,
      canUseR2: true,
      userEmail: 'user@example.com'
    });

    expect(plan.notes).toContain('Authenticated: user@example.com');
  });

  it('keeps steps as ensure when capabilities indicate permission', () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: true,
      canUseD1: true,
      canUseR2: true,
      userEmail: 'user@example.com'
    });

    const d1Step = plan.steps.find((s) => s.id === 'd1');
    const r2Step = plan.steps.find((s) => s.id === 'r2');

    expect(d1Step?.status).toBe('ensure');
    expect(r2Step?.status).toBe('ensure');
  });
});

describe('executeCloudflarePlan with skipped steps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips D1 creation when step is marked skipped', async () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: true,
      canUseD1: false,
      canUseR2: true
    });

    const mockClient: CloudflareClient = {
      getD1Database: vi.fn(),
      createD1Database: vi.fn(),
      getR2Bucket: vi.fn().mockResolvedValue(null),
      createR2Bucket: vi.fn().mockResolvedValue({ name: 'test-bucket' })
    };

    const logs: string[] = [];
    const result = await executeCloudflarePlan(plan, BASE_ENV, {
      client: mockClient,
      logger: (line) => logs.push(line)
    });

    expect(mockClient.getD1Database).not.toHaveBeenCalled();
    expect(mockClient.createD1Database).not.toHaveBeenCalled();
    expect(logs.some((log) => log.includes('[skipped]') && log.includes('D1'))).toBe(true);
    expect(result.updates.CLOUDFLARE_D1_ID).toBe('');
  });

  it('skips R2 creation when step is marked skipped', async () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: true,
      canUseD1: true,
      canUseR2: false
    });

    const mockClient: CloudflareClient = {
      getD1Database: vi.fn().mockResolvedValue(null),
      createD1Database: vi.fn().mockResolvedValue({ id: 'db-123', name: 'test-db' }),
      getR2Bucket: vi.fn(),
      createR2Bucket: vi.fn()
    };

    const logs: string[] = [];
    const result = await executeCloudflarePlan(plan, BASE_ENV, {
      client: mockClient,
      logger: (line) => logs.push(line)
    });

    expect(mockClient.getR2Bucket).not.toHaveBeenCalled();
    expect(mockClient.createR2Bucket).not.toHaveBeenCalled();
    expect(logs.some((log) => log.includes('[skipped]') && log.includes('R2'))).toBe(true);
    expect(result.updates.CLOUDFLARE_R2_BUCKET).toBe('');
  });

  it('succeeds with both steps skipped and returns empty updates', async () => {
    const plan = buildCloudflarePlan(BASE_ENV, {
      authenticated: false,
      canUseD1: false,
      canUseR2: false
    });

    const mockClient: CloudflareClient = {
      getD1Database: vi.fn(),
      createD1Database: vi.fn(),
      getR2Bucket: vi.fn(),
      createR2Bucket: vi.fn()
    };

    const logs: string[] = [];
    const result = await executeCloudflarePlan(plan, BASE_ENV, {
      client: mockClient,
      logger: (line) => logs.push(line)
    });

    expect(mockClient.getD1Database).not.toHaveBeenCalled();
    expect(mockClient.createD1Database).not.toHaveBeenCalled();
    expect(mockClient.getR2Bucket).not.toHaveBeenCalled();
    expect(mockClient.createR2Bucket).not.toHaveBeenCalled();

    expect(result.updates).toEqual({
      CLOUDFLARE_D1_NAME: `${BASE_ENV.PROJECT_ID}-d1`,
      CLOUDFLARE_D1_ID: '',
      D1_DATABASE_ID: '',
      CLOUDFLARE_R2_BUCKET: ''
    });
    expect(logs.filter((log) => log.includes('[skipped]')).length).toBe(2);
  });

  it('processes normally when no capabilities provided (backward compatibility)', async () => {
    const plan = buildCloudflarePlan(BASE_ENV); // No capabilities

    const mockClient: CloudflareClient = {
      getD1Database: vi.fn().mockResolvedValue(null),
      createD1Database: vi.fn().mockResolvedValue({ id: 'db-123', name: 'test-db' }),
      getR2Bucket: vi.fn().mockResolvedValue(null),
      createR2Bucket: vi.fn().mockResolvedValue({ name: 'test-bucket' })
    };

    const result = await executeCloudflarePlan(plan, BASE_ENV, {
      client: mockClient
    });

    expect(mockClient.createD1Database).toHaveBeenCalled();
    expect(mockClient.createR2Bucket).toHaveBeenCalled();
    expect(result.updates.CLOUDFLARE_D1_ID).toBe('db-123');
    expect(result.updates.CLOUDFLARE_R2_BUCKET).toBe('test-bucket');
  });
});
