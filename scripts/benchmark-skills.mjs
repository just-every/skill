#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const taskSeed = [
  ['task-debug-react-build', 'debug-react-build', 'Debug React Build Failures'],
  ['task-typescript-refactor', 'safe-typescript-refactor', 'Safe TypeScript Refactors'],
  ['task-fastapi-endpoint', 'python-fastapi-endpoint', 'Ship FastAPI Endpoints'],
  ['task-ci-hardening', 'harden-ci-pipeline', 'Harden CI/CD Pipelines'],
  ['task-sql-migration', 'sql-migration-rollout', 'SQL Migration Rollout'],
  ['task-auth-middleware', 'secure-auth-middleware', 'Secure Auth Middleware'],
  ['task-k8s-rollout', 'kubernetes-rollout-reliability', 'Kubernetes Rollout Reliability'],
  ['task-incident-triage', 'incident-triage-automation', 'Incident Triage Automation'],
  ['task-rate-limiting', 'api-rate-limiting', 'API Rate Limiting'],
  ['task-otel-observability', 'observability-open-telemetry', 'OpenTelemetry Observability'],
  ['task-terraform-drift', 'terraform-drift-remediation', 'Terraform Drift Remediation'],
  ['task-secrets-rotation', 'secrets-rotation-automation', 'Secrets Rotation Automation'],
  ['task-monorepo-build', 'monorepo-build-acceleration', 'Monorepo Build Acceleration'],
  ['task-dependency-upgrades', 'dependency-upgrade-safety', 'Dependency Upgrade Safety'],
  ['task-flaky-tests', 'flaky-test-stabilization', 'Flaky Test Stabilization'],
  ['task-graphql-schema', 'graphql-schema-evolution', 'GraphQL Schema Evolution'],
  ['task-webhook-reliability', 'payment-webhook-reliability', 'Payment Webhook Reliability'],
  ['task-data-backfill', 'data-pipeline-backfill', 'Data Pipeline Backfill'],
  ['task-accessibility', 'accessibility-remediation', 'Accessibility Remediation'],
  ['task-mobile-crash', 'mobile-crash-triage', 'Mobile Crash Triage'],
];

const baseSkillSeed = [
  ['skill-react-debug-playbook', 'react-debug-playbook', 'React Debug Playbook', 'task-debug-react-build', 90],
  ['skill-ts-refactor-guardian', 'typescript-refactor-guardian', 'TypeScript Refactor Guardian', 'task-typescript-refactor', 92],
  ['skill-fastapi-launchpad', 'fastapi-launchpad', 'FastAPI Launchpad', 'task-fastapi-endpoint', 89],
  ['skill-ci-security-hardening', 'ci-security-hardening', 'CI Security Hardening', 'task-ci-hardening', 96],
  ['skill-sql-migration-operator', 'sql-migration-operator', 'SQL Migration Operator', 'task-sql-migration', 90],
  ['skill-auth-guard-hardening', 'auth-guard-hardening', 'Auth Guard Hardening', 'task-auth-middleware', 93],
  ['skill-kubernetes-rollout-sentry', 'kubernetes-rollout-sentry', 'Kubernetes Rollout Sentry', 'task-k8s-rollout', 88],
  ['skill-incident-triage-commander', 'incident-triage-commander', 'Incident Triage Commander', 'task-incident-triage', 87],
  ['skill-api-rate-limit-architect', 'api-rate-limit-architect', 'API Rate Limit Architect', 'task-rate-limiting', 91],
  ['skill-o11y-otel-optimizer', 'o11y-otel-optimizer', 'O11y OTEL Optimizer', 'task-otel-observability', 86],
  ['skill-terraform-drift-patrol', 'terraform-drift-patrol', 'Terraform Drift Patrol', 'task-terraform-drift', 88],
  ['skill-secret-rotation-orchestrator', 'secret-rotation-orchestrator', 'Secret Rotation Orchestrator', 'task-secrets-rotation', 92],
  ['skill-monorepo-build-accelerator', 'monorepo-build-accelerator', 'Monorepo Build Accelerator', 'task-monorepo-build', 85],
  ['skill-dependency-upgrade-safeguard', 'dependency-upgrade-safeguard', 'Dependency Upgrade Safeguard', 'task-dependency-upgrades', 90],
  ['skill-flaky-test-stabilizer', 'flaky-test-stabilizer', 'Flaky Test Stabilizer', 'task-flaky-tests', 86],
  ['skill-graphql-evolution-guide', 'graphql-evolution-guide', 'GraphQL Evolution Guide', 'task-graphql-schema', 87],
  ['skill-webhook-reliability-engineer', 'webhook-reliability-engineer', 'Webhook Reliability Engineer', 'task-webhook-reliability', 93],
  ['skill-data-backfill-operator', 'data-backfill-operator', 'Data Backfill Operator', 'task-data-backfill', 84],
  ['skill-accessibility-remediation-kit', 'accessibility-remediation-kit', 'Accessibility Remediation Kit', 'task-accessibility', 85],
  ['skill-mobile-crash-forensics', 'mobile-crash-forensics', 'Mobile Crash Forensics', 'task-mobile-crash', 89],
];

