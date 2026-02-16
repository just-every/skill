# Skills Benchmark Plan

This plan replaces the current placeholder skill store with a benchmark-native platform built around:

`Task -> Benchmark -> Skill -> Trial`

The goal is to evaluate real skill effectiveness for CLI agents (Codex CLI, Claude Code, and others) under reproducible, auditable conditions.

## Goals

- Build a single evaluation architecture that supports public benchmarks and custom benchmarks.
- Measure skill selection and skill execution separately.
- Compare baseline agent behavior versus skills-enabled behavior for every benchmark.
- Prefer deterministic grading from final system state; use rubric judging only when deterministic checks are insufficient.
- Report quality, safety, reliability, latency, and cost with uncertainty (multi-trial confidence intervals).

## Non-goals (v1)

- No public marketplace or ranking product UI changes beyond current catalog pages.
- No model training/fine-tuning loop.
- No broad internet-enabled runs by default.

## Why the Current Skill Store Is a Placeholder

The existing store is useful for demo/retrieval UX, but it is not a general benchmark system.

- It enforces fixed corpus and score counts in API integrity checks (`50 skills`, `3 runs`, `150 scores`) in `workers/api/src/skills.ts`.
- It is heavily seed-driven via migrations (`0007` to `0009`) with static benchmark assumptions.
- It validates marker strings and Daytona-only mode, but does not model per-case benchmark metadata, repeated trials, or confidence intervals.
- It exposes one catalog shape rather than a true `task -> benchmark -> skill -> trial` graph.

## Replacement Architecture

### 1) Canonical entities

- `tasks`: user goals such as `design-homepage`, `secure-backend`, `push-to-git`, `debug-react-error`.
- `benchmarks`: concrete evaluation suites mapped to a task (public or custom).
- `benchmark_cases`: one runnable case with pinned environment, instructions, timeout, oracle/scorer.
- `skills`: reusable capability packages (`SKILL.md`, scripts, references, constraints).
- `skill_task_fit`: expected applicability of a skill to a task (primary, secondary, disallowed).
- `trials`: one execution of a `(benchmark_case, skill_mode, cli, model, seed)`.
- `trial_events`: structured trace events (commands, tool calls, safety flags, failures).
- `trial_scores`: deterministic outcome score, side-effect score, efficiency score, optional rubric score.

### 2) Evaluation modes

- `baseline`: no skills enabled.
- `oracle_skill`: correct skill preselected.
- `library_selection`: full skill library enabled; agent must choose skill(s).

### 3) Benchmark lanes

- Interactive CLI lane (primary): Terminal-Bench/SkillsBench-style tasks in deterministic containers.
- NL-to-shell lane (secondary): command-level tasks scored by functional equivalence where needed.

### 4) Harness contract (Harbor-compatible)

- Each case includes instruction, pinned Docker image, deterministic tests, oracle solution, and time budget.
- Offline-by-default execution; explicit allowlist required for network.
- Final-state verification is authoritative; trace checks provide behavioral diagnostics.

### 5) Scoring layers

- Layer A: deterministic correctness checks (`pytest`, `npm test`, schema/file invariants, state diff).
- Layer B: behavior checks (trigger/no-trigger correctness, forbidden commands, thrash/tool-call inflation).
- Layer C: rubric checks only when deterministic checks cannot represent the requirement.

## Public Benchmark Intake Strategy

Use public suites where coverage exists, and add custom cases for gaps.

- Primary interactive anchors: Terminal-Bench, SkillsBench, SWE-bench variants.
- Complementary workflow suites: CompileBench, EnvBench, Multi-Docker-Eval, CSR-Bench.
- Command-level equivalence suites: NL2Bash and NL2SH-ALFA style evaluations.

Each imported benchmark must carry:

- Source, version/date, license, redistribution terms.
- Reproducibility metadata (container digest, dependency lock, offline policy).
- Mapping to internal `task_id` and risk class.

## Skill Contract (Required for evaluation)

Every skill must declare:

- Trigger conditions.
- Non-trigger conditions.
- Definition of done.
- Allowed tools and forbidden actions.
- Expected artifacts.

Every skill gets an invocation set:

- Explicit prompts.
- Implicit prompts.
- Noisy/paraphrased prompts.
- Negative controls.

Metrics:

- Trigger precision/recall.
- False-trigger rate.
- Success delta versus baseline.
- Cost/time/tool-call deltas.

## Migration Plan: Placeholder Store -> Benchmark-Native Store

### Phase 1: Parallel schema and ingest

- Add new benchmark-native tables without removing existing tables.
- Build importers for public benchmark metadata and custom benchmark case specs.
- Keep current `/api/skills` responses stable while backfilling from the new tables.

### Phase 2: Dual-run recommendation backend

- Compute recommendation scores from both systems in shadow mode.
- Compare ranking agreement and benchmark-grounded improvements.
- Gate switch-over on quality and stability thresholds.

### Phase 3: API switchover

- Make benchmark-native store the source of truth.
- Remove hardcoded fixed-count assumptions from integrity checks.
- Keep compatibility fields in API responses; add richer benchmark provenance and trial stats.

### Phase 4: Cleanup

- Retire seed-only placeholder assumptions.
- Keep migrations and artifacts required for historical reproducibility.
- Update docs and runbooks to the new benchmark workflow.

## Initial v1 Scope

- Tasks: `design-homepage`, `secure-backend`, `push-to-git`, `debug-react-error`.
- Skills: 10-15 high-value skills mapped to those tasks.
- Cases: 12-20 benchmark cases total.
- Trials: 5 trials per case and mode.
- CLIs: Codex CLI + Claude Code in identical sandbox policies.

## Success Criteria

- Reproducible runs (same seed/env -> same scorer output, within defined tolerance).
- Deterministic checks cover most pass/fail decisions.
- Clear and positive `with-skill vs baseline` deltas for at least half of candidate skills.
- Safety violations are measurable and trend downward as skills improve.
- Catalog and recommendation endpoints remain backward-compatible during migration.

## Operational Notes

- Keep deployments routed through `scripts/deploy.sh` as the single deploy entry point.
- Keep benchmark artifacts versioned and auditable.
- Treat benchmark leakage and licensing non-compliance as release blockers.
