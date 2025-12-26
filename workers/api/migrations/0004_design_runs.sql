-- Migration number: 0004
-- Migration name: design_runs
PRAGMA foreign_keys = ON;

-- Design runs table: stores metadata for design system runs
CREATE TABLE IF NOT EXISTS design_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  prompt TEXT,
  config TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  FOREIGN KEY (account_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_design_runs_account ON design_runs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_runs_user ON design_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_runs_status ON design_runs(status, created_at DESC);

-- Design run events table: stores events/logs for each run
CREATE TABLE IF NOT EXISTS design_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES design_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_design_run_events_run ON design_run_events(run_id, created_at ASC);

-- Design run artifacts table: stores references to R2 objects
CREATE TABLE IF NOT EXISTS design_run_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES design_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_design_run_artifacts_run ON design_run_artifacts(run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_design_run_artifacts_type ON design_run_artifacts(run_id, artifact_type);
