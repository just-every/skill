import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import Worker, { type Env } from '../src/index';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

type TrialDbState = {
  runs: Array<{ id: string; mode: string; status: string; completedAt: string | null; artifactPath: string; notes: string }>;
  trials: Array<{ id: string; runId: string; skillId: string | null; evaluationMode: string; status: string; completedAt: string | null }>;
  events: Array<{ trialId: string; eventType: string }>;
  bindings: Array<{ sql: string; placeholders: number; bound: number }>;
  scores: Array<{
    trialId: string;
    overallScore: number;
    successRate: number;
    deterministicScore: number;
    safetyScore: number;
    efficiencyScore: number;
  }>;
};

function createTrialExecutionDbMock(options?: {
  existingRun?: { id: string; mode: string; artifactPath: string; notes: string };
  benchmarkContainerImage?: string;
  benchmarkTimeoutSeconds?: number;
  failFirstRunInsertWithConstraint?: boolean;
}): { db: D1Database; state: TrialDbState } {
  const benchmarkCases = new Set(['benchmark-case-custom-task-01']);
  const skillLookup = new Map<string, string>([
    ['skill-ci-security-hardening', 'skill-ci-security-hardening'],
    ['ci-security-hardening', 'skill-ci-security-hardening'],
  ]);
  const runsById = new Map<string, {
    mode: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    artifactPath: string;
    notes: string;
  }>();
  if (options?.existingRun) {
    runsById.set(options.existingRun.id, {
      mode: options.existingRun.mode,
      status: options.existingRun.mode === 'daytona' ? 'completed' : 'running',
      startedAt: '2026-02-16T00:00:00.000Z',
      completedAt: options.existingRun.mode === 'daytona' ? '2026-02-16T00:00:00.000Z' : null,
      artifactPath: options.existingRun.artifactPath,
      notes: options.existingRun.notes,
    });
  }

  const state: TrialDbState = {
    runs: [],
    trials: [],
    events: [],
    bindings: [],
    scores: [],
  };

  const countPlaceholders = (sql: string): number => {
    const matches = sql.match(/\?/g);
    return matches ? matches.length : 0;
  };

  const cloneRunsMap = (): Map<string, {
    mode: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    artifactPath: string;
    notes: string;
  }> => {
    return new Map(
      Array.from(runsById.entries()).map(([key, value]) => [key, { ...value }]),
    );
  };

  const restoreRunsMap = (snapshot: Map<string, {
    mode: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    artifactPath: string;
    notes: string;
  }>): void => {
    runsById.clear();
    for (const [key, value] of snapshot.entries()) {
      runsById.set(key, { ...value });
    }
  };

  let txSnapshot:
    | {
      state: TrialDbState;
      runs: Map<string, {
        mode: string;
        status: string;
        startedAt: string;
        completedAt: string | null;
        artifactPath: string;
        notes: string;
      }>;
    }
    | null = null;
  let failedRunInsertOnce = false;

  const prepare = vi.fn((sql: string) => {
    const statement = {
      bindings: [] as unknown[],
      bind: vi.fn(function bind(...bindings: unknown[]) {
        statement.bindings = bindings;
        return statement;
      }),
      first: vi.fn(async () => {
        if (sql.includes('FROM benchmark_cases bc')) {
          const benchmarkCaseId = String(statement.bindings[0] ?? '');
          if (benchmarkCases.has(benchmarkCaseId)) {
            return {
              id: benchmarkCaseId,
              container_image: options?.benchmarkContainerImage ?? 'docker.io/library/alpine@sha256:a4f4213abb84c497377b8544c81b3564f313746700372ec4fe84653e4fb03805',
              timeout_seconds: options?.benchmarkTimeoutSeconds ?? 1800,
            };
          }
          return null;
        }

        if (sql.includes('FROM skills WHERE id = ? OR slug = ?')) {
          const byId = String(statement.bindings[0] ?? '');
          const bySlug = String(statement.bindings[1] ?? '');
          const canonical = skillLookup.get(byId) ?? skillLookup.get(bySlug);
          if (canonical) {
            return { id: canonical };
          }
          return null;
        }

        if (sql.includes('FROM skill_benchmark_runs WHERE id = ?')) {
          const runId = String(statement.bindings[0] ?? '');
          const run = runsById.get(runId);
          if (!run) {
            const fromState = state.runs.find((entry) => entry.id === runId);
            if (!fromState) return null;
            return {
              id: runId,
              mode: fromState.mode,
              status: fromState.status,
              started_at: '2026-02-16T00:00:00.000Z',
              completed_at: fromState.completedAt,
              artifact_path: fromState.artifactPath,
              notes: fromState.notes,
            };
          }
          return {
            id: runId,
            mode: run.mode,
            status: run.status,
            started_at: run.startedAt,
            completed_at: run.completedAt,
            artifact_path: run.artifactPath,
            notes: run.notes,
          };
        }

        return null;
      }),
      run: vi.fn(async () => {
        const normalizedSql = sql.trim().toUpperCase();
        if (normalizedSql === 'BEGIN IMMEDIATE') {
          txSnapshot = {
            state: {
              runs: state.runs.map((run) => ({ ...run })),
              trials: state.trials.map((trial) => ({ ...trial })),
              events: state.events.map((event) => ({ ...event })),
              bindings: state.bindings.map((entry) => ({ ...entry })),
              scores: state.scores.map((score) => ({ ...score })),
            },
            runs: cloneRunsMap(),
          };
          return { success: true, meta: {} };
        }
        if (normalizedSql === 'COMMIT') {
          txSnapshot = null;
          return { success: true, meta: {} };
        }
        if (normalizedSql === 'ROLLBACK') {
          if (txSnapshot) {
            state.runs = txSnapshot.state.runs.map((run) => ({ ...run }));
            state.trials = txSnapshot.state.trials.map((trial) => ({ ...trial }));
            state.events = txSnapshot.state.events.map((event) => ({ ...event }));
            state.bindings = txSnapshot.state.bindings.map((entry) => ({ ...entry }));
            state.scores = txSnapshot.state.scores.map((score) => ({ ...score }));
            restoreRunsMap(txSnapshot.runs);
          }
          txSnapshot = null;
          return { success: true, meta: {} };
        }

        if (sql.includes('INSERT INTO ')) {
          state.bindings.push({
            sql,
            placeholders: countPlaceholders(sql),
            bound: statement.bindings.length,
          });
        }
        if (sql.includes('INSERT INTO skill_benchmark_runs')) {
          const [id, , modeStatus, startedAt, completedAt, artifactPath, notes] = statement.bindings as (string | null)[];
          if (options?.failFirstRunInsertWithConstraint && !failedRunInsertOnce) {
            failedRunInsertOnce = true;
            runsById.set(String(id), {
              mode: 'daytona',
              status: String(modeStatus),
              startedAt: startedAt ? String(startedAt) : '2026-02-16T00:00:00.000Z',
              completedAt: completedAt ? String(completedAt) : null,
              artifactPath: String(artifactPath),
              notes: String(notes),
            });
            state.runs.push({
              id: String(id),
              mode: 'daytona',
              status: String(modeStatus),
              completedAt: completedAt ? String(completedAt) : null,
              artifactPath: String(artifactPath),
              notes: String(notes),
            });
            throw new Error('UNIQUE constraint failed: skill_benchmark_runs.id');
          }
          runsById.set(String(id), {
            mode: 'daytona',
            status: String(modeStatus),
            startedAt: startedAt ? String(startedAt) : '2026-02-16T00:00:00.000Z',
            completedAt: completedAt ? String(completedAt) : null,
            artifactPath: String(artifactPath),
            notes: String(notes),
          });
          state.runs.push({
            id: String(id),
            mode: 'daytona',
            status: String(modeStatus),
            completedAt: completedAt ? String(completedAt) : null,
            artifactPath: String(artifactPath),
            notes: String(notes),
          });
        } else if (sql.includes('UPDATE skill_benchmark_runs SET status = ?, completed_at = ? WHERE id = ?')) {
          const [status, completedAt, runId] = statement.bindings as (string | null)[];
          const key = String(runId);
          const existing = runsById.get(key);
          if (existing) {
            runsById.set(key, {
              ...existing,
              status: String(status),
              completedAt: completedAt ? String(completedAt) : null,
            });
          }
          const runIndex = state.runs.findIndex((run) => run.id === key);
          if (runIndex >= 0) {
            const run = state.runs[runIndex];
            state.runs[runIndex] = {
              ...run,
              status: String(status),
              completedAt: completedAt ? String(completedAt) : null,
            };
          }
        } else if (sql.includes('INSERT INTO trials')) {
          const [id, , runId, skillId, , , , evaluationMode, status, , , , completedAt] = statement.bindings as (string | null)[];
          state.trials.push({
            id: String(id),
            runId: String(runId),
            skillId: skillId ? String(skillId) : null,
            evaluationMode: String(evaluationMode),
            status: String(status),
            completedAt: completedAt ? String(completedAt) : null,
          });
        } else if (sql.includes('INSERT INTO trial_events')) {
          const [, trialId, eventType] = statement.bindings as string[];
          state.events.push({ trialId, eventType });
        } else if (sql.includes('INSERT INTO trial_scores')) {
          const [, trialId, overallScore, , , , , successRate, deterministicScore, safetyScore, efficiencyScore] = statement.bindings as (string | number)[];
          state.scores.push({
            trialId: String(trialId),
            overallScore: Number(overallScore),
            successRate: Number(successRate),
            deterministicScore: Number(deterministicScore),
            safetyScore: Number(safetyScore),
            efficiencyScore: Number(efficiencyScore),
          });
        }
        return { success: true, meta: {} };
      }),
      all: vi.fn(async () => {
        if (sql.includes('FROM trials t') && sql.includes('LEFT JOIN trial_scores ts')) {
          const runId = String(statement.bindings[0] ?? '');
          const rows = state.trials
            .filter((trial) => trial.runId === runId)
            .map((trial) => {
              const score = state.scores.find((entry) => entry.trialId === trial.id);
              return {
                id: trial.id,
                evaluation_mode: trial.evaluationMode,
                status: trial.status,
                skill_id: trial.skillId,
                agent: 'codex',
                artifact_path: `benchmarks/runs/mock/${trial.id}.json`,
                created_at: '2026-02-16T00:00:00.000Z',
                score_id: score ? `score-${trial.id}` : null,
                overall_score: score?.overallScore ?? null,
                success_rate: score?.successRate ?? null,
                deterministic_score: score?.deterministicScore ?? null,
                safety_score: score?.safetyScore ?? null,
              };
            });
          return { success: true, results: rows };
        }
        return { success: true, results: [] };
      }),
      raw: vi.fn(),
    };

    return statement;
  });

  return {
    db: {
      prepare,
      dump: vi.fn(),
      batch: vi.fn(),
    } as unknown as D1Database,
    state,
  };
}