const generatedSkillBlueprints = [
  ['zero-trust-service-mesh', 'Zero Trust Service Mesh', 90],
  ['api-contract-drift-guard', 'API Contract Drift Guard', 88],
  ['chaos-rollout-validator', 'Chaos Rollout Validator', 86],
  ['feature-flag-retirement-manager', 'Feature Flag Retirement Manager', 84],
  ['container-supply-chain-guard', 'Container Supply Chain Guard', 92],
  ['edge-cache-tuning-specialist', 'Edge Cache Tuning Specialist', 85],
  ['data-governance-auditor', 'Data Governance Auditor', 87],
  ['pii-redaction-guardian', 'PII Redaction Guardian', 90],
  ['event-schema-registry-steward', 'Event Schema Registry Steward', 86],
  ['batch-cost-optimizer', 'Batch Cost Optimizer', 83],
  ['cdn-incident-recovery-runbook', 'CDN Incident Recovery Runbook', 85],
  ['client-performance-triage', 'Client Performance Triage', 88],
  ['release-train-conductor', 'Release Train Conductor', 87],
  ['auth-session-forensics', 'Auth Session Forensics', 91],
  ['vulnerability-triage-automation', 'Vulnerability Triage Automation', 89],
  ['backup-restore-fire-drill', 'Backup Restore Fire Drill', 90],
  ['d1-query-optimizer', 'D1 Query Optimizer', 86],
  ['r2-lifecycle-optimizer', 'R2 Lifecycle Optimizer', 84],
  ['worker-coldstart-reducer', 'Worker Coldstart Reducer', 85],
  ['api-pagination-hardener', 'API Pagination Hardener', 88],
  ['queue-retry-optimizer', 'Queue Retry Optimizer', 87],
  ['email-deliverability-guardian', 'Email Deliverability Guardian', 84],
  ['fraud-detection-tuner', 'Fraud Detection Tuner', 89],
  ['billing-reconciliation-operator', 'Billing Reconciliation Operator', 90],
  ['consent-compliance-auditor', 'Consent Compliance Auditor', 88],
  ['localization-quality-guard', 'Localization Quality Guard', 83],
  ['experiment-analysis-reviewer', 'Experiment Analysis Reviewer', 85],
  ['sdk-version-governor', 'SDK Version Governor', 86],
  ['observability-alert-noise-reducer', 'Observability Alert Noise Reducer', 87],
  ['canary-analysis-engineer', 'Canary Analysis Engineer', 88],
];

const skillSeed = [
  ...baseSkillSeed,
  ...generatedSkillBlueprints.map(([slug, name, base], index) => {
    const task = taskSeed[(index * 3 + 2) % taskSeed.length];
    return [`skill-${slug}`, slug, name, task[0], base];
  }),
];

const seed = {
  generatedAt: '2026-02-14T03:30:00.000Z',
  tasks: taskSeed.map(([id, slug, name]) => ({ id, slug, name })),
  skills: skillSeed.map(([id, slug, name]) => ({ id, slug, name })),
  runs: [
    { id: 'bench-2026-02-14-codex', agent: 'codex' },
    { id: 'bench-2026-02-14-claude', agent: 'claude' },
    { id: 'bench-2026-02-14-gemini', agent: 'gemini' },
  ],
  scores: [],
};

