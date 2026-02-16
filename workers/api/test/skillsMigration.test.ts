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
    expect(sql).toContain('DROP TABLE IF EXISTS skill_seed_50;');
  });
});
