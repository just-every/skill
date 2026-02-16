import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('skills migration 0009', () => {
  it('handles pre-existing slug conflicts safely before inserting 50-skill corpus rows', () => {
    const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations/0009_skills_expand_to_50.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('DELETE FROM skill_task_scores');
    expect(sql).toContain('INNER JOIN skill_seed_50 seed ON seed.slug = s.slug');
    expect(sql).toContain('DELETE FROM skills');
    expect(sql).toContain('WHERE slug IN (SELECT slug FROM skill_seed_50);');
    expect(sql).toContain('INSERT INTO skills');
    expect(sql).not.toContain('INSERT OR REPLACE INTO skill_task_scores');
    expect(sql).toContain('Benchmark scores are ingested only from real run artifacts');
    expect(sql).toContain('DROP TABLE IF EXISTS skill_seed_50;');
  });
});

describe('skills migration 0010', () => {
  it('enforces daytona-only benchmark runs and blocks synthetic markers', () => {
    const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations/0010_enforce_real_skill_benchmarks.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("DELETE FROM skill_task_scores");
    expect(sql).toContain("DELETE FROM skill_benchmark_runs");
    expect(sql).toContain("lower(mode) <> 'daytona'");
    expect(sql).toContain('trg_skill_runs_daytona_only_insert');
    expect(sql).toContain('trg_skill_runs_no_synthetic_insert');
    expect(sql).toContain('trg_skill_scores_no_synthetic_insert');
    expect(sql).toContain('RAISE(ABORT, \'skill_benchmark_runs.mode must be daytona\')');
  });
});

describe('skills migration 0011', () => {
  it('adds benchmark-native tables, indexes, and legacy backfill statements', () => {
    const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations/0011_benchmark_native_phase1.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS benchmarks');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS benchmark_cases');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS trials');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS trial_events');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS trial_scores');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS skill_task_fit');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_trials_skill');
    expect(sql).toContain('INSERT OR IGNORE INTO benchmarks');
    expect(sql).toContain('INSERT OR IGNORE INTO benchmark_cases');
    expect(sql).toContain('INSERT OR IGNORE INTO trials');
    expect(sql).toContain('INSERT OR IGNORE INTO trial_scores');
    expect(sql).toContain('INSERT OR IGNORE INTO trial_events');
    expect(sql).toContain('INSERT OR IGNORE INTO skill_task_fit');
    expect(sql).toContain('Backfilled from skill_task_scores row');
    expect(sql).toContain("docker.io/library/alpine@sha256:a4f4213abb84c497377b8544c81b3564f313746700372ec4fe84653e4fb03805");
    expect(sql).not.toContain('daytona-benchmark:latest');
    expect(sql).toMatch(/container_image[\s\S]*@sha256:[a-f0-9]{64}/i);
  });
});

describe('skills migration 0012', () => {
  it('retires legacy placeholder score artifacts after trial-native backfill', () => {
    const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations/0012_retire_legacy_skill_scores.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('DROP TABLE IF EXISTS skill_task_scores');
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_skill_scores_no_synthetic_insert');
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_skill_scores_no_synthetic_update');
    expect(sql).toContain('DROP INDEX IF EXISTS idx_skill_scores_skill');
    expect(sql).toContain('DROP INDEX IF EXISTS idx_skill_scores_task');
    expect(sql).toContain('DROP INDEX IF EXISTS idx_skill_scores_run');
  });
});

describe('deploy gating for benchmark-native trial smoke', () => {
  it('requires trial orchestrator env vars in deploy env audit', () => {
    const auditPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts/audit-deploy-env.mjs');
    const script = readFileSync(auditPath, 'utf8');

    expect(script).toContain("name: 'SKILLS_TRIAL_EXECUTE_TOKEN'");
    expect(script).toContain("name: 'SKILLS_TRIAL_ORCHESTRATOR_URL'");
    expect(script).toContain("name: 'SKILLS_TRIAL_ORCHESTRATOR_TOKEN'");
    expect(script).toContain("name: 'SKILLS_TRIAL_SMOKE_BENCHMARK_CASE_ID'");
    expect(script).toContain("name: 'SKILLS_TRIAL_SMOKE_ORACLE_SKILL_ID'");
  });

  it('runs live benchmark-native skills smoke in deploy mode', () => {
    const deployPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts/deploy.sh');
    const script = readFileSync(deployPath, 'utf8');

    expect(script).toContain('post_deploy_skills_trial_smoke()');
    expect(script).toContain('node scripts/smoke-skills-trials.mjs --mode live');
    expect(script).toContain('Executing benchmark-native skills smoke checks');
  });

  it('provides an explicit release-block artifact check for missing live smoke credentials', () => {
    const releaseBlockPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../scripts/release-block-skills-live-smoke.mjs',
    );
    const script = readFileSync(releaseBlockPath, 'utf8');

    expect(script).toContain('artifacts/release-blockers/skills-live-smoke.json');
    expect(script).toContain('live_smoke_pending_external_creds');
    expect(script).toContain('process.exit(2)');
  });
});
