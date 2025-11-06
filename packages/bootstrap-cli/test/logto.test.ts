import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildLogtoPlan,
  formatLogtoPlan,
  ensureApplication,
  ensureApiResource,
  ensureM2MApp,
  provisionLogto
} from '../src/providers/logto.js';
import type { BootstrapEnv } from '../src/env.js';

const BASE_ENV: BootstrapEnv = {
  PROJECT_ID: 'demo',
  PROJECT_DOMAIN: 'https://demo.just',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
  CLOUDFLARE_API_TOKEN: 'token',
  LOGTO_ENDPOINT: 'https://auth.example.com',
  LOGTO_API_RESOURCE: 'https://api.example.com',
  LOGTO_APPLICATION_ID: 'logto-app',
  LOGTO_MANAGEMENT_ENDPOINT: 'https://auth.example.com',
  LOGTO_MANAGEMENT_AUTH_BASIC: 'YWJjOmRlZg==',
  STRIPE_SECRET_KEY: 'sk_test_12345',
  STRIPE_WEBHOOK_SECRET: 'whsec_12345'
};

describe('buildLogtoPlan', () => {
  it('produces deterministic plan contents', () => {
    const plan = buildLogtoPlan(BASE_ENV);
    expect(plan.provider).toBe('logto');
    expect(plan.endpoint).toBe('https://auth.example.com');
    expect(plan.steps.map((step) => step.id)).toEqual(['spa-app', 'api-resource', 'm2m-app']);
    expect(plan.notes[0]).toContain('Endpoint:');
    const summary = formatLogtoPlan(plan);
    expect(summary).toContain('demo-spa');
    expect(summary).toContain('https://api.example.com');
  });

  it('includes project ID in resource names', () => {
    const plan = buildLogtoPlan(BASE_ENV);
    const spaStep = plan.steps.find((step) => step.id === 'spa-app');
    const apiStep = plan.steps.find((step) => step.id === 'api-resource');
    const m2mStep = plan.steps.find((step) => step.id === 'm2m-app');

    expect(spaStep?.detail).toContain('demo-spa');
    expect(apiStep?.detail).toContain('https://api.example.com');
    expect(m2mStep?.detail).toContain('demo-m2m');
  });
});

