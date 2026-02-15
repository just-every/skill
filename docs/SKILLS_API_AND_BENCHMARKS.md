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

## Schema

MVP schema is introduced in:

- `workers/api/migrations/0007_skills_mvp.sql`

Tables:

- `skills`
- `skill_tasks`
- `skill_benchmark_runs`
- `skill_task_scores`

## Benchmark Reproducibility

Run benchmark artifact generation:

```bash
node scripts/benchmark-skills.mjs --mode auto
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