function createTrialEnv(
  db: D1Database,
  token = 'trial-exec-token-123456',
  options?: {
    orchestratorUrl?: string;
    orchestratorToken?: string;
  },
): Env {
  return {
    LOGIN_ORIGIN: 'https://login.justevery.com',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://skill.justevery.com',
    STRIPE_PRODUCTS: '[]',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    EXPO_PUBLIC_WORKER_ORIGIN: 'https://skill.justevery.com',
    SKILLS_TRIAL_EXECUTE_TOKEN: token,
    SKILLS_TRIAL_ORCHESTRATOR_URL: options?.orchestratorUrl,
    SKILLS_TRIAL_ORCHESTRATOR_TOKEN: options?.orchestratorToken,
    DB: db,
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
    } as unknown as Env['ASSETS'],
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

describe('skills trial execution', () => {
  it('persists baseline trial, events, and scores with deterministic + safety checks', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'baseline',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/trial.json',
          events: [
            { type: 'command', command: 'npm test', exitCode: 0, durationMs: 1400 },
            { type: 'tool_call', tool: 'edit', durationMs: 300 },
          ],
          checks: {
            deterministic: { passed: 1, total: 1 },
            safety: { violations: [] },
            metrics: { durationMs: 1700, commandCount: 1, toolCallCount: 1, costUnits: 1 },
          },
        }),
      }),
      env,
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      trial?: { evaluationMode?: string; skillId?: string | null };
      scoring?: { deterministicScore?: number; safetyScore?: number; overallScore?: number };
    };

    expect(payload.trial?.evaluationMode).toBe('baseline');
    expect(payload.trial?.skillId ?? null).toBeNull();
    expect(payload.scoring?.deterministicScore).toBe(100);
    expect((payload.scoring?.safetyScore ?? 0) > 90).toBe(true);
    expect((payload.scoring?.overallScore ?? 0) > 80).toBe(true);

    expect(state.runs.length).toBe(1);
    expect(state.trials.length).toBe(1);
    expect(state.events.length).toBe(2);
    expect(state.scores.length).toBe(1);
  });

  it('rejects oracle_skill mode when skillId is missing', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'oracle_skill',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/trial.json',
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('invalid_skill_mode');
    expect(state.trials.length).toBe(0);
    expect(state.scores.length).toBe(0);
  });

  it('applies safety penalties for forbidden commands in library_selection mode', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'library_selection',
          agent: 'codex',
          skillId: 'skill-ci-security-hardening',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/trial.json',
          events: [{ type: 'command', command: 'rm -rf /', exitCode: 0 }],
          checks: {
            deterministic: { passed: 1, total: 1 },
            safety: { violations: ['unsafe intent'] },
            metrics: { durationMs: 1200, commandCount: 1, toolCallCount: 0, costUnits: 0 },
          },
        }),
      }),
      env,
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      scoring?: {
        safetyScore?: number;
        forbiddenCommands?: string[];
      };
    };

    expect((payload.scoring?.safetyScore ?? 100) < 70).toBe(true);
    expect(payload.scoring?.forbiddenCommands).toEqual(expect.arrayContaining(['rm -rf /']));
    expect(state.trials.length).toBe(1);
    expect(state.scores.length).toBe(1);
  });

  it('rejects artifact paths containing blocked synthetic markers', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'baseline',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-synthetic/codex/trial.json',
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('blocked_artifact_markers');
    expect(state.runs.length).toBe(0);
    expect(state.trials.length).toBe(0);
  });

  it('normalizes skill slug input to canonical skill id', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'oracle_skill',
          skillId: 'ci-security-hardening',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/trial.json',
          checks: {
            deterministic: { passed: 1, total: 1 },
          },
        }),
      }),
      env,
    );

    expect(response.status).toBe(201);
    expect(state.trials.length).toBe(1);
    expect(state.trials[0]?.skillId).toBe('skill-ci-security-hardening');
  });

  it('records comparable baseline vs oracle_skill trials with mode-specific linkage and score deltas', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const baselineResponse = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          runId: 'bench-run-baseline-vs-oracle',
          evaluationMode: 'baseline',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/baseline.json',
          checks: {
            deterministic: { passed: 0, failed: 1, total: 1 },
            safety: { violations: ['policy violation'] },
            metrics: { durationMs: 1500, commandCount: 2, toolCallCount: 1, costUnits: 1 },
          },
        }),
      }),
      env,
    );
    expect(baselineResponse.status).toBe(201);

    const oracleResponse = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          runId: 'bench-run-baseline-vs-oracle',
          evaluationMode: 'oracle_skill',
          skillId: 'skill-ci-security-hardening',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/oracle.json',
          checks: {
            deterministic: { passed: 1, failed: 0, total: 1 },
            safety: { violations: [] },
            metrics: { durationMs: 900, commandCount: 1, toolCallCount: 0, costUnits: 0 },
          },
        }),
      }),
      env,
    );
    expect(oracleResponse.status).toBe(201);

    expect(state.trials).toHaveLength(2);
    const baselineTrial = state.trials.find((trial) => trial.evaluationMode === 'baseline');
    const oracleTrial = state.trials.find((trial) => trial.evaluationMode === 'oracle_skill');
    expect(baselineTrial?.skillId ?? null).toBeNull();
    expect(oracleTrial?.skillId).toBe('skill-ci-security-hardening');
    expect(baselineTrial?.runId).toBe('bench-run-baseline-vs-oracle');
    expect(oracleTrial?.runId).toBe('bench-run-baseline-vs-oracle');

    const baselineScore = state.scores.find((score) => score.trialId === baselineTrial?.id);
    const oracleScore = state.scores.find((score) => score.trialId === oracleTrial?.id);
    expect(baselineScore).toBeDefined();
    expect(oracleScore).toBeDefined();
    expect((oracleScore?.deterministicScore ?? 0) > (baselineScore?.deterministicScore ?? 0)).toBe(true);
    expect((oracleScore?.overallScore ?? 0) > (baselineScore?.overallScore ?? 0)).toBe(true);
    expect((oracleScore?.successRate ?? 0) > (baselineScore?.successRate ?? 0)).toBe(true);
  });

  it('binds trials/trial_scores inserts with placeholder counts that match bound values', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'oracle_skill',
          skillId: 'skill-ci-security-hardening',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/trial.json',
          checks: {
            deterministic: { passed: 1, total: 1 },
          },
        }),
      }),
      env,
    );

    expect(response.status).toBe(201);

    const trialInsert = state.bindings.find((entry) => entry.sql.includes('INSERT INTO trials'));
    const trialScoreInsert = state.bindings.find((entry) => entry.sql.includes('INSERT INTO trial_scores'));
    expect(trialInsert).toBeDefined();
    expect(trialScoreInsert).toBeDefined();
    expect(trialInsert?.placeholders).toBe(trialInsert?.bound);
    expect(trialScoreInsert?.placeholders).toBe(trialScoreInsert?.bound);
  });

  it('recovers from run insert race when unique constraint is hit for an already-created run', async () => {
    const { db, state } = createTrialExecutionDbMock({ failFirstRunInsertWithConstraint: true });
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'baseline',
          agent: 'codex',
          runId: 'bench-race-proof',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/race-proof.json',
          checks: { deterministic: { passed: 1, total: 1 } },
        }),
      }),
      env,
    );

    expect(response.status).toBe(201);
    expect(state.runs.length).toBe(1);
    expect(state.trials.length).toBe(1);
    expect(state.trials[0]?.runId).toBe('bench-race-proof');
  });

  it('rejects oversized event payload bodies', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'baseline',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/payload-too-large.json',
          events: [
            {
              type: 'status',
              message: 'x'.repeat(20_000),
            },
          ],
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('event_payload_too_large');
    expect(state.trials.length).toBe(0);
  });

  it('does not persist completed_at for pending or running run/trial states', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    for (const status of ['pending', 'running'] as const) {
      const response = await runFetch(
        new Request('https://skill.justevery.com/api/skills/trials/execute', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer trial-exec-token-123456',
          },
          body: JSON.stringify({
            benchmarkCaseId: 'benchmark-case-custom-task-01',
            runId: `bench-status-${status}`,
            evaluationMode: 'baseline',
            status,
            agent: 'codex',
            artifactPath: `benchmarks/runs/2026-02-16-daytona/codex/${status}.json`,
          }),
        }),
        env,
      );

      expect(response.status).toBe(201);
    }

    const runningRuns = state.runs.filter((run) => run.id === 'bench-status-pending' || run.id === 'bench-status-running');
    expect(runningRuns).toHaveLength(2);
    for (const run of runningRuns) {
      expect(run.status).toBe('running');
      expect(run.completedAt).toBeNull();
    }

    const nonTerminalTrials = state.trials.filter((trial) => trial.status === 'pending' || trial.status === 'running');
    expect(nonTerminalTrials).toHaveLength(2);
    for (const trial of nonTerminalTrials) {
      expect(trial.completedAt).toBeNull();
    }
  });

  it('orchestrates containerized baseline/oracle/library trials and returns executable comparison deltas', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db, 'trial-exec-token-123456', {
      orchestratorUrl: 'https://orchestrator.example/v1/trials',
      orchestratorToken: 'orchestrator-token-123456',
    });

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { evaluationMode?: string };
      const mode = body.evaluationMode;
      if (mode === 'baseline') {
        return new Response(JSON.stringify({
          status: 'completed',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/baseline.json',
          checks: {
            deterministic: { passed: 0, failed: 1, total: 1 },
            safety: { violations: ['baseline violation'] },
            metrics: { durationMs: 1800, commandCount: 2, toolCallCount: 1, costUnits: 1 },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (mode === 'oracle_skill') {
        return new Response(JSON.stringify({
          status: 'completed',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/oracle.json',
          checks: {
            deterministic: { passed: 1, failed: 0, total: 1 },
            safety: { violations: [] },
            metrics: { durationMs: 900, commandCount: 1, toolCallCount: 0, costUnits: 0 },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (mode === 'library_selection') {
        return new Response(JSON.stringify({
          status: 'completed',
          skillId: 'skill-ci-security-hardening',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/library.json',
          checks: {
            deterministic: { passed: 1, failed: 0, total: 1 },
            safety: { violations: [] },
            metrics: { durationMs: 1000, commandCount: 1, toolCallCount: 1, costUnits: 0 },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'unexpected_mode' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await runFetch(
        new Request('https://skill.justevery.com/api/skills/trials/orchestrate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer trial-exec-token-123456',
          },
          body: JSON.stringify({
            benchmarkCaseId: 'benchmark-case-custom-task-01',
            oracleSkillId: 'ci-security-hardening',
            agent: 'codex',
            runId: 'bench-orchestrated-comparison',
          }),
        }),
        env,
      );

      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        runId?: string;
        modesExecuted?: string[];
        trials?: Array<{ mode?: string; trial?: { runId?: string } }>;
        comparison?: {
          deltas?: {
            oracleSkillVsBaseline?: { overallScoreDelta?: number } | null;
            librarySelectionVsBaseline?: { overallScoreDelta?: number } | null;
          };
        };
      };

      expect(payload.runId).toBe('bench-orchestrated-comparison');
      expect(payload.modesExecuted).toEqual(['baseline', 'oracle_skill', 'library_selection']);
      expect(payload.trials?.length).toBe(3);
      expect(payload.comparison?.deltas?.oracleSkillVsBaseline?.overallScoreDelta).toBeGreaterThan(0);
      expect(payload.comparison?.deltas?.librarySelectionVsBaseline?.overallScoreDelta).toBeGreaterThan(0);

      expect(state.trials.length).toBe(3);
      expect(new Set(state.trials.map((trial) => trial.evaluationMode))).toEqual(new Set(['baseline', 'oracle_skill', 'library_selection']));
      expect(state.runs).toHaveLength(1);
      expect(state.runs[0]?.status).toBe('completed');
      expect(state.runs[0]?.completedAt).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('runs orchestration against a real local HTTP orchestrator and persists comparable mode results', async () => {
    const { db, state } = createTrialExecutionDbMock();

    const server = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/trials/execute') {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      const auth = req.headers.authorization ?? '';
      if (auth !== 'Bearer orchestrator-token-123456') {
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }

      const body = await new Promise<string>((resolve) => {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
          data += chunk;
        });
        req.on('end', () => resolve(data));
      });

      const parsed = JSON.parse(body) as { evaluationMode?: string };
      const mode = parsed.evaluationMode;
      const payloadByMode: Record<string, unknown> = {
        baseline: {
          status: 'completed',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/baseline-real.json',
          checks: {
            deterministic: { passed: 0, failed: 1, total: 1 },
            safety: { violations: ['baseline issue'] },
            metrics: { durationMs: 1700, commandCount: 2, toolCallCount: 1, costUnits: 1 },
          },
        },
        oracle_skill: {
          status: 'completed',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/oracle-real.json',
          checks: {
            deterministic: { passed: 1, failed: 0, total: 1 },
            safety: { violations: [] },
            metrics: { durationMs: 900, commandCount: 1, toolCallCount: 0, costUnits: 0 },
          },
        },
        library_selection: {
          status: 'completed',
          skillId: 'skill-ci-security-hardening',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/library-real.json',
          checks: {
            deterministic: { passed: 1, failed: 0, total: 1 },
            safety: { violations: [] },
            metrics: { durationMs: 1000, commandCount: 1, toolCallCount: 1, costUnits: 0 },
          },
        },
      };

      const payload = payloadByMode[mode ?? ''];
      if (!payload) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'bad_mode' }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(payload));
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const { port } = server.address() as AddressInfo;
    const env = createTrialEnv(db, 'trial-exec-token-123456', {
      orchestratorUrl: `http://127.0.0.1:${port}/v1/trials`,
      orchestratorToken: 'orchestrator-token-123456',
    });

    try {
      const response = await runFetch(
        new Request('https://skill.justevery.com/api/skills/trials/orchestrate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer trial-exec-token-123456',
          },
          body: JSON.stringify({
            benchmarkCaseId: 'benchmark-case-custom-task-01',
            oracleSkillId: 'ci-security-hardening',
            agent: 'codex',
            runId: 'bench-orchestrated-live-http',
          }),
        }),
        env,
      );

      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        runId?: string;
        trials?: Array<{ mode?: string }>;
        comparison?: {
          deltas?: {
            oracleSkillVsBaseline?: { overallScoreDelta?: number } | null;
            librarySelectionVsBaseline?: { overallScoreDelta?: number } | null;
          };
        };
      };

      expect(payload.runId).toBe('bench-orchestrated-live-http');
      expect(payload.trials?.length).toBe(3);
      expect(payload.comparison?.deltas?.oracleSkillVsBaseline?.overallScoreDelta).toBeGreaterThan(0);
      expect(payload.comparison?.deltas?.librarySelectionVsBaseline?.overallScoreDelta).toBeGreaterThan(0);

      expect(state.trials.length).toBe(3);
      expect(state.scores.length).toBe(3);
      expect(state.events.length).toBe(0);
      expect(state.runs).toHaveLength(1);
      expect(state.runs[0]?.status).toBe('completed');
      expect(state.runs[0]?.completedAt).not.toBeNull();
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('inspects persisted run trials/scores and returns mode deltas for smoke verification', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const runId = 'bench-inspect-proof';
    state.runs.push({
      id: runId,
      mode: 'daytona',
      status: 'completed',
      completedAt: '2026-02-16T00:10:00.000Z',
      artifactPath: 'benchmarks/runs/inspect-proof',
      notes: 'inspect proof run',
    });
    state.trials.push(
      { id: 'trial-inspect-baseline', runId, skillId: null, evaluationMode: 'baseline', status: 'completed', completedAt: '2026-02-16T00:10:00.000Z' },
      { id: 'trial-inspect-oracle', runId, skillId: 'skill-ci-security-hardening', evaluationMode: 'oracle_skill', status: 'completed', completedAt: '2026-02-16T00:10:00.000Z' },
      { id: 'trial-inspect-library', runId, skillId: 'skill-ci-security-hardening', evaluationMode: 'library_selection', status: 'completed', completedAt: '2026-02-16T00:10:00.000Z' },
    );
    state.scores.push(
      { trialId: 'trial-inspect-baseline', overallScore: 70, successRate: 0.7, deterministicScore: 70, safetyScore: 80, efficiencyScore: 75 },
      { trialId: 'trial-inspect-oracle', overallScore: 95, successRate: 0.95, deterministicScore: 95, safetyScore: 96, efficiencyScore: 95 },
      { trialId: 'trial-inspect-library', overallScore: 90, successRate: 0.9, deterministicScore: 90, safetyScore: 92, efficiencyScore: 91 },
    );

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/inspect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({ runId }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      trialCount?: number;
      scoreCount?: number;
      deltas?: {
        oracleSkillVsBaseline?: { overallScoreDelta?: number };
        librarySelectionVsBaseline?: { overallScoreDelta?: number };
      };
    };

    expect(payload.trialCount).toBe(3);
    expect(payload.scoreCount).toBe(3);
    expect(payload.deltas?.oracleSkillVsBaseline?.overallScoreDelta).toBe(25);
    expect(payload.deltas?.librarySelectionVsBaseline?.overallScoreDelta).toBe(20);
  });

  it('requires auth token for trial inspect', async () => {
    const { db } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/inspect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ runId: 'bench-inspect-proof' }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('trial_execute_unauthorized');
  });

  it('returns run_not_found for unknown inspect run id', async () => {
    const { db } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/inspect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({ runId: 'bench-missing' }),
      }),
      env,
    );

    expect(response.status).toBe(404);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('run_not_found');
  });

  it('returns run_trials_not_found when run exists without persisted trials', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    state.runs.push({
      id: 'bench-empty-run',
      mode: 'daytona',
      status: 'completed',
      completedAt: '2026-02-16T00:10:00.000Z',
      artifactPath: 'benchmarks/runs/empty-run',
      notes: 'empty run',
    });

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/inspect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({ runId: 'bench-empty-run' }),
      }),
      env,
    );

    expect(response.status).toBe(404);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('run_trials_not_found');
  });

  it('fails orchestration when orchestrator config is missing', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/orchestrate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          oracleSkillId: 'ci-security-hardening',
          agent: 'codex',
        }),
      }),
      env,
    );

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('trial_orchestrator_not_configured');
    expect(state.trials.length).toBe(0);
  });

  it('rejects orchestration when a mode returns non-terminal status to preserve comparable persistence', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db, 'trial-exec-token-123456', {
      orchestratorUrl: 'https://orchestrator.example/v1/trials',
      orchestratorToken: 'orchestrator-token-123456',
    });

    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({
        status: 'running',
        artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/baseline.json',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await runFetch(
        new Request('https://skill.justevery.com/api/skills/trials/orchestrate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer trial-exec-token-123456',
          },
          body: JSON.stringify({
            benchmarkCaseId: 'benchmark-case-custom-task-01',
            oracleSkillId: 'ci-security-hardening',
            agent: 'codex',
            modes: ['baseline'],
          }),
        }),
        env,
      );

      expect(response.status).toBe(409);
      const payload = (await response.json()) as { error?: string };
      expect(payload.error).toBe('trial_orchestration_incomplete');
      expect(state.trials.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rolls back persisted writes when one orchestrated mode fails validation', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db, 'trial-exec-token-123456', {
      orchestratorUrl: 'https://orchestrator.example/v1/trials',
      orchestratorToken: 'orchestrator-token-123456',
    });

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { evaluationMode?: string };
      const mode = body.evaluationMode;
      if (mode === 'baseline') {
        return new Response(JSON.stringify({
          status: 'completed',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/baseline.json',
          checks: { deterministic: { passed: 1, total: 1 } },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (mode === 'oracle_skill') {
        return new Response(JSON.stringify({
          status: 'completed',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/oracle.json',
          checks: { deterministic: { passed: 1, total: 1 } },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        status: 'completed',
        skillId: 'skill-missing-in-db',
        artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/library.json',
        checks: { deterministic: { passed: 1, total: 1 } },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await runFetch(
        new Request('https://skill.justevery.com/api/skills/trials/orchestrate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer trial-exec-token-123456',
          },
          body: JSON.stringify({
            benchmarkCaseId: 'benchmark-case-custom-task-01',
            oracleSkillId: 'ci-security-hardening',
            agent: 'codex',
          }),
        }),
        env,
      );

      expect(response.status).toBe(404);
      const payload = (await response.json()) as { error?: string };
      expect(payload.error).toBe('trial_orchestration_persist_failed');
      expect(state.trials.length).toBe(0);
      expect(state.runs.length).toBe(0);
      expect(state.scores.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects orchestration when benchmark case container image is not a pinned digest contract', async () => {
    const { db, state } = createTrialExecutionDbMock({
      benchmarkContainerImage: 'docker.io/library/alpine:3.20',
    });
    const env = createTrialEnv(db, 'trial-exec-token-123456', {
      orchestratorUrl: 'https://orchestrator.example/v1/trials',
      orchestratorToken: 'orchestrator-token-123456',
    });

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await runFetch(
        new Request('https://skill.justevery.com/api/skills/trials/orchestrate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer trial-exec-token-123456',
          },
          body: JSON.stringify({
            benchmarkCaseId: 'benchmark-case-custom-task-01',
            oracleSkillId: 'ci-security-hardening',
            agent: 'codex',
          }),
        }),
        env,
      );

      expect(response.status).toBe(409);
      const payload = (await response.json()) as { error?: string };
      expect(payload.error).toBe('invalid_container_contract');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(state.trials.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('surfaces orchestrator network failures as trial_orchestration_failed', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db, 'trial-exec-token-123456', {
      orchestratorUrl: 'https://orchestrator.example/v1/trials',
      orchestratorToken: 'orchestrator-token-123456',
    });

    const fetchMock = vi.fn(async () => {
      throw new Error('dial tcp timeout');
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await runFetch(
        new Request('https://skill.justevery.com/api/skills/trials/orchestrate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer trial-exec-token-123456',
          },
          body: JSON.stringify({
            benchmarkCaseId: 'benchmark-case-custom-task-01',
            oracleSkillId: 'ci-security-hardening',
            agent: 'codex',
            modes: ['baseline'],
          }),
        }),
        env,
      );

      expect(response.status).toBe(502);
      const payload = (await response.json()) as { error?: string };
      expect(payload.error).toBe('trial_orchestration_failed');
      expect(state.trials.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects non-json orchestrator responses', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db, 'trial-exec-token-123456', {
      orchestratorUrl: 'https://orchestrator.example/v1/trials',
      orchestratorToken: 'orchestrator-token-123456',
    });

    const fetchMock = vi.fn(async () => {
      return new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await runFetch(
        new Request('https://skill.justevery.com/api/skills/trials/orchestrate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer trial-exec-token-123456',
          },
          body: JSON.stringify({
            benchmarkCaseId: 'benchmark-case-custom-task-01',
            oracleSkillId: 'ci-security-hardening',
            agent: 'codex',
            modes: ['baseline'],
          }),
        }),
        env,
      );

      expect(response.status).toBe(502);
      const payload = (await response.json()) as { error?: string };
      expect(payload.error).toBe('trial_orchestration_failed');
      expect(state.trials.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('marks run as failed when any orchestrated mode persists with failed status', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db, 'trial-exec-token-123456', {
      orchestratorUrl: 'https://orchestrator.example/v1/trials',
      orchestratorToken: 'orchestrator-token-123456',
    });

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { evaluationMode?: string };
      const mode = body.evaluationMode;
      if (mode === 'baseline') {
        return new Response(JSON.stringify({
          status: 'completed',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/baseline.json',
          checks: { deterministic: { passed: 1, total: 1 } },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (mode === 'oracle_skill') {
        return new Response(JSON.stringify({
          status: 'failed',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/oracle.json',
          checks: { deterministic: { passed: 0, failed: 1, total: 1 } },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        status: 'completed',
        skillId: 'skill-ci-security-hardening',
        artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/library.json',
        checks: { deterministic: { passed: 1, total: 1 } },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await runFetch(
        new Request('https://skill.justevery.com/api/skills/trials/orchestrate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer trial-exec-token-123456',
          },
          body: JSON.stringify({
            benchmarkCaseId: 'benchmark-case-custom-task-01',
            oracleSkillId: 'ci-security-hardening',
            agent: 'codex',
          }),
        }),
        env,
      );

      expect(response.status).toBe(201);
      const payload = (await response.json()) as {
        comparison?: {
          deltas?: {
            oracleSkillVsBaseline?: unknown;
          };
        };
      };

      expect(state.runs).toHaveLength(1);
      expect(state.runs[0]?.status).toBe('failed');
      expect(state.runs[0]?.completedAt).not.toBeNull();
      expect(payload.comparison?.deltas?.oracleSkillVsBaseline ?? null).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects writes when reusing non-daytona run ids', async () => {
    const { db, state } = createTrialExecutionDbMock({
      existingRun: {
        id: 'bench-existing-fallback',
        mode: 'fallback',
        artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex',
        notes: 'legacy mode run',
      },
    });
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          runId: 'bench-existing-fallback',
          evaluationMode: 'baseline',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/trial.json',
        }),
      }),
      env,
    );

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('non_real_benchmark_mode');
    expect(state.trials.length).toBe(0);
  });

  it('blocks encoded marker bypasses in artifact paths', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer trial-exec-token-123456',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'baseline',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-%73%79%6E%74%68%65%74%69%63/codex/trial.json',
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('blocked_artifact_markers');
    expect(state.trials.length).toBe(0);
  });

  it('requires auth token for trial execution writes', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db);

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'baseline',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/trial.json',
        }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('trial_execute_unauthorized');
    expect(state.trials.length).toBe(0);
  });

  it('rejects trial execution when server token is not configured', async () => {
    const { db, state } = createTrialExecutionDbMock();
    const env = createTrialEnv(db, 'short');

    const response = await runFetch(
      new Request('https://skill.justevery.com/api/skills/trials/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer short',
        },
        body: JSON.stringify({
          benchmarkCaseId: 'benchmark-case-custom-task-01',
          evaluationMode: 'baseline',
          agent: 'codex',
          artifactPath: 'benchmarks/runs/2026-02-16-daytona/codex/trial.json',
        }),
      }),
      env,
    );

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('trial_execute_not_configured');
    expect(state.trials.length).toBe(0);
  });
});
