# Every Skill

Every Skill is a benchmarked skill catalog and retrieval API for AI coding agents.

- Domain: `https://skill.justevery.com`
- Project ID: `skill`
- Stack: Cloudflare Worker (`workers/api`) + Expo web (`apps/web`)

The MVP ships:

- A public website with a live task → skill retrieval demo (`/skills`)
- A Worker API for skill cataloging and embedding-based matching (`/api/skills/*`)
- Seeded curated skills + benchmark records (>= 5 skills)
- Reproducible benchmark artifacts and fallback benchmarking mode

## Core APIs

- `GET /api/skills`
  - Returns benchmarked skill summaries
- `GET /api/skills/tasks`
  - Returns benchmark task templates
- `GET /api/skills/benchmarks`
  - Returns benchmark runs and coverage summary
- `GET /api/skills/:slug`
  - Returns detailed score breakdown for one skill
- `POST /api/skills/recommend`
  - Request body: `{ "task": "...", "agent": "codex|claude|gemini" }`
  - Returns top recommendation and ranked candidates

## Quick Start

1. Install dependencies

```bash
pnpm install
```

2. Generate env and local worker vars

```bash
pnpm bootstrap:env
```

3. Start local dev (worker + web)

```bash
pnpm dev
```

4. Open:

- `http://127.0.0.1:19006` (web)
- `http://127.0.0.1:9788/api/skills` (API)

## Skill and Benchmark Data

Seeded MVP catalog lives in D1 migration:

- `workers/api/migrations/0007_skills_mvp.sql`

The worker includes fallback in-memory seeded data if D1 is unavailable so demo endpoints still work.

## Curated Imports

Import curated skill index from `openai/skills`:

```bash
pnpm skills:import
```

Output:

- `benchmarks/imports/openai-curated-skills.json`

## Benchmarking

Generate reproducible benchmark artifacts:

```bash
pnpm skills:benchmark
```

Modes:

- `auto` (default): uses Daytona if available; falls back to deterministic local benchmark artifacts
- `daytona`: requires `DAYTONA_API_KEY` and `../design-app/scripts/daytona-cli-run.mjs`
- `fallback`: deterministic local artifact generation

Manual examples:

```bash
node scripts/benchmark-skills.mjs --mode fallback
node scripts/benchmark-skills.mjs --mode daytona
```

Artifacts are written to:

- `benchmarks/runs/<date>-<mode>/`

## Retrieval Demo

After local worker starts, run:

```bash
pnpm skills:demo
```

This calls `/api/skills/recommend` and verifies the expected CI hardening skill is returned.

## Deploy Metadata

`.env.example` defaults are already set for this repo:

- `PROJECT_ID=skill`
- `PROJECT_NAME="Every Skill"`
- `PROJECT_DOMAIN=https://skill.justevery.com`
- `APP_URL=https://skill.justevery.com/app`

Worker route metadata is configured in:

- `workers/api/wrangler.toml`
- `workers/api/wrangler.toml.template`

