import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildLogtoPlan,
  formatLogtoPlan,
  ensureApplication,
  ensureApiResource,
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
  LOGTO_APPLICATION_SECRET: 'logto-app-secret',
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
    expect(plan.steps.map((step) => step.id)).toEqual(['traditional-app', 'api-resource']);
    expect(plan.notes[0]).toContain('Endpoint:');
    const summary = formatLogtoPlan(plan);
    expect(summary).toContain('demo-web');
    expect(summary).toContain('https://api.example.com');
  });

  it('includes project ID in resource names', () => {
    const plan = buildLogtoPlan(BASE_ENV);
    const spaStep = plan.steps.find((step) => step.id === 'traditional-app');
    const apiStep = plan.steps.find((step) => step.id === 'api-resource');
    expect(spaStep?.detail).toContain('demo-web');
    expect(apiStep?.detail).toContain('https://api.example.com');
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
      name: 'demo-web',
      type: 'Traditional',
      secret: 'new-app-secret'
    };

    const resourceSearchResponse = [
      {
        id: 'api-resource-id',
        name: 'demo-api',
        indicator: 'https://api.example.com'
      }
    ];

    (global.fetch as any)
      // Search for API resource
      .mockResolvedValueOnce({
        ok: true,
        json: async () => resourceSearchResponse
      })
      // Search for application
      .mockResolvedValueOnce({
        ok: true,
        json: async () => searchResponse
      })
      // Create application
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createResponse
      })
      // Set user consent scopes
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

    const result = await ensureApplication(BASE_ENV, mockToken);

    expect(result.id).toBe('new-app-id');
    expect(result.secret).toBe('new-app-secret');
    expect(global.fetch).toHaveBeenCalledTimes(4);
    const createCall = (global.fetch as any).mock.calls[2];
    const body = JSON.parse(createCall[1].body);
    expect(body.oidcClientMetadata.redirectUris).toContain('https://demo.just/callback');

    // Verify user consent scopes were configured
    const scopeCall = (global.fetch as any).mock.calls[3];
    expect(scopeCall[0]).toContain('/user-consent-scopes');
    expect(scopeCall[1].method).toBe('PUT');
  });

  it('returns existing application without changes when metadata matches', async () => {
    const existingApp = {
      id: 'existing-app-id',
      name: 'demo-web',
      type: 'Traditional',
      customClientMetadata: {
        corsAllowedOrigins: ['https://demo.just', 'http://127.0.0.1:8787']
      },
      oidcClientMetadata: {
        redirectUris: ['https://demo.just/callback', 'http://127.0.0.1:8787/callback'],
        postLogoutRedirectUris: ['https://demo.just', 'http://127.0.0.1:8787'],
        alwaysIssueRefreshToken: true,
        rotateRefreshToken: true
      }
    };

    const resourceSearchResponse = [
      {
        id: 'api-resource-id',
        name: 'demo-api',
        indicator: 'https://api.example.com'
      }
    ];

    (global.fetch as any)
      // Search for API resource
      .mockResolvedValueOnce({
        ok: true,
        json: async () => resourceSearchResponse
      })
      // Search for application
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [existingApp]
      })
      // Get application details
      .mockResolvedValueOnce({
        ok: true,
        json: async () => existingApp
      })
      // Update user consent scopes
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

    const result = await ensureApplication(BASE_ENV, mockToken);

    expect(result.id).toBe('existing-app-id');
    expect(result.secret).toBe('logto-app-secret');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('updates application when metadata differs', async () => {
    const existingApp = {
      id: 'existing-app-id',
      name: 'demo-web',
      type: 'Traditional',
      customClientMetadata: {
        corsAllowedOrigins: ['https://old-domain.com']
      },
      oidcClientMetadata: {
        redirectUris: ['https://old-domain.com/callback'],
        postLogoutRedirectUris: ['https://old-domain.com'],
        alwaysIssueRefreshToken: false,
        rotateRefreshToken: false
      }
    };

    const updatedApp = {
      ...existingApp,
      customClientMetadata: {
        corsAllowedOrigins: ['https://demo.just', 'http://127.0.0.1:8787']
      },
      oidcClientMetadata: {
        redirectUris: ['https://demo.just/callback', 'http://127.0.0.1:8787/callback'],
        postLogoutRedirectUris: ['https://demo.just', 'http://127.0.0.1:8787'],
        alwaysIssueRefreshToken: true,
        rotateRefreshToken: true
      }
    };

    const resourceSearchResponse = [
      {
        id: 'api-resource-id',
        name: 'demo-api',
        indicator: 'https://api.example.com'
      }
    ];

    (global.fetch as any)
      // Search for API resource
      .mockResolvedValueOnce({
        ok: true,
        json: async () => resourceSearchResponse
      })
      // Search for application
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [existingApp]
      })
      // Get application details
      .mockResolvedValueOnce({
        ok: true,
        json: async () => existingApp
      })
      // Update application metadata
      .mockResolvedValueOnce({
        ok: true,
        json: async () => updatedApp
      })
      // Update user consent scopes
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

    const result = await ensureApplication(BASE_ENV, mockToken);

    expect(result.id).toBe('existing-app-id');
    expect(global.fetch).toHaveBeenCalledTimes(5);

    // Verify PATCH was called
    const patchCall = (global.fetch as any).mock.calls[3];
    expect(patchCall[1].method).toBe('PATCH');
    const patchBody = JSON.parse(patchCall[1].body);
    expect(patchBody.oidcClientMetadata.redirectUris).toContain('https://demo.just/callback');
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

    // Mock API resource search for scope configuration in ensureApplication
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'resource-id',
          name: 'demo-api',
          indicator: 'https://api.example.com'
        }
      ]
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
        name: 'demo-web',
        type: 'Traditional',
        secret: 'app-secret'
      })
    });

    // Mock user consent scopes update
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
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

    const result = await provisionLogto({ env: BASE_ENV });

    expect(result.applicationId).toBe('app-id');
    expect(result.applicationSecret).toBe('app-secret');
    expect(result.apiResourceId).toBe('resource-id');

    // Verify token endpoint was called with correct resource
    const tokenCall = (global.fetch as any).mock.calls[0];
    expect(tokenCall[0]).toContain('/oidc/token');
    expect(tokenCall[1].body).toContain('resource=https%3A%2F%2Fauth.example.com%2Fapi');
  });

  it('handles dry-run mode', async () => {
    const logLines: string[] = [];
    const logger = (line: string) => logLines.push(line);

    const result = await provisionLogto({
      env: BASE_ENV,
      dryRun: true,
      logger
    });

    expect(result.applicationId).toBe('dry-run-app-id');
    expect(result.applicationSecret).toBe('dry-run-app-secret');
    expect(logLines.some((line) => line.includes('dry-run'))).toBe(true);
    // Verify no network calls were made in dry-run mode
    expect(global.fetch).not.toHaveBeenCalled();
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

    // Mock API resource search for scope configuration in ensureApplication
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'resource-id',
          name: 'demo-api',
          indicator: 'https://api.example.com'
        }
      ]
    });

    // Mock application search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock application create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'app-id', name: 'demo-web', type: 'Traditional' })
    });

    // Mock user consent scopes update
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
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

    // Mock API resource search for scope configuration in ensureApplication
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'resource-id',
          name: 'demo-api',
          indicator: 'https://api.example.com'
        }
      ]
    });

    // Mock application search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock application create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'app-id', name: 'demo-web', type: 'Traditional' })
    });

    // Mock user consent scopes update
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
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
      LOGTO_APPLICATION_SECRET: 'logto-app-secret',
      LOGTO_MANAGEMENT_AUTH_BASIC: 'YWJjOmRlZg==',
      STRIPE_SECRET_KEY: 'sk_test_12345',
      STRIPE_WEBHOOK_SECRET: 'whsec_12345'
    };

    // Mock token endpoint
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'mock-token', expires_in: 3600 })
    });

    // Mock API resource search for scope configuration in ensureApplication
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'resource-id',
          name: 'demo-api',
          indicator: 'https://api.example.com'
        }
      ]
    });

    // Mock application search
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    // Mock application create
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'app-id', name: 'demo-web', type: 'Traditional' })
    });

    // Mock user consent scopes update
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
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