describe('ensureApplication', () => {
  const mockToken = 'mock-management-token';

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates new application when none exists', async () => {
    const searchResponse = [];
    const createResponse = {
      id: 'new-app-id',
      name: 'demo-spa',
      type: 'SPA',
      secret: 'new-app-secret'
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => searchResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createResponse
      });

    const result = await ensureApplication(BASE_ENV, mockToken);

    expect(result.id).toBe('new-app-id');
    expect(result.secret).toBe('new-app-secret');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns existing application without changes when metadata matches', async () => {
    const existingApp = {
      id: 'existing-app-id',
      name: 'demo-spa',
      type: 'SPA',
      customClientMetadata: {
        redirectUris: ['https://demo.just/callback', 'http://127.0.0.1:8787/callback'],
        postLogoutRedirectUris: ['https://demo.just', 'http://127.0.0.1:8787'],
        corsAllowedOrigins: ['https://demo.just', 'http://127.0.0.1:8787']
      }
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [existingApp]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => existingApp
      });

    const result = await ensureApplication(BASE_ENV, mockToken);

    expect(result.id).toBe('existing-app-id');
    expect(result.secret).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('updates application when metadata differs', async () => {
    const existingApp = {
      id: 'existing-app-id',
      name: 'demo-spa',
      type: 'SPA',
      customClientMetadata: {
        redirectUris: ['https://old-domain.com/callback'],
        postLogoutRedirectUris: ['https://old-domain.com'],
        corsAllowedOrigins: ['https://old-domain.com']
      }
    };

    const updatedApp = {
      ...existingApp,
      customClientMetadata: {
        redirectUris: ['https://demo.just/callback', 'http://127.0.0.1:8787/callback'],
        postLogoutRedirectUris: ['https://demo.just', 'http://127.0.0.1:8787'],
        corsAllowedOrigins: ['https://demo.just', 'http://127.0.0.1:8787']
      }
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [existingApp]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => existingApp
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => updatedApp
      });

    const result = await ensureApplication(BASE_ENV, mockToken);

    expect(result.id).toBe('existing-app-id');
    expect(global.fetch).toHaveBeenCalledTimes(3);

    // Verify PATCH was called
    const patchCall = (global.fetch as any).mock.calls[2];
    expect(patchCall[1].method).toBe('PATCH');
  });

  it('skips creation in dry-run mode', async () => {
    const searchResponse = [];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => searchResponse
    });

    const result = await ensureApplication(BASE_ENV, mockToken, { dryRun: true });

    expect(result.id).toBe('dry-run-app-id');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('ensureApiResource', () => {
  const mockToken = 'mock-management-token';

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates new API resource when none exists', async () => {
    const searchResponse = [];
    const createResponse = {
      id: 'new-resource-id',
      name: 'demo-api',
      indicator: 'https://api.example.com'
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => searchResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createResponse
      });

    const result = await ensureApiResource(BASE_ENV, mockToken);

    expect(result.id).toBe('new-resource-id');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns existing API resource when found', async () => {
    const existingResource = {
      id: 'existing-resource-id',
      name: 'demo-api',
      indicator: 'https://api.example.com'
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [existingResource]
    });

    const result = await ensureApiResource(BASE_ENV, mockToken);

    expect(result.id).toBe('existing-resource-id');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('skips creation in dry-run mode', async () => {
    const searchResponse = [];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => searchResponse
    });

    const result = await ensureApiResource(BASE_ENV, mockToken, { dryRun: true });

    expect(result.id).toBe('dry-run-resource-id');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('ensureM2MApp', () => {
  const mockToken = 'mock-management-token';

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates new M2M application when none exists', async () => {
    const searchResponse = [];
    const createResponse = {
      id: 'new-m2m-id',
      name: 'demo-m2m',
      type: 'MachineToMachine',
      secret: 'new-m2m-secret'
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => searchResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createResponse
      });

    const result = await ensureM2MApp(BASE_ENV, mockToken);

    expect(result.id).toBe('new-m2m-id');
    expect(result.secret).toBe('new-m2m-secret');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns existing M2M application when found', async () => {
    const existingM2M = {
      id: 'existing-m2m-id',
      name: 'demo-m2m',
      type: 'MachineToMachine'
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [existingM2M]
    });

    const result = await ensureM2MApp(BASE_ENV, mockToken);

    expect(result.id).toBe('existing-m2m-id');
    expect(result.secret).toBe('existing-app-secret-unavailable');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('skips creation in dry-run mode', async () => {
    const searchResponse = [];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => searchResponse
    });

    const result = await ensureM2MApp(BASE_ENV, mockToken, { dryRun: true });

    expect(result.id).toBe('dry-run-m2m-id');
    expect(result.secret).toBe('dry-run-m2m-secret');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('provisionLogto', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provisions all Logto resources', async () => {
    // Mock token endpoint
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'mock-token', expires_in: 3600 })
    });

    // Mock application search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock application create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'app-id',
        name: 'demo-spa',
        type: 'SPA',
        secret: 'app-secret'
      })
    });

    // Mock resource search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock resource create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'resource-id',
        name: 'demo-api',
        indicator: 'https://api.example.com'
      })
    });

    // Mock M2M search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock M2M create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'm2m-id',
        name: 'demo-m2m',
        type: 'MachineToMachine',
        secret: 'm2m-secret'
      })
    });

    const result = await provisionLogto({ env: BASE_ENV });

    expect(result.applicationId).toBe('app-id');
    expect(result.applicationSecret).toBe('app-secret');
    expect(result.apiResourceId).toBe('resource-id');
    expect(result.m2mApplicationId).toBe('m2m-id');
    expect(result.m2mApplicationSecret).toBe('m2m-secret');

    // Verify token endpoint was called with correct resource
    const tokenCall = (global.fetch as any).mock.calls[0];
    expect(tokenCall[0]).toContain('/oidc/token');
    expect(tokenCall[1].body).toContain('resource=https%3A%2F%2Fauth.example.com%2Fapi');
  });

  it('handles dry-run mode', async () => {
    const logLines: string[] = [];
    const logger = (line: string) => logLines.push(line);

    // Mock application search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock resource search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock M2M search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    const result = await provisionLogto({
      env: BASE_ENV,
      dryRun: true,
      logger
    });

    expect(result.applicationId).toBe('dry-run-app-id');
    expect(result.m2mApplicationId).toBe('dry-run-m2m-id');
    expect(logLines.some((line) => line.includes('dry-run'))).toBe(true);
  });

  it('derives correct management resource for Logto Cloud', async () => {
    const cloudEnv = {
      ...BASE_ENV,
      LOGTO_MANAGEMENT_ENDPOINT: 'https://abc123.logto.app'
    };

    // Mock token endpoint
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'mock-token', expires_in: 3600 })
    });

    // Mock application search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock application create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'app-id', name: 'demo-spa', type: 'SPA' })
    });

    // Mock resource search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock resource create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'resource-id', name: 'demo-api', indicator: 'https://api.example.com' })
    });

    // Mock M2M search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock M2M create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'm2m-id', name: 'demo-m2m', type: 'MachineToMachine', secret: 'm2m-secret' })
    });

    await provisionLogto({ env: cloudEnv });

    // Verify token endpoint was called with Cloud resource
    const tokenCall = (global.fetch as any).mock.calls[0];
    expect(tokenCall[1].body).toContain('resource=https%3A%2F%2Fabc123.logto.app%2Fapi');
  });

  it('derives correct management resource for Logto OSS', async () => {
    const ossEnv = {
      ...BASE_ENV,
      LOGTO_MANAGEMENT_ENDPOINT: 'https://auth.mycompany.com'
    };

    // Mock token endpoint
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'mock-token', expires_in: 3600 })
    });

    // Mock application search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock application create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'app-id', name: 'demo-spa', type: 'SPA' })
    });

    // Mock resource search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock resource create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'resource-id', name: 'demo-api', indicator: 'https://api.example.com' })
    });

    // Mock M2M search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock M2M create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'm2m-id', name: 'demo-m2m', type: 'MachineToMachine', secret: 'm2m-secret' })
    });

    await provisionLogto({ env: ossEnv });

    // Verify token endpoint was called with custom host resource
    const tokenCall = (global.fetch as any).mock.calls[0];
    expect(tokenCall[1].body).toContain('resource=https%3A%2F%2Fauth.mycompany.com%2Fapi');
  });

  it('uses fallback to LOGTO_ENDPOINT when LOGTO_MANAGEMENT_ENDPOINT is missing', async () => {
    const fallbackEnv: BootstrapEnv = {
      PROJECT_ID: 'demo',
      PROJECT_DOMAIN: 'https://demo.just',
      CLOUDFLARE_ACCOUNT_ID: 'cf-account',
      CLOUDFLARE_API_TOKEN: 'token',
      LOGTO_ENDPOINT: 'https://auth.example.com',
      LOGTO_API_RESOURCE: 'https://api.example.com',
      LOGTO_APPLICATION_ID: 'logto-app',
      LOGTO_MANAGEMENT_AUTH_BASIC: 'YWJjOmRlZg==',
      STRIPE_SECRET_KEY: 'sk_test_12345',
      STRIPE_WEBHOOK_SECRET: 'whsec_12345'
    };

    // Mock token endpoint
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'mock-token', expires_in: 3600 })
    });

    // Mock application search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock application create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'app-id', name: 'demo-spa', type: 'SPA' })
    });

    // Mock resource search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock resource create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'resource-id', name: 'demo-api', indicator: 'https://api.example.com' })
    });

    // Mock M2M search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock M2M create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'm2m-id', name: 'demo-m2m', type: 'MachineToMachine', secret: 'm2m-secret' })
    });

    await provisionLogto({ env: fallbackEnv });

    // Verify token endpoint was called using LOGTO_ENDPOINT
    const tokenCall = (global.fetch as any).mock.calls[0];
    expect(tokenCall[0]).toBe('https://auth.example.com/oidc/token');
    expect(tokenCall[1].body).toContain('resource=https%3A%2F%2Fauth.example.com%2Fapi');
  });

  it('throws error with helpful message when token request fails with invalid_target', async () => {
    // Mock token endpoint returning invalid_target error
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'invalid_target', error_description: 'Resource not found' })
    });

    await expect(provisionLogto({ env: BASE_ENV })).rejects.toThrow(
      'Failed to mint Logto management token: 400'
    );
  });
});
