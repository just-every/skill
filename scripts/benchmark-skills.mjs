#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ALLOWED_AGENTS = ['codex', 'claude', 'gemini'];
const BLOCKED_MARKERS = ['fallback', 'mock', 'synthetic', 'seed'];

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

function normalizeMode(rawMode) {
  if (rawMode === 'daytona') return 'daytona';
  if (rawMode === 'import') return 'import';
  return 'daytona';
}

function hasBlockedMarker(value) {
  if (!value) return false;
  const lowered = value.toLowerCase();
  return BLOCKED_MARKERS.some((marker) => lowered.includes(marker));
}

function maybeRunDaytona(outputDir) {
  const daytonaScript = path.resolve(repoRoot, '../design-app/scripts/daytona-cli-run.mjs');
  if (!fs.existsSync(daytonaScript)) {
    return { ok: false, reason: `missing script: ${daytonaScript}` };
  }
  if (!process.env.DAYTONA_API_KEY) {
    return { ok: false, reason: 'DAYTONA_API_KEY is not set' };
  }

  const runConfig = {
    codex: {
      prompt: 'Benchmark all skills with production CI hardening and auth middleware workloads.',
      cliInstall: '',
      cliCommand: '',
      env: {},
    },
    claude: {
      prompt: 'Benchmark all skills with TypeScript refactor and migration rollout workloads.',
      cliInstall: 'npm install -g @anthropic-ai/claude-code',
      cliCommand: '',
      env: {
        ANTHROPIC_API_KEY: '',
      },
    },
    gemini: {
      prompt: 'Benchmark all skills with reliability, queue retry, and observability workloads.',
      cliInstall: 'npm install -g @google/gemini-cli',
      cliCommand: '',
      env: {},
    },
  };

  const runResults = [];
  for (const agent of ALLOWED_AGENTS) {
    const runId = `bench-${isoDay()}-${agent}`;
    const config = runConfig[agent];

    spawnSync('daytona', ['sandbox', 'delete', `design-cli-${runId}`], {
      cwd: repoRoot,
      stdio: 'ignore',
      env: process.env,
    });

    const args = [
      daytonaScript,
      '--cli',
      agent,
      '--auth-mode',
      'session',
      '--design-mode',
      'none',
      '--prompt',
      config.prompt,
      '--run-id',
      runId,
      '--output-dir',
      outputDir,
    ];

    if (config.cliInstall) {
      args.push('--cli-install', config.cliInstall);
    }

    if (config.cliCommand) {
      args.push('--cli-command', config.cliCommand);
    }

    const result = spawnSync('node', args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...config.env,
      },
    });

    const exitCode = typeof result.status === 'number' ? result.status : 1;
    runResults.push({ runId, agent, ok: exitCode === 0, exitCode });
  }

  const failures = runResults.filter((run) => !run.ok);
  if (failures.length > 0) {
    return {
      ok: false,
      reason: `daytona-failed:${failures.map((failure) => `${failure.runId}(${failure.exitCode})`).join(',')}`,
      runResults,
    };
  }

  return { ok: true, reason: 'all-runs-succeeded', runResults };
}

async function collectJsonFiles(rootDir) {
  const files = [];

  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.json')) continue;
      if (entry.name === 'manifest.json' || entry.name === 'run-summary.json') continue;
      files.push(fullPath);
    }
  }

  await walk(rootDir);
  return files;
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function asNumber(value, fallback = NaN) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function detectAgent(value, runId) {
  const explicit = asString(value).toLowerCase();
  if (ALLOWED_AGENTS.includes(explicit)) return explicit;
  const run = asString(runId).toLowerCase();
  for (const agent of ALLOWED_AGENTS) {
    if (run.includes(agent)) return agent;
  }
  return '';
}