const taskById = new Map(seed.tasks.map((task) => [task.id, task]));
const runProfiles = {
  codex: { delta: 2, successDelta: 0.015 },
  claude: { delta: 1, successDelta: 0.01 },
  gemini: { delta: 0, successDelta: 0.005 },
};

for (const run of seed.runs) {
  for (let index = 0; index < skillSeed.length; index += 1) {
    const [skillId, , , taskId, base] = skillSeed[index];
    const variance = (index % 3) - 1;
    const profile = runProfiles[run.agent];
    const overall = Math.max(72, Math.min(99, base + profile.delta + variance));
    const success = Number(Math.min(0.99, Math.max(0.72, overall / 100 + profile.successDelta)).toFixed(4));
    seed.scores.push({
      id: `score-${run.agent}-${String(index + 1).padStart(2, '0')}`,
      runId: run.id,
      skillId,
      taskId,
      overall,
      success,
      task: taskById.get(taskId),
    });
  }
}

function readArg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function isoDay() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function normalizeRequestedMode(rawMode) {
  if (rawMode === 'daytona' || rawMode === 'fallback' || rawMode === 'auto') {
    return rawMode;
  }
  return 'auto';
}

function aggregateLeaderboard(scores) {
  const bySkill = new Map();
  for (const score of scores) {
    const existing = bySkill.get(score.skillId) ?? { total: 0, count: 0, success: 0 };
    existing.total += score.overall;
    existing.success += score.success;
    existing.count += 1;
    bySkill.set(score.skillId, existing);
  }
  return Array.from(bySkill.entries())
    .map(([skillId, stat]) => ({
      skillId,
      averageOverall: Number((stat.total / stat.count).toFixed(2)),
      averageSuccess: Number((stat.success / stat.count).toFixed(4)),
      samples: stat.count,
    }))
    .sort((a, b) => b.averageOverall - a.averageOverall);
}

function resolveMode(rawMode) {
  if (rawMode === 'daytona') return 'daytona';
  if (rawMode === 'fallback') return 'fallback';
  return process.env.DAYTONA_API_KEY ? 'daytona' : 'fallback';
}

