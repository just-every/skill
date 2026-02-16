-- Migration number: 0011
-- Migration name: benchmark_native_phase1
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS benchmarks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'internal',
  source_version TEXT NOT NULL DEFAULT 'phase1',
  container_runtime TEXT NOT NULL DEFAULT 'daytona',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES skill_tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS benchmark_cases (
  id TEXT PRIMARY KEY,
  benchmark_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  container_image TEXT NOT NULL DEFAULT '',
  timeout_seconds INTEGER NOT NULL DEFAULT 1800,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (benchmark_id) REFERENCES benchmarks(id) ON DELETE CASCADE,
  UNIQUE (benchmark_id, slug)
);

CREATE TABLE IF NOT EXISTS trials (
  id TEXT PRIMARY KEY,
  benchmark_case_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  skill_id TEXT,
  agent TEXT NOT NULL CHECK (agent IN ('codex', 'claude', 'gemini')),
  model TEXT NOT NULL DEFAULT 'legacy-unknown',
  seed INTEGER NOT NULL DEFAULT 0,
  evaluation_mode TEXT NOT NULL DEFAULT 'oracle_skill' CHECK (evaluation_mode IN ('baseline', 'oracle_skill', 'library_selection')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  artifact_path TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  source_score_id TEXT UNIQUE,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (benchmark_case_id) REFERENCES benchmark_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES skill_benchmark_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trial_events (
  id TEXT PRIMARY KEY,
  trial_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('command', 'tool_call', 'safety', 'status', 'legacy_import')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trial_id) REFERENCES trials(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trial_scores (
  id TEXT PRIMARY KEY,
  trial_id TEXT NOT NULL UNIQUE,
  overall_score REAL NOT NULL,
  quality_score REAL NOT NULL,
  security_score REAL NOT NULL,
  speed_score REAL NOT NULL,
  cost_score REAL NOT NULL,
  success_rate REAL NOT NULL,
  deterministic_score REAL NOT NULL DEFAULT 0,
  safety_score REAL NOT NULL DEFAULT 0,
  efficiency_score REAL NOT NULL DEFAULT 0,
  scorer_version TEXT NOT NULL DEFAULT 'phase1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trial_id) REFERENCES trials(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skill_task_fit (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  fit TEXT NOT NULL CHECK (fit IN ('primary', 'secondary', 'disallowed')),
  rationale TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES skill_tasks(id) ON DELETE CASCADE,
  UNIQUE (skill_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_task ON benchmarks(task_id);
CREATE INDEX IF NOT EXISTS idx_benchmarks_slug ON benchmarks(slug);

CREATE INDEX IF NOT EXISTS idx_benchmark_cases_benchmark ON benchmark_cases(benchmark_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_cases_slug ON benchmark_cases(slug);

CREATE INDEX IF NOT EXISTS idx_trials_case ON trials(benchmark_case_id);
CREATE INDEX IF NOT EXISTS idx_trials_run ON trials(run_id);
CREATE INDEX IF NOT EXISTS idx_trials_skill ON trials(skill_id, evaluation_mode, agent);
CREATE INDEX IF NOT EXISTS idx_trials_status ON trials(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trial_events_trial ON trial_events(trial_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trial_scores_trial ON trial_scores(trial_id);
CREATE INDEX IF NOT EXISTS idx_trial_scores_created ON trial_scores(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_task_fit_skill ON skill_task_fit(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_task_fit_task ON skill_task_fit(task_id);

INSERT OR IGNORE INTO benchmarks (
  id,
  task_id,
  slug,
  name,
  description,
  source,
  source_version,
  container_runtime,
  created_at,
  updated_at
)
SELECT
  'benchmark-' || task.slug,
  task.id,
  task.slug || '-benchmark',
  task.name || ' Benchmark',
  'Auto-generated benchmark for task ' || task.name,
  'legacy-skill-task-scores',
  'phase1',
  'daytona',
  COALESCE(task.created_at, CURRENT_TIMESTAMP),
  COALESCE(task.created_at, CURRENT_TIMESTAMP)
FROM skill_tasks task;

INSERT OR IGNORE INTO benchmark_cases (
  id,
  benchmark_id,
  slug,
  name,
  description,
  instructions,
  container_image,
  timeout_seconds,
  created_at,
  updated_at
)
SELECT
  'benchmark-case-' || task.slug,
  'benchmark-' || task.slug,
  'default-case',
  task.name || ' Default Case',
  task.description,
  'Execute benchmark workflow for task: ' || task.name,
  'docker.io/library/alpine@sha256:a4f4213abb84c497377b8544c81b3564f313746700372ec4fe84653e4fb03805',
  1800,
  COALESCE(task.created_at, CURRENT_TIMESTAMP),
  COALESCE(task.created_at, CURRENT_TIMESTAMP)
FROM skill_tasks task;

INSERT OR IGNORE INTO trials (
  id,
  benchmark_case_id,
  run_id,
  skill_id,
  agent,
  model,
  seed,
  evaluation_mode,
  status,
  artifact_path,
  notes,
  source_score_id,
  started_at,
  completed_at,
  created_at,
  updated_at
)
SELECT
  'trial-' || score.id,
  'benchmark-case-' || task.slug,
  score.run_id,
  score.skill_id,
  score.agent,
  'legacy-unknown',
  0,
  'oracle_skill',
  'completed',
  score.artifact_path,
  'Backfilled from skill_task_scores row ' || score.id,
  score.id,
  score.created_at,
  score.created_at,
  score.created_at,
  score.created_at
FROM skill_task_scores score
INNER JOIN skill_tasks task ON task.id = score.task_id
INNER JOIN skills skill ON skill.id = score.skill_id
INNER JOIN skill_benchmark_runs run ON run.id = score.run_id;

INSERT OR IGNORE INTO trial_scores (
  id,
  trial_id,
  overall_score,
  quality_score,
  security_score,
  speed_score,
  cost_score,
  success_rate,
  deterministic_score,
  safety_score,
  efficiency_score,
  scorer_version,
  created_at
)
SELECT
  'trial-score-' || score.id,
  'trial-' || score.id,
  score.overall_score,
  score.quality_score,
  score.security_score,
  score.speed_score,
  score.cost_score,
  score.success_rate,
  score.quality_score,
  score.security_score,
  (score.speed_score + score.cost_score) / 2.0,
  'legacy-skill-task-scores-v1',
  score.created_at
FROM skill_task_scores score
INNER JOIN trials trial ON trial.source_score_id = score.id;

INSERT OR IGNORE INTO trial_events (
  id,
  trial_id,
  event_type,
  payload_json,
  created_at
)
SELECT
  'trial-event-' || score.id,
  'trial-' || score.id,
  'legacy_import',
  json_object(
    'source', 'skill_task_scores',
    'scoreId', score.id,
    'runId', score.run_id,
    'taskId', score.task_id,
    'skillId', score.skill_id
  ),
  score.created_at
FROM skill_task_scores score
INNER JOIN trials trial ON trial.source_score_id = score.id;

INSERT OR IGNORE INTO skill_task_fit (
  id,
  skill_id,
  task_id,
  fit,
  rationale,
  created_at,
  updated_at
)
SELECT
  'fit-' || score.skill_id || '-' || score.task_id,
  score.skill_id,
  score.task_id,
  'primary',
  'Backfilled from benchmark score coverage in skill_task_scores.',
  MAX(score.created_at),
  MAX(score.created_at)
FROM skill_task_scores score
GROUP BY score.skill_id, score.task_id;
