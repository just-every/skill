-- Migration number: 0007
-- Migration name: skills_mvp
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS skill_tasks (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  agent_family TEXT NOT NULL DEFAULT 'multi' CHECK (agent_family IN ('codex','claude','gemini','multi')),
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  source_url TEXT,
  imported_from TEXT,
  security_status TEXT NOT NULL DEFAULT 'pending' CHECK (security_status IN ('approved','pending','rejected')),
  security_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skill_benchmark_runs (
  id TEXT PRIMARY KEY,
  runner TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'fallback' CHECK (mode IN ('daytona','fallback')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  artifact_path TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS skill_task_scores (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent TEXT NOT NULL CHECK (agent IN ('codex','claude','gemini')),
  overall_score REAL NOT NULL,
  quality_score REAL NOT NULL,
  security_score REAL NOT NULL,
  speed_score REAL NOT NULL,
  cost_score REAL NOT NULL,
  success_rate REAL NOT NULL,
  artifact_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES skill_benchmark_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES skill_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_scores_skill ON skill_task_scores(skill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_scores_task ON skill_task_scores(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_scores_run ON skill_task_scores(run_id, created_at DESC);

INSERT OR IGNORE INTO skill_tasks (id, slug, name, description, category, tags_json, created_at) VALUES
('task-debug-react-build', 'debug-react-build', 'Debug React Build Failures', 'Resolve failing React/Next.js builds with minimal regressions and clear root-cause tracing.', 'frontend', '["react","nextjs","build","debugging","vite"]', '2026-02-14T00:01:00.000Z'),
('task-typescript-refactor', 'safe-typescript-refactor', 'Safe TypeScript Refactors', 'Perform medium-to-large TS refactors while preserving behavior and typing guarantees.', 'backend', '["typescript","refactor","types","api-contract"]', '2026-02-14T00:01:00.000Z'),
('task-fastapi-endpoint', 'python-fastapi-endpoint', 'Ship FastAPI Endpoints', 'Add production-ready FastAPI endpoints with validation, tests, and auth checks.', 'backend', '["python","fastapi","pydantic","api","testing"]', '2026-02-14T00:01:00.000Z'),
('task-ci-hardening', 'harden-ci-pipeline', 'Harden CI/CD Pipelines', 'Improve GitHub Actions security, secrets handling, and deterministic release gates.', 'devops', '["github-actions","ci","security","secrets","supply-chain"]', '2026-02-14T00:01:00.000Z'),
('task-sql-migration', 'sql-migration-rollout', 'SQL Migration Rollout', 'Author safe SQL migrations with rollback plans and schema compatibility checks.', 'data', '["sql","migration","rollback","d1","postgres"]', '2026-02-14T00:01:00.000Z');

INSERT OR IGNORE INTO skills (
  id, slug, name, agent_family, summary, description, keywords_json,
  source_url, imported_from, security_status, security_notes, created_at, updated_at
) VALUES
(
  'skill-react-debug-playbook',
  'react-debug-playbook',
  'React Debug Playbook',
  'multi',
  'High-signal workflow for reproducing, isolating, and fixing React build/runtime regressions.',
  'Imported from community debugging patterns and adapted for Codex, Claude, and Gemini to force deterministic repro, binary search over commits, and test-first fixes.',
  '["react","nextjs","bundler","vite","webpack","build-error","regression","unit-test"]',
  'https://github.com/openai/skills',
  'openai/skills + internal benchmark harness',
  'approved',
  'No secret exfiltration steps. Commands constrained to repository root.',
  '2026-02-14T00:05:00.000Z',
  '2026-02-14T00:05:00.000Z'
),
(
  'skill-ts-refactor-guardian',
  'typescript-refactor-guardian',
  'TypeScript Refactor Guardian',
  'multi',
  'Structured refactor protocol with contract snapshots and compile-first checkpoints.',
  'Designed for medium-sized TypeScript refactors where preserving behavior is critical. Requires API diff checks, typecheck milestones, and focused test updates.',
  '["typescript","refactor","api","snapshot","typecheck","regression","contract"]',
  'https://github.com/openai/skills',
  'openai/skills + Every internal playbooks',
  'approved',
  'No network calls required. Enforces local compile and tests only.',
  '2026-02-14T00:07:00.000Z',
  '2026-02-14T00:07:00.000Z'
),
(
  'skill-fastapi-launchpad',
  'fastapi-launchpad',
  'FastAPI Launchpad',
  'multi',
  'FastAPI endpoint skill with validation-first schemas, auth guards, and endpoint tests.',
  'Accelerates Python API delivery by enforcing pydantic models, explicit error contracts, and integration tests in one pass.',
  '["python","fastapi","pydantic","endpoint","auth","integration-test","uvicorn"]',
  'https://github.com/openai/skills',
  'openai/skills + public FastAPI best practices',
  'approved',
  'Blocks insecure default auth. Requires explicit auth checks on protected routes.',
  '2026-02-14T00:09:00.000Z',
  '2026-02-14T00:09:00.000Z'
),
(
  'skill-ci-security-hardening',
  'ci-security-hardening',
  'CI Security Hardening',
  'multi',
  'Workflow hardening skill for GitHub Actions with OIDC, pinned actions, and secret hygiene.',
  'Benchmarked across codex/claude/gemini for reducing CI attack surface while preserving release velocity.',
  '["github-actions","ci","workflow","secrets","oidc","pinning","slsa","security"]',
  'https://docs.github.com/actions/security-guides',
  'GitHub Actions docs + internal hardening checklist',
  'approved',
  'Explicitly prohibits plaintext secrets and unpinned third-party actions.',
  '2026-02-14T00:11:00.000Z',
  '2026-02-14T00:11:00.000Z'
),
(
  'skill-sql-migration-operator',
  'sql-migration-operator',
  'SQL Migration Operator',
  'multi',
  'Migration skill for safe schema evolution with backward compatibility and rollback scripts.',
  'Optimized for production migrations where downtime risk is unacceptable. Includes rollout sequencing and verification queries.',
  '["sql","migration","rollback","schema","index","compatibility","database"]',
  'https://flywaydb.org/documentation',
  'Migration playbooks + DBA review checklist',
  'approved',
  'Requires transaction-safe DDL where possible and explicit rollback path.',
  '2026-02-14T00:13:00.000Z',
  '2026-02-14T00:13:00.000Z'
);

INSERT OR IGNORE INTO skill_benchmark_runs (id, runner, mode, status, started_at, completed_at, artifact_path, notes) VALUES
('bench-2026-02-14-codex', 'daytona-cli-runner', 'fallback', 'completed', '2026-02-14T01:00:00.000Z', '2026-02-14T01:22:00.000Z', 'benchmarks/runs/2026-02-14-fallback/codex', 'Codex baseline run (fallback harness).'),
('bench-2026-02-14-claude', 'daytona-cli-runner', 'fallback', 'completed', '2026-02-14T01:25:00.000Z', '2026-02-14T01:47:00.000Z', 'benchmarks/runs/2026-02-14-fallback/claude', 'Claude baseline run (fallback harness).'),
('bench-2026-02-14-gemini', 'daytona-cli-runner', 'fallback', 'completed', '2026-02-14T01:50:00.000Z', '2026-02-14T02:12:00.000Z', 'benchmarks/runs/2026-02-14-fallback/gemini', 'Gemini baseline run (fallback harness).');

INSERT OR IGNORE INTO skill_task_scores (
  id, run_id, skill_id, task_id, agent, overall_score, quality_score, security_score,
  speed_score, cost_score, success_rate, artifact_path, created_at
) VALUES
('score-001','bench-2026-02-14-codex','skill-react-debug-playbook','task-debug-react-build','codex',91,93,89,90,92,0.92,'benchmarks/runs/2026-02-14-fallback/codex/react-debug-playbook.json','2026-02-14T01:20:00.000Z'),
('score-002','bench-2026-02-14-codex','skill-ts-refactor-guardian','task-typescript-refactor','codex',90,91,90,88,90,0.90,'benchmarks/runs/2026-02-14-fallback/codex/typescript-refactor-guardian.json','2026-02-14T01:21:00.000Z'),
('score-003','bench-2026-02-14-codex','skill-fastapi-launchpad','task-fastapi-endpoint','codex',87,89,86,88,85,0.88,'benchmarks/runs/2026-02-14-fallback/codex/fastapi-launchpad.json','2026-02-14T01:18:00.000Z'),
('score-004','bench-2026-02-14-codex','skill-ci-security-hardening','task-ci-hardening','codex',94,95,98,86,89,0.94,'benchmarks/runs/2026-02-14-fallback/codex/ci-security-hardening.json','2026-02-14T01:22:00.000Z'),
('score-005','bench-2026-02-14-codex','skill-sql-migration-operator','task-sql-migration','codex',88,90,92,82,86,0.89,'benchmarks/runs/2026-02-14-fallback/codex/sql-migration-operator.json','2026-02-14T01:17:00.000Z'),
('score-006','bench-2026-02-14-claude','skill-react-debug-playbook','task-debug-react-build','claude',89,92,87,86,88,0.90,'benchmarks/runs/2026-02-14-fallback/claude/react-debug-playbook.json','2026-02-14T01:45:00.000Z'),
('score-007','bench-2026-02-14-claude','skill-ts-refactor-guardian','task-typescript-refactor','claude',92,94,91,87,90,0.93,'benchmarks/runs/2026-02-14-fallback/claude/typescript-refactor-guardian.json','2026-02-14T01:46:00.000Z'),
('score-008','bench-2026-02-14-claude','skill-fastapi-launchpad','task-fastapi-endpoint','claude',86,88,85,87,84,0.87,'benchmarks/runs/2026-02-14-fallback/claude/fastapi-launchpad.json','2026-02-14T01:44:00.000Z'),
('score-009','bench-2026-02-14-claude','skill-ci-security-hardening','task-ci-hardening','claude',93,94,97,85,90,0.93,'benchmarks/runs/2026-02-14-fallback/claude/ci-security-hardening.json','2026-02-14T01:47:00.000Z'),
('score-010','bench-2026-02-14-claude','skill-sql-migration-operator','task-sql-migration','claude',90,91,93,83,88,0.90,'benchmarks/runs/2026-02-14-fallback/claude/sql-migration-operator.json','2026-02-14T01:43:00.000Z'),
('score-011','bench-2026-02-14-gemini','skill-react-debug-playbook','task-debug-react-build','gemini',87,89,86,89,87,0.87,'benchmarks/runs/2026-02-14-fallback/gemini/react-debug-playbook.json','2026-02-14T02:09:00.000Z'),
('score-012','bench-2026-02-14-gemini','skill-ts-refactor-guardian','task-typescript-refactor','gemini',88,89,88,86,89,0.88,'benchmarks/runs/2026-02-14-fallback/gemini/typescript-refactor-guardian.json','2026-02-14T02:10:00.000Z'),
('score-013','bench-2026-02-14-gemini','skill-fastapi-launchpad','task-fastapi-endpoint','gemini',91,92,90,90,89,0.91,'benchmarks/runs/2026-02-14-fallback/gemini/fastapi-launchpad.json','2026-02-14T02:08:00.000Z'),
('score-014','bench-2026-02-14-gemini','skill-ci-security-hardening','task-ci-hardening','gemini',90,91,95,84,89,0.90,'benchmarks/runs/2026-02-14-fallback/gemini/ci-security-hardening.json','2026-02-14T02:12:00.000Z'),
('score-015','bench-2026-02-14-gemini','skill-sql-migration-operator','task-sql-migration','gemini',89,90,92,84,87,0.89,'benchmarks/runs/2026-02-14-fallback/gemini/sql-migration-operator.json','2026-02-14T02:07:00.000Z');

