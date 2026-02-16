#!/usr/bin/env node

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const MODES = ['baseline', 'oracle_skill', 'library_selection'];

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function normalizeMode(rawMode) {
  return rawMode === 'live' ? 'live' : 'local-proof';
}

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getRequiredConfig(mode) {
  const token = readArg('--token', process.env.SKILLS_TRIAL_EXECUTE_TOKEN ?? '').trim();
  if (token.length < 16) {
    throw new Error('SKILLS_TRIAL_EXECUTE_TOKEN (or --token) must be set with at least 16 characters.');
  }

  const benchmarkCaseId = readArg(
    '--benchmark-case-id',
    process.env.SKILLS_TRIAL_SMOKE_BENCHMARK_CASE_ID ?? 'benchmark-case-custom-task-01',
  ).trim();
  if (!benchmarkCaseId) {
    throw new Error('SKILLS_TRIAL_SMOKE_BENCHMARK_CASE_ID (or --benchmark-case-id) is required.');
  }

  const oracleSkillId = readArg(
    '--oracle-skill-id',
    process.env.SKILLS_TRIAL_SMOKE_ORACLE_SKILL_ID ?? 'ci-security-hardening',
  ).trim();
  if (!oracleSkillId) {
    throw new Error('SKILLS_TRIAL_SMOKE_ORACLE_SKILL_ID (or --oracle-skill-id) is required.');
  }

  const agent = readArg('--agent', process.env.SKILLS_TRIAL_SMOKE_AGENT ?? 'codex').trim().toLowerCase();
  if (!['codex', 'claude', 'gemini'].includes(agent)) {
    throw new Error('agent must be one of: codex, claude, gemini.');
  }

  if (mode === 'live') {
    const baseUrlRaw = readArg('--base-url', process.env.PROJECT_DOMAIN ?? '').trim();
    if (!baseUrlRaw) {
      throw new Error('PROJECT_DOMAIN (or --base-url) is required in live mode.');
    }
    let parsed;
    try {
      parsed = new URL(baseUrlRaw);
    } catch {
      throw new Error(`Invalid base URL: ${baseUrlRaw}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Unsupported base URL protocol: ${parsed.protocol}`);
    }
    return {
      token,
      benchmarkCaseId,
      oracleSkillId,
      agent,
      baseUrl: trimTrailingSlash(parsed.toString()),
    };
  }

  return {
    token,
    benchmarkCaseId,
    oracleSkillId,
    agent,
    baseUrl: '',
  };
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { response, body };
}

function assert(condition, message, details = '') {
  if (!condition) {
    throw new Error(details ? `${message}: ${details}` : message);
  }
}

function assertSmokeShape(orchestrate, inspect) {
  const orchestrateModes = new Set((orchestrate.modesExecuted ?? []).map((mode) => String(mode)));
  const inspectModes = new Set((inspect.trials ?? []).map((trial) => String(trial.mode)));

  assert(orchestrateModes.size === 3, 'Expected exactly 3 orchestrated modes');
  assert(inspectModes.size === 3, 'Expected exactly 3 persisted trial modes in inspect output');

  for (const mode of MODES) {
    assert(orchestrateModes.has(mode), `Missing orchestrated mode '${mode}'`);
    assert(inspectModes.has(mode), `Missing persisted inspect mode '${mode}'`);
  }

  assert(Number(inspect.trialCount) >= 3, 'Expected at least 3 persisted trials');
  assert(Number(inspect.scoreCount) >= 3, 'Expected at least 3 persisted trial scores');

  const trialByMode = new Map((inspect.trials ?? []).map((trial) => [String(trial.mode), trial]));
  for (const mode of MODES) {
    const trial = trialByMode.get(mode);
    assert(Boolean(trial), `Inspect payload missing trial for mode '${mode}'`);
    assert(Boolean(trial?.score), `Inspect payload missing score for mode '${mode}'`);
  }

  const oracleDelta = inspect?.deltas?.oracleSkillVsBaseline?.overallScoreDelta;
  const libraryDelta = inspect?.deltas?.librarySelectionVsBaseline?.overallScoreDelta;
  assert(typeof oracleDelta === 'number', 'oracleSkillVsBaseline.overallScoreDelta must be numeric');
  assert(typeof libraryDelta === 'number', 'librarySelectionVsBaseline.overallScoreDelta must be numeric');
  assert(oracleDelta > 0, 'Expected oracle_skill to outperform baseline');
  assert(libraryDelta > 0, 'Expected library_selection to outperform baseline');
}