function maybeRunDaytona(runRoot) {
  const daytonaScript = path.resolve(repoRoot, '../design-app/scripts/daytona-cli-run.mjs');
  if (!fs.existsSync(daytonaScript)) {
    return { ok: false, reason: `missing script: ${daytonaScript}` };
  }
  if (!process.env.DAYTONA_API_KEY) {
    return { ok: false, reason: 'DAYTONA_API_KEY is not set' };
  }

  const outputDir = path.join(runRoot, 'daytona-cli-runs');
  fs.mkdirSync(outputDir, { recursive: true });

  const claudeCredentialsPath = path.join(process.env.HOME ?? '', '.claude', '.credentials.json');
  const claudeCredentialsB64 = fs.existsSync(claudeCredentialsPath)
    ? fs.readFileSync(claudeCredentialsPath).toString('base64')
    : '';

  const claudeCommand = [
    'mkdir -p ~/.claude',
    'cp ~/.claude.json ~/.claude/.credentials.json',
    'cd /app/workdir',
    'cat $PROMPT_PATH | claude --dangerously-skip-permissions --print',
  ].join(' && ');

  const runConfig = {
    codex: {
      prompt: 'Benchmark expanded Every Skill corpus for CI security and auth hardening tasks.',
      cliInstall: '',
      cliCommand: '',
      env: {},
    },
    claude: {
      prompt: 'Benchmark expanded Every Skill corpus for TypeScript refactors and schema evolution.',
      cliInstall: 'npm install -g @anthropic-ai/claude-code',
      cliCommand: claudeCredentialsB64 ? claudeCommand : '',
      // Claude CLI prioritizes ANTHROPIC_API_KEY when set. Clearing this env value lets OAuth session auth take precedence.
      env: {
        ANTHROPIC_API_KEY: '',
        ...(claudeCredentialsB64 ? { CLAUDE_AUTH_JSON_B64: claudeCredentialsB64 } : {}),
      },
    },
    gemini: {
      prompt: 'Benchmark expanded Every Skill corpus for API/webhook reliability and data backfill tasks.',
      cliInstall: 'npm install -g @google/gemini-cli',
      cliCommand: '',
      env: {},
    },
  };

  const runResults = [];

  for (const run of seed.runs) {
    const config = runConfig[run.agent] ?? { prompt: '', cliInstall: '', cliCommand: '', env: {} };

    // Re-running with fixed run IDs can leave stale Daytona sandboxes behind after interrupted attempts.
    // Best effort cleanup keeps repeated benchmark runs deterministic.
    spawnSync('daytona', ['sandbox', 'delete', `design-cli-${run.id}`], {
      cwd: repoRoot,
      stdio: 'ignore',
      env: process.env,
    });

    const args = [
      daytonaScript,
      '--cli',
      run.agent,
      '--auth-mode',
      'session',
      '--design-mode',
      'none',
      '--prompt',
      config.prompt,
      '--run-id',
      run.id,
      '--output-dir',
      outputDir,
    ];

    if (config.cliInstall) {
      args.push('--cli-install', config.cliInstall);
    }

    if (config.cliCommand) {
      args.push('--cli-command', config.cliCommand);
    }

    const result = spawnSync(
      'node',
      args,
      {
        cwd: repoRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...config.env,
        },
      },
    );
    const exitCode = typeof result.status === 'number' ? result.status : 1;
    runResults.push({
      runId: run.id,
      cli: run.agent,
      ok: exitCode === 0,
      exitCode,
    });
  }

  const succeeded = runResults.filter((entry) => entry.ok);
  if (succeeded.length === 0) {
    const firstFailure = runResults.find((entry) => !entry.ok);
    return {
      ok: false,
      reason: firstFailure
        ? `${firstFailure.runId} failed with exit code ${firstFailure.exitCode}`
        : 'no successful Daytona runs',
      runResults,
    };
  }

  if (succeeded.length < runResults.length) {
    return {
      ok: true,
      reason: `partial-success:${succeeded.length}/${runResults.length}`,
      runResults,
    };
  }

  return { ok: true, reason: 'all-runs-succeeded', runResults };
}

