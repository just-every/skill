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

function createExpandedCatalogDbMock(skillCount: number): D1Database {
  const taskRows = Array.from({ length: 20 }, (_, index) => ({
    id: `custom-task-${String(index + 1).padStart(2, '0')}`,
    slug: `custom-task-${String(index + 1).padStart(2, '0')}`,
    name: `Custom Task ${String(index + 1).padStart(2, '0')}`,
    description: 'Custom task description',
    category: 'custom',
    tags_json: '["custom"]',
  }));

  const runRows = [
    {
      id: 'bench-custom-codex',
      runner: 'custom-runner',
      mode: 'fallback',
      status: 'completed',
      started_at: '2026-02-15T01:00:00.000Z',
      completed_at: '2026-02-15T01:20:00.000Z',
      artifact_path: 'benchmarks/runs/custom/codex',
      notes: 'custom codex run',
    },
    {
      id: 'bench-custom-claude',
      runner: 'custom-runner',
      mode: 'fallback',
      status: 'completed',
      started_at: '2026-02-15T01:21:00.000Z',
      completed_at: '2026-02-15T01:40:00.000Z',
      artifact_path: 'benchmarks/runs/custom/claude',
      notes: 'custom claude run',
    },
    {
      id: 'bench-custom-gemini',
      runner: 'custom-runner',
      mode: 'fallback',
      status: 'completed',
      started_at: '2026-02-15T01:41:00.000Z',
      completed_at: '2026-02-15T02:00:00.000Z',
      artifact_path: 'benchmarks/runs/custom/gemini',
      notes: 'custom gemini run',
    },
  ];

  const skillRows = Array.from({ length: skillCount }, (_, index) => {
    const n = String(index + 1).padStart(2, '0');
    return {
      id: `custom-skill-${n}`,
      slug: `custom-skill-${n}`,
      name: `Custom Skill ${n}`,
      agent_family: 'multi',
      summary: `Custom summary ${n}`,
      description: `Custom description ${n}`,
      keywords_json: '["custom","skill"]',
      source_url: `https://example.com/skills/${n}`,
      imported_from: 'custom corpus',
      security_status: 'approved',
      security_notes: 'custom reviewed',
      provenance_json: JSON.stringify({
        sourceUrl: `https://example.com/skills/${n}`,
        repository: 'example/repo',
        importedFrom: 'custom corpus',
        license: 'MIT',
        lastVerifiedAt: '2026-02-15T00:00:00.000Z',
        checksum: `custom-${n}`,
      }),
      security_review_json: JSON.stringify({
        status: 'approved',
        reviewedBy: 'Custom Review Bot',
        reviewedAt: '2026-02-15T00:00:00.000Z',
        reviewMethod: 'manual',
        checklistVersion: 'v1',
        notes: 'ok',
      }),
      embedding_json: '[0.1,0.2,0.3]',
      created_at: '2026-02-15T00:00:00.000Z',
      updated_at: '2026-02-15T00:00:00.000Z',
    };
  });

  const scoreRows = skillRows.map((skill, index) => ({
    id: `custom-score-${String(index + 1).padStart(2, '0')}`,
    run_id: runRows[index % runRows.length].id,
    skill_id: skill.id,
    task_id: taskRows[index % taskRows.length].id,
    agent: ['codex', 'claude', 'gemini'][index % 3],
    overall_score: 88,
    quality_score: 89,
    security_score: 90,
    speed_score: 87,
    cost_score: 86,
    success_rate: 0.88,
    artifact_path: `benchmarks/runs/custom/${skill.slug}.json`,
    created_at: '2026-02-15T01:00:00.000Z',
    task_slug: taskRows[index % taskRows.length].slug,
    task_name: taskRows[index % taskRows.length].name,
  }));

  const columns = [
    'id',
    'slug',
    'name',
    'agent_family',
    'summary',
    'description',
    'keywords_json',
    'source_url',
    'imported_from',
    'security_status',
    'security_notes',
    'created_at',
    'updated_at',
    'provenance_json',
    'security_review_json',
    'embedding_json',
  ].map((name, index) => ({ cid: index, name }));

  const prepare = vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn(async () => {
        if (sql.startsWith('PRAGMA table_info(skills)')) {
          return { success: true, results: columns };
        }
        if (sql.includes('FROM skills ORDER BY name ASC')) {
          return { success: true, results: skillRows };
        }
        if (sql.includes('FROM skill_tasks ORDER BY name ASC')) {
          return { success: true, results: taskRows };
        }
        if (sql.includes('FROM skill_benchmark_runs ORDER BY started_at DESC')) {
          return { success: true, results: runRows };
        }
        if (sql.includes('FROM skill_task_scores s')) {
          return { success: true, results: scoreRows };
        }
        return { success: true, results: [] };
      }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ success: true, meta: {} }),
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
  it('returns an expanded catalog with exactly 50 benchmarked skills', async () => {
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
    expect(payload.skills?.length).toBe(50);

    const first = payload.skills?.[0] as {
      provenance?: { sourceUrl?: string };
      securityReview?: { status?: string };
    };
    expect(typeof first?.provenance?.sourceUrl).toBe('string');
    expect(first?.securityReview?.status).toBe('approved');
  });

  it('reports full benchmark coverage for all 50 skills', async () => {
    const env = createMockEnv();
    const response = await runFetch(new Request('https://skill.justevery.com/api/skills/benchmarks'), env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      coverage?: {
        skillsCovered?: number;
        scoreRows?: number;
        agentsCovered?: string[];
      };
      runs?: Array<{ id: string }>;
    };

    expect(payload.runs?.length).toBe(3);
    expect(payload.coverage?.skillsCovered).toBe(50);
    expect(payload.coverage?.scoreRows).toBe(150);
    expect(payload.coverage?.agentsCovered?.sort()).toEqual(['claude', 'codex', 'gemini']);
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

  it('preserves already-expanded D1 corpora above 50 skills without fallback override', async () => {
    const env = createMockEnv({
      DB: createExpandedCatalogDbMock(51),
    });

    const response = await runFetch(new Request('https://skill.justevery.com/api/skills'), env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      source?: string;
      total?: number;
      skills?: Array<{ slug?: string }>;
    };

    expect(payload.source).toBe('d1');
    expect(payload.total).toBe(51);
    expect(payload.skills?.some((skill) => skill.slug === 'custom-skill-51')).toBe(true);
  });
});
