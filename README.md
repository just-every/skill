# @just-every/skill

Every Skill is a benchmarked skill catalog platform with a companion starter-kit
installer for CLI apps.

- Domain: `https://skill.justevery.com`
- Project ID: `skill`
- Stack: Cloudflare Worker (`workers/api`) + Expo web (`apps/web`) + installer CLI (`src/cli.js`)

## What this repo ships

- Public site with a task-to-skill retrieval demo (`/skills`)
- Worker API for cataloging and recommending skills (`/api/skills/*`)
- Seeded curated skills + reproducible benchmark artifacts
- `every-skill` CLI to install curated skills into supported clients

## Quick start

```bash
pnpm install
pnpm bootstrap:env
pnpm dev
```

Local endpoints:

- `http://127.0.0.1:19006` (web)
- `http://127.0.0.1:9788/api/skills` (API)

## Skill API

- `GET /api/skills`
- `GET /api/skills/tasks`
- `GET /api/skills/benchmarks`
- `GET /api/skills/:slug`
- `POST /api/skills/recommend`

Example request body:

```json
{ "task": "...", "agent": "codex|claude|gemini" }
```

## Benchmarks and imports

```bash
pnpm skills:import
pnpm skills:benchmark
pnpm skills:demo
```

- Curated import output: `benchmarks/imports/openai-curated-skills.json`
- Benchmark runs output: `benchmarks/runs/<date>-<mode>/`

Modes for `scripts/benchmark-skills.mjs`:

- `auto` (default): use Daytona when available, otherwise deterministic fallback
- `daytona`: requires `DAYTONA_API_KEY`
- `fallback`: deterministic local artifact generation

## Installer CLI

Install the starter kit:

```bash
npx -y @just-every/skill@latest install
```

Available commands:

- `install`
- `remove`
- `list`
- `create`

Examples:

```bash
npx -y @just-every/skill@latest list
npx -y @just-every/skill@latest remove --kit starter
npx -y @just-every/skill@latest create my-skill --description "What this skill does"
```

## Install path variables

`SKILL.md` templates support:

- `{{SKILL_DIR}}`
- `{{SKILL_NAME}}`
- `{{SKILLS_ROOT}}`
- `{{CLIENT_NAME}}`

## Deploy metadata

`.env.example` defaults:

- `PROJECT_ID=skill`
- `PROJECT_NAME="Every Skill"`
- `PROJECT_DOMAIN=https://skill.justevery.com`
- `APP_URL=https://skill.justevery.com/app`

Worker route metadata:

- `workers/api/wrangler.toml`
- `workers/api/wrangler.toml.template`
