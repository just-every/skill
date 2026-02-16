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