async function runSmokeAgainstBase(baseUrl, config) {
  const runId = `bench-smoke-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const commonHeaders = {
    authorization: `Bearer ${config.token}`,
    'content-type': 'application/json',
  };

  console.log(`[skills-smoke] POST ${baseUrl}/api/skills/trials/orchestrate (runId=${runId})`);
  const orchestrateResult = await jsonRequest(`${baseUrl}/api/skills/trials/orchestrate`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      benchmarkCaseId: config.benchmarkCaseId,
      oracleSkillId: config.oracleSkillId,
      agent: config.agent,
      runId,
    }),
  });

  assert(
    orchestrateResult.response.status === 201,
    'Orchestrate request failed',
    `status=${orchestrateResult.response.status} body=${JSON.stringify(orchestrateResult.body)}`,
  );

  const resolvedRunId = String(orchestrateResult.body?.runId ?? runId);
  console.log(`[skills-smoke] POST ${baseUrl}/api/skills/trials/inspect (runId=${resolvedRunId})`);
  const inspectResult = await jsonRequest(`${baseUrl}/api/skills/trials/inspect`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({ runId: resolvedRunId }),
  });

  assert(
    inspectResult.response.status === 200,
    'Inspect request failed',
    `status=${inspectResult.response.status} body=${JSON.stringify(inspectResult.body)}`,
  );

  assertSmokeShape(orchestrateResult.body ?? {}, inspectResult.body ?? {});

  const oracleDelta = inspectResult.body?.deltas?.oracleSkillVsBaseline?.overallScoreDelta;
  const libraryDelta = inspectResult.body?.deltas?.librarySelectionVsBaseline?.overallScoreDelta;
  console.log(
    `[skills-smoke] PASS run=${resolvedRunId} modes=3 scores=${inspectResult.body?.scoreCount} oracleDelta=${oracleDelta} libraryDelta=${libraryDelta}`,
  );
}

async function startLocalProofServer(token) {
  const state = new Map();
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }
    const authHeader = req.headers.authorization ?? '';
    if (authHeader !== `Bearer ${token}`) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'trial_execute_unauthorized' }));
      return;
    }

    const bodyText = await new Promise((resolve) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => resolve(body));
    });

    let body;
    try {
      body = JSON.parse(String(bodyText || '{}'));
    } catch {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'invalid_json' }));
      return;
    }

    if (requestUrl.pathname === '/api/skills/trials/orchestrate') {
      const runId = String(body.runId ?? `bench-local-proof-${Date.now()}`);
      state.set(runId, {
        run: {
          id: runId,
          mode: 'daytona',
          status: 'completed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        trials: [
          {
            id: `${runId}-baseline`,
            mode: 'baseline',
            status: 'completed',
            score: {
              overallScore: 70,
              successRate: 0.7,
              deterministicScore: 70,
              safetyScore: 80,
            },
          },
          {
            id: `${runId}-oracle`,
            mode: 'oracle_skill',
            status: 'completed',
            score: {
              overallScore: 95,
              successRate: 0.95,
              deterministicScore: 95,
              safetyScore: 96,
            },
          },
          {
            id: `${runId}-library`,
            mode: 'library_selection',
            status: 'completed',
            score: {
              overallScore: 90,
              successRate: 0.9,
              deterministicScore: 90,
              safetyScore: 92,
            },
          },
        ],
      });

      res.statusCode = 201;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          source: 'local-proof',
          runId,
          modesExecuted: MODES,
          trials: MODES.map((mode) => ({ mode, trial: { runId } })),
          comparison: {
            deltas: {
              oracleSkillVsBaseline: { overallScoreDelta: 25 },
              librarySelectionVsBaseline: { overallScoreDelta: 20 },
            },
          },
        }),
      );
      return;
    }

    if (requestUrl.pathname === '/api/skills/trials/inspect') {
      const runId = String(body.runId ?? '');
      const snapshot = state.get(runId);
      if (!snapshot) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'run_not_found' }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          source: 'local-proof',
          run: snapshot.run,
          trialCount: 3,
          scoreCount: 3,
          trials: snapshot.trials,
          deltas: {
            oracleSkillVsBaseline: { overallScoreDelta: 25 },
            librarySelectionVsBaseline: { overallScoreDelta: 20 },
          },
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  const address = await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(server.address());
    });
  });

  const port = Number(address.port);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

async function main() {
  const mode = normalizeMode(readArg('--mode', 'local-proof'));
  const config = getRequiredConfig(mode);

  if (mode === 'live') {
    console.log(`[skills-smoke] starting live smoke against ${config.baseUrl}`);
    await runSmokeAgainstBase(config.baseUrl, config);
    return;
  }

  console.log('[skills-smoke] starting local-proof smoke (self-hosted stub API)');
  const local = await startLocalProofServer(config.token);
  try {
    await runSmokeAgainstBase(local.baseUrl, config);
  } finally {
    await local.close();
  }
}

main().catch((error) => {
  console.error('[skills-smoke] FAILED', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

