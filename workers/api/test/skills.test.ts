import { describe, expect, it, vi } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const prepare = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true, meta: {} }),
    all: vi.fn().mockResolvedValue({ success: true, results: [] }),
    raw: vi.fn(),
  });
  const defaultDb: D1Database = {
    prepare,
    dump: vi.fn(),
    batch: vi.fn(),
  } as unknown as D1Database;

  return {
    LOGIN_ORIGIN: 'https://login.justevery.com',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://skill.justevery.com',
    STRIPE_PRODUCTS: '[]',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    EXPO_PUBLIC_WORKER_ORIGIN: 'https://skill.justevery.com',
    DB: defaultDb,
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
    } as unknown as Env['ASSETS'],
    ...overrides,
  } as Env;
}

const ctx = {} as ExecutionContext;

async function runFetch(request: Request, env: Env): Promise<Response> {
  const handler = Worker.fetch;
  if (!handler) {
    throw new Error('Expected Worker.fetch to be defined');
  }
  return handler(
    request as Request<unknown, IncomingRequestCfProperties<unknown>>,
    env,
    ctx,
  );
}

describe('skills api', () => {
  it('returns an expanded catalog with at least 20 benchmarked skills', async () => {
    const env = createMockEnv();
    const response = await runFetch(new Request('https://skill.justevery.com/api/skills'), env);
    expect(response.status).toBe(200);
    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    if (!contentType.includes('application/json')) {
      throw new Error(`expected json response, got ${contentType}: ${raw.slice(0, 120)}`);
    }
    const payload = JSON.parse(raw) as { skills?: unknown[]; source?: string };
    expect(payload.source).toBeTruthy();
    expect(Array.isArray(payload.skills)).toBe(true);
    expect(payload.skills?.length).toBeGreaterThanOrEqual(20);

    const first = payload.skills?.[0] as {
      provenance?: { sourceUrl?: string };
      securityReview?: { status?: string };
    };
    expect(typeof first?.provenance?.sourceUrl).toBe('string');
    expect(first?.securityReview?.status).toBe('approved');
  });

  it('recommends CI security hardening for pipeline hardening queries', async () => {
    const env = createMockEnv();
    const request = new Request('https://skill.justevery.com/api/skills/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'Harden our GitHub Actions workflow, pin dependencies, and secure secrets.',
        agent: 'codex',
      }),
    });
    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    if (!contentType.includes('application/json')) {
      throw new Error(`expected json response, got ${contentType}: ${raw.slice(0, 120)}`);
    }

    const payload = JSON.parse(raw) as {
      retrievalStrategy?: string;
      recommendation?: { slug?: string; finalScore?: number };
      candidates?: Array<{ slug?: string }>;
    };
    expect(payload.retrievalStrategy).toBeTruthy();
    expect(payload.recommendation?.slug).toBe('ci-security-hardening');
    expect(typeof payload.recommendation?.finalScore).toBe('number');
    expect(payload.candidates?.length).toBeGreaterThan(0);
  });

  it('returns score breakdown for a specific skill', async () => {
    const env = createMockEnv();
    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/ci-security-hardening'),
      env,
    );
    expect(response.status).toBe(200);
    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    if (!contentType.includes('application/json')) {
      throw new Error(`expected json response, got ${contentType}: ${raw.slice(0, 120)}`);
    }

    const payload = JSON.parse(raw) as {
      skill?: {
        id?: string;
        scores?: unknown[];
      };
    };
    expect(payload.skill?.id).toBe('skill-ci-security-hardening');
    expect(Array.isArray(payload.skill?.scores)).toBe(true);
    expect(payload.skill?.scores?.length).toBeGreaterThan(0);
  });
});
