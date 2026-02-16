-- Migration number: 0012
-- Migration name: retire_legacy_skill_scores
PRAGMA foreign_keys = ON;

-- Legacy placeholder score table is no longer used at runtime.
DROP TRIGGER IF EXISTS trg_skill_scores_no_synthetic_insert;
DROP TRIGGER IF EXISTS trg_skill_scores_no_synthetic_update;

DROP INDEX IF EXISTS idx_skill_scores_skill;
DROP INDEX IF EXISTS idx_skill_scores_task;
DROP INDEX IF EXISTS idx_skill_scores_run;

DROP TABLE IF EXISTS skill_task_scores;
