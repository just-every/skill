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

type ScoreSource = 'trial' | 'none';
type BenchmarkAgent = 'codex' | 'claude' | 'gemini';
type TrialDataset = 'default' | 'mode_sensitive_mixed' | 'shadow_override';

function createCatalogDbMock(
  skillCount: number,
  options?: {
    runMode?: string;
    artifactToken?: string;
    scoreSource?: ScoreSource;
    runAgents?: BenchmarkAgent[];
    corruptScoreRef?: 'unknown_run' | 'unknown_skill' | 'unknown_task';
    trialDataset?: TrialDataset;
    omitTrialModeColumn?: boolean;
    invalidTrialScoreAgent?: string;
    emptyTrialRows?: boolean;
  },
): D1Database {
  const runMode = options?.runMode ?? 'daytona';
  const artifactToken = options?.artifactToken ?? 'daytona';
  const scoreSource = options?.scoreSource ?? 'trial';
  const runAgents = options?.runAgents && options.runAgents.length > 0 ? options.runAgents : ['codex', 'claude', 'gemini'];
  const trialDataset = options?.trialDataset ?? 'default';
  const taskRows = Array.from({ length: 20 }, (_, index) => ({
    id: `custom-task-${String(index + 1).padStart(2, '0')}`,
    slug: `custom-task-${String(index + 1).padStart(2, '0')}`,
    name: `Custom Task ${String(index + 1).padStart(2, '0')}`,
    description: 'Custom task description',
    category: 'custom',
    tags_json: '["custom"]',
  }));

  const runRows = runAgents.map((agent, index) => ({
    id: `bench-custom-${agent}`,
    runner: 'custom-runner',
    mode: runMode,
    status: 'completed',
    started_at: `2026-02-15T01:${String(index * 10).padStart(2, '0')}:00.000Z`,
    completed_at: `2026-02-15T01:${String(index * 10 + 9).padStart(2, '0')}:00.000Z`,
    artifact_path: `benchmarks/runs/2026-02-15-${artifactToken}/${agent}`,
    notes: `custom ${agent} daytona run`,
    agent,
  }));

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
      agent: run.agent,
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

  if (scoreRows.length > 0 && options?.corruptScoreRef) {
    if (options.corruptScoreRef === 'unknown_run') {
      scoreRows[0] = { ...scoreRows[0], run_id: 'bench-custom-missing' };
    }
    if (options.corruptScoreRef === 'unknown_skill') {
      scoreRows[0] = { ...scoreRows[0], skill_id: 'skill-missing' };
    }
    if (options.corruptScoreRef === 'unknown_task') {
      scoreRows[0] = { ...scoreRows[0], task_id: 'task-missing' };
    }
  }

  let trialScoreRows = scoreRows.map((row) => {
    const isShadowOverride = trialDataset === 'shadow_override';
    const isCiHardening = row.skill_id === 'skill-ci-security-hardening';
    const isCustomTwo = row.skill_id === 'custom-skill-02';

    const overall = isShadowOverride
      ? isCiHardening
        ? 18
        : isCustomTwo
          ? 99
          : row.overall_score
      : row.overall_score;

    const quality = isShadowOverride
      ? isCiHardening
        ? 20
        : isCustomTwo
          ? 98
          : row.quality_score
      : row.quality_score;

    const security = isShadowOverride
      ? isCiHardening
        ? 17
        : isCustomTwo
          ? 97
          : row.security_score
      : row.security_score;

    const speed = isShadowOverride
      ? isCiHardening
        ? 30
        : isCustomTwo
          ? 95
          : row.speed_score
      : row.speed_score;

    const cost = isShadowOverride
      ? isCiHardening
        ? 25
        : isCustomTwo
          ? 96
          : row.cost_score
      : row.cost_score;

    const success = isShadowOverride
      ? isCiHardening
        ? 0.18
        : isCustomTwo
          ? 0.99
          : row.success_rate
      : row.success_rate;

    return {
    id: row.id,
    run_id: row.run_id,
    skill_id: row.skill_id,
    task_id: row.task_id,
    agent: row.agent,
    overall_score: overall,
    quality_score: quality,
    security_score: security,
    speed_score: speed,
    cost_score: cost,
    success_rate: success,
    artifact_path: row.artifact_path,
    created_at: row.created_at,
    task_slug: row.task_slug,
    task_name: row.task_name,
    };
  });

  if (trialScoreRows.length > 0 && options?.invalidTrialScoreAgent) {
    trialScoreRows[0] = { ...trialScoreRows[0], agent: options.invalidTrialScoreAgent };
  }
  if (options?.emptyTrialRows) {
    trialScoreRows = [];
  }

  const modeSensitiveOracleRows = scoreRows.map((row) => {
    if (row.skill_id === 'skill-ci-security-hardening') {
      return {
        ...row,
        overall_score: 99,
        quality_score: 99,
        security_score: 98,
        speed_score: 96,
        cost_score: 96,
        success_rate: 0.99,
      };
    }
    if (row.skill_id === 'custom-skill-02') {
      return {
        ...row,
        overall_score: 12,
        quality_score: 15,
        security_score: 18,
        speed_score: 25,
        cost_score: 30,
        success_rate: 0.12,
      };
    }
    return row;
  });

  const modeSensitiveMixedRows = scoreRows.map((row) => {
    if (row.skill_id === 'skill-ci-security-hardening') {
      return {
        ...row,
        overall_score: 20,
        quality_score: 22,
        security_score: 21,
        speed_score: 35,
        cost_score: 33,
        success_rate: 0.2,
      };
    }
    if (row.skill_id === 'custom-skill-02') {
      return {
        ...row,
        overall_score: 100,
        quality_score: 100,
        security_score: 99,
        speed_score: 97,
        cost_score: 97,
        success_rate: 1,
      };
    }
    return row;
  });

  const skillColumns = [
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

  const trialColumns = ['id', 'run_id', 'skill_id', 'benchmark_case_id', 'agent', 'status', 'artifact_path', 'evaluation_mode']
    .map((name, index) => ({ cid: index, name }));
  const trialColumnsWithoutMode = trialColumns.filter((column) => column.name !== 'evaluation_mode');

  const trialScoreColumns = ['id', 'trial_id', 'overall_score', 'quality_score', 'security_score', 'speed_score', 'cost_score', 'success_rate']
    .map((name, index) => ({ cid: index, name }));

  const benchmarkCaseColumns = ['id', 'benchmark_id'].map((name, index) => ({ cid: index, name }));
  const benchmarkColumns = ['id', 'task_id'].map((name, index) => ({ cid: index, name }));

  const prepare = vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn(async () => {
        const tableInfoMatch = sql.match(/^PRAGMA table_info\(([^)]+)\)$/);
        if (tableInfoMatch) {
          const table = tableInfoMatch[1]?.replace(/['"`]/g, '').trim();
          if (table === 'skills') {
            return { success: true, results: skillColumns };
          }
          if (table === 'trials') {
            return {
              success: true,
              results:
                scoreSource === 'trial'
                  ? options?.omitTrialModeColumn
                    ? trialColumnsWithoutMode
                    : trialColumns
                  : [],
            };
          }
          if (table === 'trial_scores') {
            return { success: true, results: scoreSource === 'trial' ? trialScoreColumns : [] };
          }
          if (table === 'benchmark_cases') {
            return { success: true, results: scoreSource === 'trial' ? benchmarkCaseColumns : [] };
          }
          if (table === 'benchmarks') {
            return { success: true, results: scoreSource === 'trial' ? benchmarkColumns : [] };
          }
          return { success: true, results: [] };
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
        if (sql.includes('FROM trial_scores ts')) {
          if (scoreSource !== 'trial') {
            return { success: true, results: [] };
          }
          if (trialDataset === 'mode_sensitive_mixed') {
            if (sql.includes("tr.evaluation_mode = 'oracle_skill'")) {
              return { success: true, results: modeSensitiveOracleRows };
            }
            return { success: true, results: modeSensitiveMixedRows };
          }
          return { success: true, results: trialScoreRows };
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

  it('sources score rows from trial tables while preserving the catalog response shape', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(50, { scoreSource: 'trial' }),
    });

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

  it('uses trial-native recommendation responses by default', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(50, { scoreSource: 'trial', trialDataset: 'shadow_override' }),
    });

    const request = new Request('https://skill.justevery.com/api/skills/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'quantum zebra baseline workflow alignment',
        agent: 'codex',
      }),
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      recommendation?: { slug?: string };
    };

    expect(payload.recommendation?.slug).toBe('custom-skill-02');
  });

  it('rejects recommendation when trial score rows are missing', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(50, { scoreSource: 'trial', emptyTrialRows: true }),
    });

    const request = new Request('https://skill.justevery.com/api/skills/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'quantum zebra baseline workflow alignment',
        agent: 'codex',
      }),
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(409);
    const payload = (await response.json()) as {
      error?: string;
    };

    expect(payload.error).toBe('trial_native_scores_missing');
  });

  it('rejects recommendation when trial schema is missing oracle-mode compatibility column', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(50, { scoreSource: 'trial', omitTrialModeColumn: true }),
    });

    const request = new Request('https://skill.justevery.com/api/skills/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'quantum zebra baseline workflow alignment',
        agent: 'codex',
      }),
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(409);
    const payload = (await response.json()) as {
      error?: string;
    };

    expect(payload.error).toBe('trial_native_schema_unavailable');
  });

  it('uses oracle_skill-only trial rows for ranking to avoid baseline/library contamination', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(50, { scoreSource: 'trial', trialDataset: 'mode_sensitive_mixed' }),
    });

    const request = new Request('https://skill.justevery.com/api/skills/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'quantum zebra baseline workflow alignment',
        agent: 'codex',
      }),
    });

    const response = await runFetch(request, env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      recommendation?: { slug?: string };
    };

    expect(payload.recommendation?.slug).toBe('ci-security-hardening');
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

  it('accepts variable corpus sizes without fixed 50-skill constraints', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(7),
    });

    const response = await runFetch(new Request('https://skill.justevery.com/api/skills/catalog'), env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      skills?: unknown[];
      runs?: unknown[];
      scores?: unknown[];
    };

    expect(payload.skills?.length).toBe(7);
    expect(payload.runs?.length).toBe(3);
    expect(payload.scores?.length).toBe(21);
  });

  it('accepts partial agent coverage in benchmark rows', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(12, { runAgents: ['codex'] }),
    });

    const response = await runFetch(new Request('https://skill.justevery.com/api/skills/benchmarks'), env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      coverage?: {
        agentsCovered?: string[];
        scoreRows?: number;
      };
    };

    expect(payload.coverage?.agentsCovered).toEqual(['codex']);
    expect(payload.coverage?.scoreRows).toBe(12);
  });

  it('rejects score rows with broken run references', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(10, { corruptScoreRef: 'unknown_run' }),
    });

    const response = await runFetch(new Request('https://skill.justevery.com/api/skills/benchmarks'), env);
    expect(response.status).toBe(409);
    const payload = (await response.json()) as {
      error?: string;
      details?: string;
    };

    expect(payload.error).toBe('benchmark_integrity_failed');
    expect(payload.details).toContain('references unknown run');
  });

  it('rejects catalog reads when trial-native schema is unavailable', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(10, { scoreSource: 'none' }),
    });

    const response = await runFetch(new Request('https://skill.justevery.com/api/skills/catalog'), env);
    expect(response.status).toBe(409);
    const payload = (await response.json()) as {
      error?: string;
      details?: string;
    };

    expect(payload.error).toBe('trial_native_schema_unavailable');
  });

  it('rejects recommendation when trial score agent values are unsupported', async () => {
    const env = createMockEnv({
      DB: createCatalogDbMock(10, { scoreSource: 'trial', invalidTrialScoreAgent: 'codex-plus' }),
    });

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          task: 'Harden CI with OIDC and action pinning for production pipelines',
          agent: 'codex',
        }),
      }),
      env,
    );

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error?: string; details?: string };
    expect(payload.error).toBe('benchmark_integrity_failed');
    expect(payload.details).toContain("unsupported raw agent 'codex-plus'");
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
