-- Migration number: 0005
-- Migration name: design_runs_progress
PRAGMA foreign_keys = ON;

ALTER TABLE design_runs ADD COLUMN progress REAL;
ALTER TABLE design_runs ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill updated_at for existing rows
UPDATE design_runs
SET updated_at = COALESCE(completed_at, started_at, created_at)
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_design_runs_updated ON design_runs(updated_at DESC);
