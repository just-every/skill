# Skills API and Benchmarks

## Overview

Every Skill exposes a retrieval API that maps coding task descriptions to benchmarked skills.

Recommendation scoring combines:

- Embedding similarity between task query and skill metadata
- Historical benchmark performance from seeded run records

Only `security_status='approved'` skills are eligible for recommendation.

## Endpoints

### `GET /api/skills`

Returns summarized benchmarked skills.

### `GET /api/skills/tasks`

Returns benchmark task templates (used as benchmark matrix inputs).

### `GET /api/skills/benchmarks`

Returns benchmark runs and coverage metrics.

### `GET /api/skills/:slug`

Returns one skill with detailed score rows grouped by task.

### `POST /api/skills/recommend`

Request:

```json
{
  "task": "Harden our GitHub Actions pipeline, pin actions, and secure secrets.",
  "agent": "codex"
}
```

Response includes:

- `recommendation` (top skill)
- `candidates` (ranked shortlist)
- benchmark context metadata

Recommendation behavior:

- Recommendation responses are decisively trial-native and use oracle-mode `trial_scores` only.
- API response shape remains unchanged.

### `POST /api/skills/trials/execute`

Records a benchmark-native trial execution row, trial events, and computed trial scores.

Auth and abuse controls:

- Requires `SKILLS_TRIAL_EXECUTE_TOKEN` configured in worker env (minimum 16 characters).
- Caller must provide a matching token via `Authorization: Bearer <token>` or `X-Skills-Trial-Token`.
- Rejects oversized event batches and blocked marker strings in artifacts/notes.

Supports evaluation modes:

- `baseline`
- `oracle_skill` (requires `skillId`)
- `library_selection`

Scoring combines deterministic checks and safety checks into persisted `trial_scores`.

### `POST /api/skills/trials/orchestrate`

Executes a comparable multi-mode trial set (`baseline`, `oracle_skill`, `library_selection`) through a container orchestrator and persists each resulting trial via the same deterministic+safety scoring path.

Request:

```json
{
  "benchmarkCaseId": "benchmark-case-custom-task-01",
  "oracleSkillId": "ci-security-hardening",
  "agent": "codex",
  "runId": "bench-orchestrated-comparison"
}
```

Behavior:

- Requires the same caller auth as `POST /api/skills/trials/execute`.
- Requires `SKILLS_TRIAL_ORCHESTRATOR_URL` and `SKILLS_TRIAL_ORCHESTRATOR_TOKEN` in worker env.
- Validates that `benchmark_cases.container_image` is pinned (`...@sha256:<64-hex>`).
- Calls orchestrator `/execute` once per mode and persists trial rows/events/scores.
- Returns an executable comparison with `oracle_skill vs baseline` and `library_selection vs baseline` deltas.
- Requires terminal orchestrator statuses (`completed`/`failed`) for every requested mode; non-terminal statuses are rejected to keep mode comparisons meaningful.
- Persists orchestrated trial writes inside a single transaction and rolls back on mid-batch persistence failure.

Default mode set is all three comparable modes unless `modes` is explicitly provided.

### `POST /api/skills/trials/inspect`

Inspects persisted trial-native rows for a benchmark run and returns mode coverage, score presence, and comparison deltas.

Request:

```json
{
  "runId": "bench-orchestrated-comparison"
}
```

Behavior:

- Uses the same token auth as other trial endpoints.
- Reads `skill_benchmark_runs`, `trials`, and `trial_scores` for the run.
- Returns trial/score counts plus `oracle_skill vs baseline` and `library_selection vs baseline` deltas.

Non-terminal execution status handling:

- `pending` and `running` trial writes keep `trials.completed_at` as `NULL`.
- Terminal statuses (`completed`, `failed`) set `trials.completed_at`.

## Schema

MVP schema is introduced in:

- `workers/api/migrations/0007_skills_mvp.sql`

Tables:

- `skills`
- `skill_tasks`
- `skill_benchmark_runs`

Legacy table retirement:

- `skill_task_scores` is retired in `workers/api/migrations/0012_retire_legacy_skill_scores.sql` after trial-native backfill.

Phase 1 benchmark-native tables (added in migration `0011_benchmark_native_phase1.sql`):

- `benchmarks`
- `benchmark_cases`
- `trials`
- `trial_events`
- `trial_scores`
- `skill_task_fit`

Compatibility behavior:

- `/api/skills*` is benchmark-native and reads score rows from the trial graph (`trial_scores -> trials -> benchmark_cases -> benchmarks -> skill_tasks`) for catalog, summaries, and recommendation scoring.
- Trial-native reads for catalog/recommendation are restricted to `trials.evaluation_mode = 'oracle_skill'` so `baseline` and `library_selection` runs do not affect ranking or integrity checks.
- Response shape is unchanged for existing clients.
- Requests fail with integrity errors when trial-native schema or oracle-mode trial score rows are unavailable.

Integrity behavior:

