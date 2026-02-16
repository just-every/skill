#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const artifactPath = path.join(repoRoot, 'artifacts', 'release-blockers', 'skills-live-smoke.json');

const requiredKeys = [
  'PROJECT_DOMAIN',
  'SKILLS_TRIAL_EXECUTE_TOKEN',
  'SKILLS_TRIAL_ORCHESTRATOR_URL',
  'SKILLS_TRIAL_ORCHESTRATOR_TOKEN',
  'SKILLS_TRIAL_SMOKE_BENCHMARK_CASE_ID',
  'SKILLS_TRIAL_SMOKE_ORACLE_SKILL_ID',
];

const envFiles = [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.ci'),
  path.join(repoRoot, '.env.repo'),
  path.join(repoRoot, '.env.generated'),
  path.join(os.homedir(), '.env'),
];

function loadEnvFromFiles() {
  const out = Object.create(null);
  for (const file of envFiles) {
    if (!fs.existsSync(file)) continue;
    const contents = fs.readFileSync(file, 'utf8');
    for (const rawLine of contents.split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      if (line.startsWith('export ')) {
        line = line.slice('export '.length).trim();
      }
      const [key, ...rest] = line.split('=');
      if (!key) continue;
      const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
      out[key.trim()] = value;
    }
  }
  return out;
}

function looksPlaceholder(value) {
  return /(placeholder|dummy|example)/i.test(String(value ?? ''));
}

function isValidValue(key, value) {
  const raw = String(value ?? '').trim();
  if (!raw || looksPlaceholder(raw)) {
    return false;
  }

  if (key === 'PROJECT_DOMAIN' || key === 'SKILLS_TRIAL_ORCHESTRATOR_URL') {
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'https:' || parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    } catch {
      return false;
    }
  }

  if (key === 'SKILLS_TRIAL_EXECUTE_TOKEN' || key === 'SKILLS_TRIAL_ORCHESTRATOR_TOKEN') {
    return raw.length >= 16;
  }

  return raw.length >= 3;
}

async function writeArtifact(payload) {
  await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.promises.writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  const fileEnv = loadEnvFromFiles();
  const env = { ...fileEnv, ...process.env };
  const missingKeys = requiredKeys.filter((key) => !isValidValue(key, env[key]));

  const payload = {
    generatedAt: new Date().toISOString(),
    status: missingKeys.length === 0 ? 'ready_for_live_smoke' : 'live_smoke_pending_external_creds',
    summary:
      missingKeys.length === 0
        ? 'Required credentials are present; live trial smoke should be runnable.'
        : 'Live trial smoke is blocked on external credentials. Deploy gating remains strict and will fail until these are configured.',
    requiredKeys,
    missingKeys,
    projectDomainConfigured: isValidValue('PROJECT_DOMAIN', env.PROJECT_DOMAIN),
    artifact: 'artifacts/release-blockers/skills-live-smoke.json',
  };

  await writeArtifact(payload);

  if (missingKeys.length > 0) {
    console.error('[release-block] live smoke pending external creds');
    for (const key of missingKeys) {
      console.error(`- ${key}`);
    }
    process.exit(2);
  }

  console.log('[release-block] live smoke readiness checks passed');
}

main().catch((error) => {
  console.error('[release-block] failed', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

