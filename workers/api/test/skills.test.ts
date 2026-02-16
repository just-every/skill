import { describe, expect, it, vi } from 'vitest';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const defaultDb = createCatalogDbMock(50);

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

function createCatalogDbMock(skillCount: number, options?: { runMode?: string; artifactToken?: string }): D1Database {
  const runMode = options?.runMode ?? 'daytona';
  const artifactToken = options?.artifactToken ?? 'daytona';
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
      mode: runMode,
      status: 'completed',
      started_at: '2026-02-15T01:00:00.000Z',
      completed_at: '2026-02-15T01:20:00.000Z',
      artifact_path: `benchmarks/runs/2026-02-15-${artifactToken}/codex`,
      notes: 'custom codex daytona run',
    },
    {
      id: 'bench-custom-claude',
      runner: 'custom-runner',
      mode: runMode,
      status: 'completed',
      started_at: '2026-02-15T01:21:00.000Z',
      completed_at: '2026-02-15T01:40:00.000Z',
      artifact_path: `benchmarks/runs/2026-02-15-${artifactToken}/claude`,
      notes: 'custom claude daytona run',
    },
    {
      id: 'bench-custom-gemini',
      runner: 'custom-runner',
      mode: runMode,
      status: 'completed',
      started_at: '2026-02-15T01:41:00.000Z',
      completed_at: '2026-02-15T02:00:00.000Z',
      artifact_path: `benchmarks/runs/2026-02-15-${artifactToken}/gemini`,
      notes: 'custom gemini daytona run',
    },
  ];

  const skillRows = Array.from({ length: skillCount }, (_, index) => {
    const n = String(index + 1).padStart(2, '0');
    if (index === 0) {
      return {
        id: 'skill-ci-security-hardening',
        slug: 'ci-security-hardening',
        name: 'CI Security Hardening',
        agent_family: 'multi',
        summary: 'Workflow hardening for CI systems.',
        description: 'Secure GitHub Actions workflows with OIDC and action pinning.',
        keywords_json: '["ci","github-actions","security","oidc"]',
        source_url: 'https://docs.github.com/actions/security-guides',
        imported_from: 'custom corpus',
        security_status: 'approved',
        security_notes: 'custom reviewed',
        provenance_json: JSON.stringify({
          sourceUrl: 'https://docs.github.com/actions/security-guides',
          repository: 'github/docs',
          importedFrom: 'custom corpus',
          license: 'CC-BY-4.0',
          lastVerifiedAt: '2026-02-15T00:00:00.000Z',
          checksum: 'custom-ci-security-hardening',
        }),
        security_review_json: JSON.stringify({
          status: 'approved',
          reviewedBy: 'Custom Review Bot',
          reviewedAt: '2026-02-15T00:00:00.000Z',
          reviewMethod: 'manual',
          checklistVersion: 'v1',
          notes: 'ok',
        }),
        embedding_json: '[0.2,0.4,0.6]',
        created_at: '2026-02-15T00:00:00.000Z',
        updated_at: '2026-02-15T00:00:00.000Z',
      };
    }
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

  const scoreRows = skillRows.flatMap((skill, index) => {
    const task = taskRows[index % taskRows.length];
    return runRows.map((run, runIndex) => ({
      id: `custom-score-${String(index + 1).padStart(2, '0')}-${runIndex + 1}`,
      run_id: run.id,
      skill_id: skill.id,
      task_id: task.id,
      agent: ['codex', 'claude', 'gemini'][runIndex],
      overall_score: 88 + runIndex,
      quality_score: 89 + runIndex,
      security_score: 90 + runIndex,
      speed_score: 87 + runIndex,
      cost_score: 86 + runIndex,
      success_rate: 0.88 + runIndex * 0.01,
      artifact_path: `benchmarks/runs/2026-02-15-${artifactToken}/${run.id}/${skill.slug}.json`,
      created_at: '2026-02-15T01:00:00.000Z',
      task_slug: task.slug,
      task_name: task.name,
    }));
  });

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
    expect(payload.source).toBe('d1');
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

  it('exposes full catalog payload including tasks, runs, and score rows', async () => {
    const env = createMockEnv();
    const response = await runFetch(new Request('https://skill.justevery.com/api/skills/catalog'), env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      source?: string;
      tasks?: unknown[];
      skills?: unknown[];
      runs?: unknown[];
      scores?: unknown[];
      coverage?: { scoreRows?: number; skillsCovered?: number };
    };

    expect(payload.source).toBe('d1');
    expect(payload.tasks?.length).toBe(20);
    expect(payload.skills?.length).toBe(50);
    expect(payload.runs?.length).toBe(3);
    expect(payload.scores?.length).toBe(150);
    expect(payload.coverage?.skillsCovered).toBe(50);
    expect(payload.coverage?.scoreRows).toBe(150);
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

  it('rejects corpora that are not exactly 50 skills', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(51),
    });

    const response = await runFetch(new Request('https://skill.justevery.com/api/skills'), env);
    expect(response.status).toBe(409);
    const payload = (await response.json()) as {
      error?: string;
      details?: string;
    };

    expect(payload.error).toBe('benchmark_integrity_failed');
    expect(payload.details).toContain('exactly 50 skills');
  });

  it('rejects non-daytona benchmark rows to enforce real benchmark-only ingestion', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(50, { runMode: 'fallback' }),
    });

    const response = await runFetch(new Request('https://skill.justevery.com/api/skills/benchmarks'), env);
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error?: string; details?: string };
    expect(payload.error).toBe('non_real_benchmark_mode');
    expect(payload.details).toContain("Only 'daytona' is allowed");
  });

  it('rejects benchmark artifacts containing synthetic markers', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(50, { runMode: 'daytona', artifactToken: 'mock' }),
    });

    const response = await runFetch(new Request('https://skill.justevery.com/api/skills/benchmarks'), env);
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error?: string; details?: string };
    expect(payload.error).toBe('benchmark_integrity_failed');
    expect(payload.details).toContain('synthetic marker');
  });
});
