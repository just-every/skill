import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSmokeChecks } from '../src/smoke/check.js';

vi.mock('execa', () => ({
  execa: vi.fn(async (cmd: string, args: string[]) => {
    if (args.includes('secret')) {
      return {
        stdout: JSON.stringify([
          { name: 'STRIPE_WEBHOOK_SECRET' },
          { name: 'LOGTO_APPLICATION_ID' }
        ])
      };
    }
    if (args.includes('d1')) {
      return { stdout: JSON.stringify([{ results: [{ id: 'demo-project' }] }]) };
    }
    return { stdout: '' };
  })
}));

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = originalFetch;
});

describe('runSmokeChecks', () => {
  it('records successful checks and writes reports', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/api/session')) {
        return new Response('unauth', { status: 401 });
      }
      if (url.includes('callback?error=debug')) {
        return new Response('redirect', { status: 302 });
      }
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: 'https://auth.demo.example/oidc',
            jwks_uri: 'https://auth.demo.example/oidc/jwks'
          }),
          { status: 200 }
        );
      }
      return new Response('ok', { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await runSmokeChecks({
      baseUrl: 'https://example.com',
      routes: ['/'],
      bearerToken: null,
      outputRoot: 'test-results/smoke-test',
      stamp: 'demo',
      projectId: 'demo-project',
      d1Name: 'demo-project-d1',
      logtoEndpoint: 'https://auth.demo.example',
      logtoApplicationId: 'logto-app'
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(4);
    expect(result.reportPath.endsWith('report.json')).toBe(true);
  });
});