function extractScoreRow(payload, filePath, stats) {
  const runId = asString(payload.runId, asString(payload.run?.id));
  const agent = detectAgent(payload.agent ?? payload.run?.agent, runId);
  const skillId = asString(payload.skillId, asString(payload.skill?.id));
  const taskId = asString(payload.taskId, asString(payload.task?.id));

  const overall = asNumber(payload.overallScore, asNumber(payload.result?.overall));
  const quality = asNumber(payload.qualityScore, asNumber(payload.result?.quality, overall));
  const security = asNumber(payload.securityScore, asNumber(payload.result?.security, overall));
  const speed = asNumber(payload.speedScore, asNumber(payload.result?.speed, overall));
  const cost = asNumber(payload.costScore, asNumber(payload.result?.cost, overall));
  const successRate = asNumber(payload.successRate, asNumber(payload.result?.success));

  const taskSlug = asString(payload.taskSlug, asString(payload.task?.slug, taskId));
  const taskName = asString(payload.taskName, asString(payload.task?.name, taskId));
  const createdAt = asString(payload.createdAt, new Date(stats.mtimeMs).toISOString());
  const artifactPath = path.relative(repoRoot, filePath).split(path.sep).join('/');

  if (!runId || !agent || !skillId || !taskId) {
    return { ok: false, reason: `missing identifiers in ${artifactPath}` };
  }
  if (!Number.isFinite(overall) || !Number.isFinite(successRate)) {
    return { ok: false, reason: `missing score metrics in ${artifactPath}` };
  }
  if (hasBlockedMarker(artifactPath)) {
    return { ok: false, reason: `blocked marker in artifact path: ${artifactPath}` };
  }

  const id = asString(payload.id, `${runId}:${skillId}:${taskId}:${agent}`);
  return {
    ok: true,
    row: {
      id,
      runId,
      skillId,
      taskId,
      taskSlug,
      taskName,
      agent,
      overallScore: Number(overall.toFixed(2)),
      qualityScore: Number(quality.toFixed(2)),
      securityScore: Number(security.toFixed(2)),
      speedScore: Number(speed.toFixed(2)),
      costScore: Number(cost.toFixed(2)),
      successRate: Number(successRate.toFixed(4)),
      artifactPath,
      createdAt,
      raw: payload,
    },
  };
}

async function loadRealScores(inputDir) {
  const files = await collectJsonFiles(inputDir);
  const rows = [];
  const failures = [];

  for (const filePath of files) {
    const raw = await fsp.readFile(filePath, 'utf8');
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      failures.push(`invalid json: ${path.relative(repoRoot, filePath)}`);
      continue;
    }
    const stats = await fsp.stat(filePath);
    const extracted = extractScoreRow(payload, filePath, stats);
    if (!extracted.ok) {
      failures.push(extracted.reason);
      continue;
    }
    rows.push(extracted.row);
  }

  if (failures.length > 0) {
    const detail = failures.slice(0, 10).join('; ');
    throw new Error(`Failed to parse benchmark artifacts (${failures.length} issues): ${detail}`);
  }

  return rows;
}

function validateCoverage(rows) {
  const skillIds = new Set(rows.map((row) => row.skillId));
  const runIds = new Set(rows.map((row) => row.runId));
  const agentCounts = new Map(ALLOWED_AGENTS.map((agent) => [agent, 0]));
  for (const row of rows) {
    agentCounts.set(row.agent, (agentCounts.get(row.agent) ?? 0) + 1);
  }

  if (skillIds.size !== 50) {
    throw new Error(`Expected exactly 50 unique skills, found ${skillIds.size}.`);
  }
  if (rows.length !== 150) {
    throw new Error(`Expected exactly 150 score rows, found ${rows.length}.`);
  }
  for (const agent of ALLOWED_AGENTS) {
    const count = agentCounts.get(agent) ?? 0;
    if (count !== 50) {
      throw new Error(`Expected 50 rows for ${agent}, found ${count}.`);
    }
  }
  if (runIds.size !== 3) {
    throw new Error(`Expected exactly 3 benchmark runs, found ${runIds.size}.`);
  }
}