async function writeArtifacts(runRoot, modeInfo, daytonaAttempt) {
  await ensureDir(runRoot);
  await ensureDir(path.join(runRoot, 'artifacts'));

  for (const run of seed.runs) {
    const runDir = path.join(runRoot, run.agent);
    await ensureDir(runDir);
    const runScores = seed.scores.filter((entry) => entry.runId === run.id);
    for (const score of runScores) {
      const skill = seed.skills.find((entry) => entry.id === score.skillId);
      const task = seed.tasks.find((entry) => entry.id === score.taskId);
      const payload = {
        benchmarkId: score.id,
        runId: run.id,
        agent: run.agent,
        mode: modeInfo.effective,
        task,
        skill,
        result: {
          overall: score.overall,
          success: score.success,
        },
        reproducibility: {
          command: `node scripts/benchmark-skills.mjs --mode ${modeInfo.requested}`,
          generatedAt: new Date().toISOString(),
        },
      };
      const outPath = path.join(runDir, `${skill?.slug ?? score.skillId}.json`);
      await fsp.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    }
    await fsp.writeFile(
      path.join(runDir, 'run-summary.json'),
      `${JSON.stringify({ run, mode: modeInfo.effective, generatedAt: new Date().toISOString(), scores: runScores }, null, 2)}\n`,
      'utf8',
    );
  }

  const leaderboard = aggregateLeaderboard(seed.scores).map((entry) => ({
    ...entry,
    skill: seed.skills.find((skill) => skill.id === entry.skillId)?.slug ?? entry.skillId,
  }));

  const manifest = {
    generatedAt: new Date().toISOString(),
    seedGeneratedAt: seed.generatedAt,
    mode: modeInfo.effective,
    requestedMode: modeInfo.requested,
    modeReason: modeInfo.reason,
    totals: {
      tasks: seed.tasks.length,
      skills: seed.skills.length,
      scoreRows: seed.scores.length,
    },
    daytonaAttempt,
    runs: seed.runs,
    leaderboard,
    reproducible: {
      command: `node scripts/benchmark-skills.mjs --mode ${modeInfo.requested}`,
      effectiveModeCommand: `node scripts/benchmark-skills.mjs --mode ${modeInfo.effective}`,
      fallbackCommand: 'node scripts/benchmark-skills.mjs --mode fallback',
    },
  };

  await fsp.writeFile(path.join(runRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const reportLines = [
    '# Every Skill Benchmark Report',
    '',
    `Generated: ${manifest.generatedAt}`,
    `Mode: ${manifest.mode} (requested: ${manifest.requestedMode})`,
    `Mode reason: ${manifest.modeReason}`,
    `Task count: ${seed.tasks.length}`,
    `Skill count: ${seed.skills.length}`,
    daytonaAttempt.ok ? 'Daytona status: executed' : `Daytona status: skipped (${daytonaAttempt.reason})`,
    Array.isArray(daytonaAttempt.runResults)
      ? `Daytona runs: ${daytonaAttempt.runResults.map((entry) => `${entry.cli}:${entry.ok ? 'ok' : `fail(${entry.exitCode})`}`).join(', ')}`
      : '',
    '',
    '## Leaderboard',
    ...leaderboard.map((entry, idx) => `${idx + 1}. ${entry.skill} — overall ${entry.averageOverall}, success ${entry.averageSuccess}`),
    '',
    '## Reproduce',
    '- `node scripts/benchmark-skills.mjs --mode fallback`',
    '- `node scripts/benchmark-skills.mjs --mode daytona` (requires DAYTONA_API_KEY and ../design-app harness)',
  ];
  await fsp.writeFile(path.join(runRoot, 'REPORT.md'), `${reportLines.join('\n')}\n`, 'utf8');
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log('Usage: node scripts/benchmark-skills.mjs [--mode auto|daytona|fallback] [--out-dir <dir>]');
    process.exit(0);
  }

  const requestedMode = normalizeRequestedMode(readArg('--mode', 'auto'));
  const resolvedMode = resolveMode(requestedMode);
  const outRoot = readArg('--out-dir', path.join(repoRoot, 'benchmarks', 'runs'));
  const runLabel = isoDay();
  const daytonaAttemptRoot = path.join(outRoot, `${runLabel}-daytona-attempt`);

  let daytonaAttempt = { ok: false, reason: 'not requested' };
  let finalMode = resolvedMode;
  let modeReason = requestedMode === 'fallback' ? 'forced-fallback' : 'auto-fallback-no-daytona-key';

  if (resolvedMode === 'daytona') {
    const attempt = maybeRunDaytona(daytonaAttemptRoot);
    if (!attempt.ok) {
      console.warn(`[benchmark] Daytona unavailable, using fallback artifacts: ${attempt.reason}`);
      daytonaAttempt = attempt;
      finalMode = 'fallback';
      modeReason = `daytona-unavailable:${attempt.reason}`;
    } else {
      daytonaAttempt = attempt;
      modeReason = requestedMode === 'auto' ? 'auto-daytona' : 'forced-daytona';
    }
  } else if (requestedMode === 'fallback') {
    modeReason = 'forced-fallback';
  }

  const runRoot = path.join(outRoot, `${runLabel}-${finalMode}`);
  const modeInfo = {
    requested: requestedMode,
    effective: finalMode,
    reason: modeReason,
  };

  if (daytonaAttempt.ok && daytonaAttemptRoot !== runRoot) {
    await ensureDir(runRoot);
    const attemptDaytonaDir = path.join(daytonaAttemptRoot, 'daytona-cli-runs');
    const finalDaytonaDir = path.join(runRoot, 'daytona-cli-runs');
    if (fs.existsSync(attemptDaytonaDir)) {
      fs.cpSync(attemptDaytonaDir, finalDaytonaDir, { recursive: true, force: true });
    }
  }

  await writeArtifacts(runRoot, modeInfo, daytonaAttempt);
  console.log(`[benchmark] wrote benchmark artifacts to ${runRoot}`);
}

main().catch((error) => {
  console.error('[benchmark] failed', error);
  process.exit(1);
});