- Fixed corpus assumptions are removed (no hard requirement for exactly 50 skills, 3 runs, or 150 rows).
- Integrity checks now enforce flexible consistency: non-empty skills/runs/scores, valid score references to known task/skill/run ids, supported agent names, and synthetic marker blocking.
- Partial agent coverage is valid.

Container contract behavior:

- Backfilled benchmark cases now use a resolvable pinned image reference.
- `benchmark_cases.container_image` must remain a pinned digest contract for orchestration (`@sha256:...`).

## Trial Smoke Script

Use the executable smoke script to validate post-deploy orchestration persistence and deltas:

```bash
node scripts/smoke-skills-trials.mjs --mode live
```

Deploy gating:

- `scripts/deploy.sh --mode deploy` executes the live trial smoke automatically.
- Deploy fails if required trial/orchestrator/smoke env vars are missing or if live orchestrate→inspect assertions fail.
- `pnpm release:block:skills-live-smoke` emits a release-block artifact at `artifacts/release-blockers/skills-live-smoke.json` and marks `live_smoke_pending_external_creds` until required secrets are present.

Required environment variables (also validated by `pnpm audit:deploy-env`):

- `PROJECT_DOMAIN`
- `SKILLS_TRIAL_EXECUTE_TOKEN`
- `SKILLS_TRIAL_ORCHESTRATOR_URL`
- `SKILLS_TRIAL_ORCHESTRATOR_TOKEN`
- `SKILLS_TRIAL_SMOKE_BENCHMARK_CASE_ID`
- `SKILLS_TRIAL_SMOKE_ORACLE_SKILL_ID`

Local proof mode (no external credentials/orchestrator needed):

```bash
SKILLS_TRIAL_EXECUTE_TOKEN=local-proof-token-123456 \
node scripts/smoke-skills-trials.mjs --mode local-proof
```

## Benchmark Reproducibility

Run benchmark artifact generation:

```bash
node scripts/benchmark-skills.mjs --mode daytona
```

If Daytona is unavailable, the script documents fallback and produces deterministic artifacts under `benchmarks/runs/`.

Daytona mode requirements:

- `DAYTONA_API_KEY` in env
- `../design-app/scripts/daytona-cli-run.mjs` available

## Imported Curated Skills

Import source index:

```bash
node scripts/import-curated-skills.mjs
```

Output:

- `benchmarks/imports/openai-curated-skills.json`

## External Provenance Proof

Every public skill includes machine-readable provenance in the API response:

- `provenance.sourceUrl`
- `provenance.repository`
- `provenance.importedFrom`
- `provenance.license`
- `securityReview.status`
- `securityReview.reviewedAt`

Live verification command:

```bash
curl -sS https://skill.justevery.com/api/skills \
  | jq '{total, withProvenance: ([.skills[] | select(.provenance.sourceUrl and .provenance.repository and .securityReview.status == "approved")] | length)}'
```

Imported source inventory (benchmark input corpus seed):

- OpenAI curated index: `benchmarks/imports/openai-curated-skills.json`
- GitHub Actions security docs: `https://docs.github.com/en/actions/security-guides`
- OWASP API security: `https://owasp.org/www-project-api-security/`
- Kubernetes deployment reliability docs: `https://kubernetes.io/docs/concepts/workloads/controllers/deployment/`
- OpenTelemetry docs: `https://opentelemetry.io/docs/`

The service enforces approved-only recommendations at retrieval time (`securityReview.status === "approved"`).

## Daytona State (Current)

Latest successful non-fallback benchmark command:

```bash
set -a; source ~/.env; source .env.repo; set +a
node scripts/benchmark-skills.mjs --mode daytona
```

Current benchmark manifest:

- `benchmarks/runs/2026-02-14-daytona/manifest.json`
- `mode=daytona`
- `daytonaAttempt.ok=true`
- `daytonaAttempt.reason=all-runs-succeeded`

Successful Daytona run artifacts (all benchmark agents):

- `benchmarks/runs/2026-02-14-daytona/daytona-cli-runs/bench-2026-02-14-codex/session.log`
- `benchmarks/runs/2026-02-14-daytona/daytona-cli-runs/bench-2026-02-14-codex/workspace/final.png`
- `benchmarks/runs/2026-02-14-daytona/daytona-cli-runs/bench-2026-02-14-claude/session.log`
- `benchmarks/runs/2026-02-14-daytona/daytona-cli-runs/bench-2026-02-14-claude/workspace/final.png`
- `benchmarks/runs/2026-02-14-daytona/daytona-cli-runs/bench-2026-02-14-gemini/session.log`
- `benchmarks/runs/2026-02-14-daytona/daytona-cli-runs/bench-2026-02-14-gemini/workspace/final.png`

Harness notes for reproducibility:

- The benchmark runner now installs provider CLIs in-sandbox for non-Codex runs.
- Claude runs scrub `ANTHROPIC_API_KEY` and hydrate `~/.claude/.credentials.json` from local credentials when available so OAuth-based auth works in Daytona.

Historical auth blocker evidence is preserved in:

- `benchmarks/runs/2026-02-14-daytona-attempt/BLOCKER.md`