function buildLeaderboard(rows) {
  const bySkill = new Map();
  for (const row of rows) {
    const entry = bySkill.get(row.skillId) ?? { total: 0, success: 0, samples: 0 };
    entry.total += row.overallScore;
    entry.success += row.successRate;
    entry.samples += 1;
    bySkill.set(row.skillId, entry);
  }

  return Array.from(bySkill.entries())
    .map(([skillId, stat]) => ({
      skillId,
      averageOverall: Number((stat.total / stat.samples).toFixed(2)),
      averageSuccess: Number((stat.success / stat.samples).toFixed(4)),
      samples: stat.samples,
    }))
    .sort((a, b) => b.averageOverall - a.averageOverall);
}

async function writeOutputs(outDir, rows, mode, daytonaAttempt, inputDir) {
  await ensureDir(outDir);

  const byAgent = new Map(ALLOWED_AGENTS.map((agent) => [agent, []]));
  for (const row of rows) {
    const list = byAgent.get(row.agent) ?? [];
    list.push(row);
    byAgent.set(row.agent, list);
  }

  for (const [agent, agentRows] of byAgent.entries()) {
    const agentPath = path.join(outDir, `${agent}.json`);
    await fsp.writeFile(agentPath, `${JSON.stringify(agentRows, null, 2)}\n`, 'utf8');
  }

  const leaderboard = buildLeaderboard(rows);
  const manifest = {
    generatedAt: new Date().toISOString(),
    mode,
    sourceDir: path.relative(repoRoot, inputDir).split(path.sep).join('/'),
    totals: {
      runs: new Set(rows.map((row) => row.runId)).size,
      skills: new Set(rows.map((row) => row.skillId)).size,
      scoreRows: rows.length,
    },
    daytonaAttempt,
    leaderboard,
    reproducible: {
      command: 'node scripts/benchmark-skills.mjs --mode daytona',
    },
  };

  await fsp.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const reportLines = [
    '# Every Skill Benchmark Report',
    '',
    `Generated: ${manifest.generatedAt}`,
    `Mode: ${mode}`,
    `Input: ${manifest.sourceDir}`,
    `Run count: ${manifest.totals.runs}`,
    `Skill count: ${manifest.totals.skills}`,
    `Score rows: ${manifest.totals.scoreRows}`,
    '',
    '## Leaderboard',
    ...leaderboard.map((entry, idx) => `${idx + 1}. ${entry.skillId} — overall ${entry.averageOverall}, success ${entry.averageSuccess}`),
    '',
    '## Policy',
    '- Synthetic/mock/fallback benchmark artifacts are blocked.',
    '- Exactly 50 skills and 150 rows are required.',
  ];

  await fsp.writeFile(path.join(outDir, 'REPORT.md'), `${reportLines.join('\n')}\n`, 'utf8');
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log('Usage: node scripts/benchmark-skills.mjs [--mode daytona|import] [--input-dir <dir>] [--out-dir <dir>] [--skip-daytona]');
    process.exit(0);
  }

  const mode = normalizeMode(readArg('--mode', 'daytona'));
  const outRoot = readArg('--out-dir', path.join(repoRoot, 'benchmarks', 'runs'));
  const runLabel = `${isoDay()}-${mode}`;
  const runRoot = path.join(outRoot, runLabel);
  const daytonaOutputDir = path.join(runRoot, 'daytona-cli-runs');

  let daytonaAttempt = { ok: true, reason: 'skipped-for-import' };
  if (mode === 'daytona' && !hasFlag('--skip-daytona')) {
    await ensureDir(daytonaOutputDir);
    daytonaAttempt = maybeRunDaytona(daytonaOutputDir);
    if (!daytonaAttempt.ok) {
      throw new Error(`Daytona benchmark execution failed: ${daytonaAttempt.reason}`);
    }
  }

  const inputDir = path.resolve(readArg('--input-dir', mode === 'daytona' ? daytonaOutputDir : path.join(repoRoot, 'benchmarks', 'imports')));
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Benchmark input directory does not exist: ${inputDir}`);
  }

  const rows = await loadRealScores(inputDir);
  validateCoverage(rows);
  await writeOutputs(runRoot, rows, mode, daytonaAttempt, inputDir);

  console.log(`[benchmark] wrote validated benchmark outputs to ${runRoot}`);
}

main().catch((error) => {
  console.error('[benchmark] failed', error);
  process.exit(1);
});

