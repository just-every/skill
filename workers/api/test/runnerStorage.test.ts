import { describe, expect, it, vi } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

const ctx = {} as ExecutionContext;

function createRunnerDbMock(accountId = 'account-123'): D1Database {
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      bindings: [] as unknown[],
      bind(...args: unknown[]) {
        this.bindings = args;
        return this;
      },
      async first() {
        if (sql.includes('SELECT account_id FROM design_runs')) {
          return { account_id: accountId };
        }
        return null;
      },
      async run() {
        return { success: true, meta: { changes: 1 } };
      },
      async all() {
        return { success: true, results: [] };
      },
      raw: vi.fn(),
    };
    return statement;
  });

  return {
    prepare,
    dump: vi.fn(),
    batch: vi.fn(),
  } as unknown as D1Database;
}

function createStorageMock(): R2Bucket {
  return {
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false, delimitedPrefixes: [] }),
    get: vi.fn(),
    getWithMetadata: vi.fn(),
    head: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as R2Bucket;
}

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const env: Env = {
    LOGIN_ORIGIN: 'https://login.local',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://app.local',
    EXPO_PUBLIC_WORKER_ORIGIN: 'https://app.local',
    STRIPE_PRODUCTS: '[]',
    RUNNER_AUTH_SECRET: 'runner-secret',
    DB: createRunnerDbMock(),
    STORAGE: createStorageMock(),
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })) } as unknown as Env['ASSETS'],
  };

  return { ...env, ...overrides };
}

async function runFetch(request: Request, env: Env): Promise<Response> {
  const handler = Worker.fetch;
  if (!handler) {
    throw new Error('Expected Worker.fetch to be defined');
  }
  return handler(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, ctx);
}

describe('Runner storage endpoint', () => {
  it('rejects missing bearer token', async () => {
    const env = createMockEnv();
    const request = new Request('https://app.local/api/runner/runs/run-123/storage?path=bundle.zip', {
      method: 'PUT',
      body: 'hello',
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(401);
  });

  it('rejects invalid path', async () => {
    const env = createMockEnv();
    const request = new Request('https://app.local/api/runner/runs/run-123/storage?path=../secrets.txt', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer runner-secret',
        'content-type': 'text/plain',
      },
      body: 'hello',
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(400);
  });

  it('uploads to R2 under design-runs/<accountId>/<runId> prefix', async () => {
    const storage = createStorageMock();
    const env = createMockEnv({ STORAGE: storage });

    const request = new Request('https://app.local/api/runner/runs/run-123/storage?path=bundle.zip', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer runner-secret',
        'content-type': 'application/zip',
      },
      body: 'hello',
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);

    const payload = await response.json() as any;
    expect(payload.ok).toBe(true);
    expect(payload.storageKey).toBe('design-runs/account-123/run-123/bundle.zip');
    expect(payload.sizeBytes).toBe(5);
    expect(payload.contentType).toBe('application/zip');

    expect(storage.put).toHaveBeenCalledTimes(1);
    const [key, body, options] = (storage.put as any).mock.calls[0];
    expect(key).toBe('design-runs/account-123/run-123/bundle.zip');
    expect(body).toBeInstanceOf(ArrayBuffer);
    expect(options?.httpMetadata?.contentType).toBe('application/zip');
  });
});

