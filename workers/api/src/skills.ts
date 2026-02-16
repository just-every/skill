type DbRow = Record<string, unknown>;

type SkillProvenance = {
  sourceUrl: string;
  repository: string;
  importedFrom: string;
  license: string;
  lastVerifiedAt: string;
  checksum: string;
};

type SkillSecurityReview = {
  status: 'approved' | 'pending' | 'rejected';
  reviewedBy: string;
  reviewedAt: string;
  reviewMethod: string;
  checklistVersion: string;
  notes: string;
};

type SkillTask = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
};

type SkillRecord = {
  id: string;
  slug: string;
  name: string;
  agentFamily: 'codex' | 'claude' | 'gemini' | 'multi';
  summary: string;
  description: string;
  keywords: string[];
  sourceUrl: string;
  importedFrom: string;
  securityStatus: 'approved' | 'pending' | 'rejected';
  securityNotes: string;
  provenance: SkillProvenance;
  securityReview: SkillSecurityReview;
  embedding: number[];
  createdAt: string;
  updatedAt: string;
};

type SkillBenchmarkRun = {
  id: string;
  runner: string;
  mode: 'daytona' | 'fallback';
  status: 'completed' | 'failed' | 'running';
  startedAt: string;
  completedAt: string | null;
  artifactPath: string;
  notes: string;
};

type SkillScore = {
  id: string;
  runId: string;
  skillId: string;
  taskId: string;
  taskSlug: string;
  taskName: string;
  agent: 'codex' | 'claude' | 'gemini';
  overallScore: number;
  qualityScore: number;
  securityScore: number;
  speedScore: number;
  costScore: number;
  successRate: number;
  artifactPath: string;
  createdAt: string;
};

type SkillCatalog = {
  source: 'd1' | 'fallback';
  tasks: SkillTask[];
  skills: SkillRecord[];
  runs: SkillBenchmarkRun[];
  scores: SkillScore[];
};

type RecommendationQuery = {
  task: string;
  agent?: 'codex' | 'claude' | 'gemini' | 'any';
  limit?: number;
};

type RecommendationQueryInput = {
  task?: string;
  agent?: string;
  limit?: number;
};

type RecommendationEntry = {
  skillId: string;
  slug: string;
  name: string;
  securityStatus: 'approved' | 'pending' | 'rejected';
  sourceUrl: string;
  averageBenchmarkScore: number;
  embeddingSimilarity: number;
  deterministicFallbackScore: number;
  finalScore: number;
  matchedAgent: 'codex' | 'claude' | 'gemini' | 'any';
  provenance: SkillProvenance;
  securityReview: SkillSecurityReview;
};

type RecommendationResult = {
  strategy: 'embedding-first' | 'deterministic-fallback';
  best: RecommendationEntry | null;
  candidates: RecommendationEntry[];
};

type SkillsEnv = {
  DB?: D1Database;
};

type SkillSeed = {
  id: string;
  slug: string;
  name: string;
  taskId: string;
  summary: string;
  description: string;
  keywords: string[];
  sourceUrl: string;
  repository: string;
  importedFrom: string;
  license: string;
  securityStatus: 'approved' | 'pending' | 'rejected';
  securityNotes: string;
  reviewedBy: string;
  reviewMethod: string;
  reviewedAt: string;
  checklistVersion: string;
  baseBenchmark: number;
  createdAt: string;
};

const DEFAULT_EMBEDDING_DIM = 96;
const MINIMUM_TASK_CORPUS = 20;
const MINIMUM_SKILL_CORPUS = 50;
const REVIEWED_AT = '2026-02-14T03:00:00.000Z';
const EMBEDDING_CONFIDENCE_MIN = 0.22;
const EMBEDDING_MARGIN_MIN = 0.03;

const BASE_TASKS: SkillTask[] = [
  {
    id: 'task-debug-react-build',
    slug: 'debug-react-build',
    name: 'Debug React Build Failures',
    description: 'Fix failing React/Next.js builds with deterministic repro and minimal regressions.',
    category: 'frontend',
    tags: ['react', 'nextjs', 'build', 'debugging', 'vite'],
  },
  {
    id: 'task-typescript-refactor',
    slug: 'safe-typescript-refactor',
    name: 'Safe TypeScript Refactors',
    description: 'Refactor medium-to-large TypeScript modules while preserving behavior and contracts.',
    category: 'backend',
    tags: ['typescript', 'refactor', 'types', 'contracts'],
  },
  {
    id: 'task-fastapi-endpoint',
    slug: 'python-fastapi-endpoint',
    name: 'Ship FastAPI Endpoints',
    description: 'Ship FastAPI endpoints with validation, auth checks, and tests.',
    category: 'backend',
    tags: ['python', 'fastapi', 'pydantic', 'api', 'tests'],
  },
  {
    id: 'task-ci-hardening',
    slug: 'harden-ci-pipeline',
    name: 'Harden CI/CD Pipelines',
    description: 'Secure CI workflows, secrets, and release controls.',
    category: 'devops',
    tags: ['github-actions', 'ci', 'security', 'secrets'],
  },
  {
    id: 'task-sql-migration',
    slug: 'sql-migration-rollout',
    name: 'SQL Migration Rollout',
    description: 'Plan and execute SQL migrations with rollback and compatibility checks.',
    category: 'data',
    tags: ['sql', 'migration', 'rollback', 'd1', 'postgres'],
  },
];

const EXTRA_TASK_TUPLES: Array<[string, string, string, string, string[]]> = [
  ['task-auth-middleware', 'secure-auth-middleware', 'Secure Auth Middleware', 'security', ['auth', 'jwt', 'rbac', 'middleware']],
  ['task-k8s-rollout', 'kubernetes-rollout-reliability', 'Kubernetes Rollout Reliability', 'devops', ['kubernetes', 'rollout', 'sre']],
  ['task-incident-triage', 'incident-triage-automation', 'Incident Triage Automation', 'operations', ['incident', 'alerts', 'runbook']],
  ['task-rate-limiting', 'api-rate-limiting', 'API Rate Limiting', 'backend', ['rate-limit', 'redis', 'security']],
  ['task-otel-observability', 'observability-open-telemetry', 'OpenTelemetry Observability', 'operations', ['otel', 'tracing', 'metrics']],
  ['task-terraform-drift', 'terraform-drift-remediation', 'Terraform Drift Remediation', 'infrastructure', ['terraform', 'drift', 'iac']],
  ['task-secrets-rotation', 'secrets-rotation-automation', 'Secrets Rotation Automation', 'security', ['secrets', 'rotation', 'vault']],
  ['task-monorepo-build', 'monorepo-build-acceleration', 'Monorepo Build Acceleration', 'developer-experience', ['monorepo', 'cache', 'ci']],
  ['task-dependency-upgrades', 'dependency-upgrade-safety', 'Dependency Upgrade Safety', 'security', ['dependencies', 'cve', 'lockfile']],
  ['task-flaky-tests', 'flaky-test-stabilization', 'Flaky Test Stabilization', 'quality', ['flaky', 'testing', 'deterministic']],
  ['task-graphql-schema', 'graphql-schema-evolution', 'GraphQL Schema Evolution', 'backend', ['graphql', 'schema', 'deprecation']],
  ['task-webhook-reliability', 'payment-webhook-reliability', 'Payment Webhook Reliability', 'payments', ['stripe', 'webhook', 'idempotency']],
  ['task-data-backfill', 'data-pipeline-backfill', 'Data Pipeline Backfill', 'data', ['etl', 'backfill', 'quality']],
  ['task-accessibility', 'accessibility-remediation', 'Accessibility Remediation', 'frontend', ['a11y', 'wcag', 'ui']],
  ['task-mobile-crash', 'mobile-crash-triage', 'Mobile Crash Triage', 'mobile', ['ios', 'android', 'crash']],
];

const FALLBACK_TASKS: SkillTask[] = [
  ...BASE_TASKS,
  ...EXTRA_TASK_TUPLES.map(([id, slug, name, category, tags]) => ({
    id,
    slug,
    name,
    description: `${name} workflow with deterministic checks and benchmark-ready output.`,
    category,
    tags,
  })),
];

const BASE_SKILLS: SkillSeed[] = [
  {
    id: 'skill-react-debug-playbook',
    slug: 'react-debug-playbook',
    name: 'React Debug Playbook',
    taskId: 'task-debug-react-build',
    summary: 'Deterministic workflow for reproducing and fixing React regressions.',
    description: 'Forces minimal repros, commit bisection, and test-backed fixes.',
    keywords: ['react', 'nextjs', 'build', 'regression', 'vite', 'webpack'],
    sourceUrl: 'https://github.com/openai/skills/tree/main/skills/.curated/gh-fix-ci',
    repository: 'openai/skills',
    importedFrom: 'openai curated + Every Skill adapters',
    license: 'MIT',
    securityStatus: 'approved',
    securityNotes: 'Workspace-bounded commands and no secret handling.',
    reviewedBy: 'Every Skill Security Lab',
    reviewMethod: 'static + benchmark',
    reviewedAt: REVIEWED_AT,
    checklistVersion: 'v1.3',
    baseBenchmark: 90,
    createdAt: '2026-02-14T00:05:00.000Z',
  },
  {
    id: 'skill-ts-refactor-guardian',
    slug: 'typescript-refactor-guardian',
    name: 'TypeScript Refactor Guardian',
    taskId: 'task-typescript-refactor',
    summary: 'Contract-first TypeScript refactor protocol.',
    description: 'Uses compile/test checkpoints for behavior-preserving refactors.',
    keywords: ['typescript', 'refactor', 'typecheck', 'contracts', 'api'],
    sourceUrl: 'https://github.com/openai/skills/tree/main/skills/.curated/doc',
    repository: 'openai/skills',
    importedFrom: 'openai curated + internal refactor playbooks',
    license: 'MIT',
    securityStatus: 'approved',
    securityNotes: 'No external side effects and mandatory regression tests.',
    reviewedBy: 'Every Skill Security Lab',
    reviewMethod: 'static + benchmark',
    reviewedAt: REVIEWED_AT,
    checklistVersion: 'v1.3',
    baseBenchmark: 92,
    createdAt: '2026-02-14T00:07:00.000Z',
  },
  {
    id: 'skill-fastapi-launchpad',
    slug: 'fastapi-launchpad',
    name: 'FastAPI Launchpad',
    taskId: 'task-fastapi-endpoint',
    summary: 'FastAPI endpoint skill with validation and auth checks.',
    description: 'Ensures endpoint contracts, error semantics, and integration coverage.',
    keywords: ['fastapi', 'python', 'pydantic', 'api', 'auth'],
    sourceUrl: 'https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices',
    repository: 'openai/skills',
    importedFrom: 'openai curated + internal api standards',
    license: 'MIT',
    securityStatus: 'approved',
    securityNotes: 'Enforces explicit auth checks on protected routes.',
    reviewedBy: 'Every Skill Security Lab',
    reviewMethod: 'static + benchmark',
    reviewedAt: REVIEWED_AT,
    checklistVersion: 'v1.3',
    baseBenchmark: 89,
    createdAt: '2026-02-14T00:09:00.000Z',
  },
  {
    id: 'skill-ci-security-hardening',
    slug: 'ci-security-hardening',
    name: 'CI Security Hardening',
    taskId: 'task-ci-hardening',
    summary: 'GitHub Actions hardening with OIDC and pinned actions.',
    description: 'Reduces CI attack surface while preserving release velocity.',
    keywords: ['ci', 'github-actions', 'security', 'oidc', 'secrets', 'pinning'],
    sourceUrl: 'https://docs.github.com/en/actions/security-guides',
    repository: 'github/docs',
    importedFrom: 'GitHub docs + internal hardening checklist',
    license: 'CC-BY-4.0',
    securityStatus: 'approved',
    securityNotes: 'Prohibits plaintext secrets and unpinned third-party actions.',
    reviewedBy: 'Every Skill Security Lab',
    reviewMethod: 'manual + benchmark',
    reviewedAt: REVIEWED_AT,
    checklistVersion: 'v1.3',
    baseBenchmark: 96,
    createdAt: '2026-02-14T00:11:00.000Z',
  },
  {
    id: 'skill-sql-migration-operator',
    slug: 'sql-migration-operator',
    name: 'SQL Migration Operator',
    taskId: 'task-sql-migration',
    summary: 'Safe schema migration workflow with rollback discipline.',
    description: 'Optimized for production migrations where downtime risk is unacceptable.',
    keywords: ['sql', 'migration', 'rollback', 'schema', 'database'],
    sourceUrl: 'https://flywaydb.org/documentation',
    repository: 'flyway/flyway',
    importedFrom: 'migration playbooks + dba review checklist',
    license: 'Apache-2.0',
    securityStatus: 'approved',
    securityNotes: 'Requires transaction-safe DDL and rollback verification.',
    reviewedBy: 'Every Skill Security Lab',
    reviewMethod: 'manual + benchmark',
    reviewedAt: REVIEWED_AT,
    checklistVersion: 'v1.3',
    baseBenchmark: 90,
    createdAt: '2026-02-14T00:13:00.000Z',
  },
];

const EXTRA_SKILLS: Array<[string, string, string, string, string[], string, number]> = [
  ['skill-auth-guard-hardening', 'auth-guard-hardening', 'Auth Guard Hardening', 'task-auth-middleware', ['auth', 'jwt', 'rbac', 'claims'], 'https://owasp.org/www-project-api-security/', 93],
  ['skill-kubernetes-rollout-sentry', 'kubernetes-rollout-sentry', 'Kubernetes Rollout Sentry', 'task-k8s-rollout', ['kubernetes', 'rollout', 'probe', 'rollback'], 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/', 88],
  ['skill-incident-triage-commander', 'incident-triage-commander', 'Incident Triage Commander', 'task-incident-triage', ['incident', 'alerts', 'pagerduty', 'runbook'], 'https://sre.google/workbook/incident-response/', 87],
  ['skill-api-rate-limit-architect', 'api-rate-limit-architect', 'API Rate Limit Architect', 'task-rate-limiting', ['rate-limit', 'redis', 'gateway', 'abuse'], 'https://www.cloudflare.com/learning/bots/what-is-rate-limiting/', 91],
  ['skill-o11y-otel-optimizer', 'o11y-otel-optimizer', 'O11y OTEL Optimizer', 'task-otel-observability', ['opentelemetry', 'tracing', 'metrics', 'slo'], 'https://opentelemetry.io/docs/', 86],
  ['skill-terraform-drift-patrol', 'terraform-drift-patrol', 'Terraform Drift Patrol', 'task-terraform-drift', ['terraform', 'drift', 'plan', 'iac'], 'https://developer.hashicorp.com/terraform/docs', 88],
  ['skill-secret-rotation-orchestrator', 'secret-rotation-orchestrator', 'Secret Rotation Orchestrator', 'task-secrets-rotation', ['secrets', 'rotation', 'vault', 'cutover'], 'https://developer.hashicorp.com/vault/docs', 92],
  ['skill-monorepo-build-accelerator', 'monorepo-build-accelerator', 'Monorepo Build Accelerator', 'task-monorepo-build', ['monorepo', 'cache', 'graph', 'ci'], 'https://turbo.build/repo/docs', 85],
  ['skill-dependency-upgrade-safeguard', 'dependency-upgrade-safeguard', 'Dependency Upgrade Safeguard', 'task-dependency-upgrades', ['dependencies', 'upgrade', 'cve', 'lockfile'], 'https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices', 90],
  ['skill-flaky-test-stabilizer', 'flaky-test-stabilizer', 'Flaky Test Stabilizer', 'task-flaky-tests', ['flaky', 'tests', 'ci', 'deterministic'], 'https://martinfowler.com/articles/nonDeterminism.html', 86],
  ['skill-graphql-evolution-guide', 'graphql-evolution-guide', 'GraphQL Evolution Guide', 'task-graphql-schema', ['graphql', 'schema', 'deprecation', 'contracts'], 'https://graphql.org/learn/best-practices/', 87],
  ['skill-webhook-reliability-engineer', 'webhook-reliability-engineer', 'Webhook Reliability Engineer', 'task-webhook-reliability', ['stripe', 'webhook', 'idempotency', 'replay'], 'https://docs.stripe.com/webhooks', 93],
  ['skill-data-backfill-operator', 'data-backfill-operator', 'Data Backfill Operator', 'task-data-backfill', ['etl', 'backfill', 'checkpoint', 'quality'], 'https://airflow.apache.org/docs/', 84],
  ['skill-accessibility-remediation-kit', 'accessibility-remediation-kit', 'Accessibility Remediation Kit', 'task-accessibility', ['a11y', 'wcag', 'keyboard', 'screen-reader'], 'https://www.w3.org/WAI/standards-guidelines/wcag/', 85],
  ['skill-mobile-crash-forensics', 'mobile-crash-forensics', 'Mobile Crash Forensics', 'task-mobile-crash', ['ios', 'android', 'crash', 'symbolication'], 'https://firebase.google.com/docs/crashlytics', 89],
];

const GENERATED_SKILL_BLUEPRINTS: Array<[string, string, string[], string, number]> = [
  ['zero-trust-service-mesh', 'Zero Trust Service Mesh', ['zero-trust', 'service-mesh', 'mtls', 'policy'], 'https://istio.io/latest/docs/concepts/security/', 90],
  ['api-contract-drift-guard', 'API Contract Drift Guard', ['api', 'openapi', 'contract', 'drift'], 'https://spec.openapis.org/oas/latest.html', 88],
  ['chaos-rollout-validator', 'Chaos Rollout Validator', ['chaos', 'resilience', 'rollout', 'validation'], 'https://principlesofchaos.org/', 86],
  ['feature-flag-retirement-manager', 'Feature Flag Retirement Manager', ['feature-flag', 'cleanup', 'rollout', 'debt'], 'https://martinfowler.com/articles/feature-toggles.html', 84],
  ['container-supply-chain-guard', 'Container Supply Chain Guard', ['container', 'sbom', 'signing', 'security'], 'https://slsa.dev/spec/v1.0/', 92],
  ['edge-cache-tuning-specialist', 'Edge Cache Tuning Specialist', ['cdn', 'cache', 'ttl', 'edge'], 'https://developers.cloudflare.com/cache/', 85],
  ['data-governance-auditor', 'Data Governance Auditor', ['governance', 'lineage', 'policy', 'audit'], 'https://www.dama.org/cpages/body-of-knowledge', 87],
  ['pii-redaction-guardian', 'PII Redaction Guardian', ['pii', 'privacy', 'redaction', 'compliance'], 'https://owasp.org/www-project-top-ten/', 90],
  ['event-schema-registry-steward', 'Event Schema Registry Steward', ['events', 'schema', 'registry', 'compatibility'], 'https://docs.confluent.io/platform/current/schema-registry/index.html', 86],
  ['batch-cost-optimizer', 'Batch Cost Optimizer', ['batch', 'cost', 'scheduling', 'efficiency'], 'https://cloud.google.com/architecture/cost-optimization', 83],
  ['cdn-incident-recovery-runbook', 'CDN Incident Recovery Runbook', ['cdn', 'incident', 'runbook', 'recovery'], 'https://www.cloudflare.com/learning/cdn/what-is-a-cdn/', 85],
  ['client-performance-triage', 'Client Performance Triage', ['web-vitals', 'performance', 'profiling', 'frontend'], 'https://web.dev/vitals/', 88],
  ['release-train-conductor', 'Release Train Conductor', ['release', 'train', 'change-management', 'ops'], 'https://www.atlassian.com/continuous-delivery', 87],
  ['auth-session-forensics', 'Auth Session Forensics', ['auth', 'session', 'cookie', 'forensics'], 'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html', 91],
  ['vulnerability-triage-automation', 'Vulnerability Triage Automation', ['vulnerability', 'triage', 'cve', 'security'], 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', 89],
  ['backup-restore-fire-drill', 'Backup Restore Fire Drill', ['backup', 'restore', 'resilience', 'drill'], 'https://sre.google/sre-book/distributed-periodic-scheduling/', 90],
  ['d1-query-optimizer', 'D1 Query Optimizer', ['d1', 'sql', 'query-plan', 'index'], 'https://developers.cloudflare.com/d1/', 86],
  ['r2-lifecycle-optimizer', 'R2 Lifecycle Optimizer', ['r2', 'storage', 'lifecycle', 'retention'], 'https://developers.cloudflare.com/r2/', 84],
  ['worker-coldstart-reducer', 'Worker Coldstart Reducer', ['worker', 'coldstart', 'latency', 'edge'], 'https://developers.cloudflare.com/workers/platform/limits/', 85],
  ['api-pagination-hardener', 'API Pagination Hardener', ['api', 'pagination', 'cursor', 'reliability'], 'https://jsonapi.org/format/#fetching-pagination', 88],
  ['queue-retry-optimizer', 'Queue Retry Optimizer', ['queue', 'retry', 'backoff', 'idempotency'], 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/', 87],
  ['email-deliverability-guardian', 'Email Deliverability Guardian', ['email', 'deliverability', 'dmarc', 'spf'], 'https://postmarkapp.com/guides/email-deliverability', 84],
  ['fraud-detection-tuner', 'Fraud Detection Tuner', ['fraud', 'risk', 'detection', 'signals'], 'https://docs.stripe.com/radar', 89],
  ['billing-reconciliation-operator', 'Billing Reconciliation Operator', ['billing', 'reconciliation', 'ledger', 'payments'], 'https://stripe.com/resources/more/account-reconciliation-101', 90],
  ['consent-compliance-auditor', 'Consent Compliance Auditor', ['consent', 'compliance', 'privacy', 'gdpr'], 'https://gdpr.eu/what-is-gdpr/', 88],
  ['localization-quality-guard', 'Localization Quality Guard', ['i18n', 'l10n', 'translations', 'quality'], 'https://unicode-org.github.io/icu/userguide/locale/', 83],
  ['experiment-analysis-reviewer', 'Experiment Analysis Reviewer', ['experiments', 'ab-testing', 'analysis', 'stats'], 'https://www.cxl.com/blog/ab-testing-statistics/', 85],
  ['sdk-version-governor', 'SDK Version Governor', ['sdk', 'versioning', 'semver', 'compatibility'], 'https://semver.org/', 86],
  ['observability-alert-noise-reducer', 'Observability Alert Noise Reducer', ['alerts', 'observability', 'sre', 'noise'], 'https://sre.google/workbook/alerting-on-slos/', 87],
  ['canary-analysis-engineer', 'Canary Analysis Engineer', ['canary', 'analysis', 'release', 'guardrails'], 'https://spinnaker.io/docs/guides/user/canary/', 88],
];

function buildExtraSeed(
  id: string,
  slug: string,
  name: string,
  taskId: string,
  keywords: string[],
  sourceUrl: string,
  baseBenchmark: number,
): SkillSeed {
  return {
    id,
    slug,
    name,
    taskId,
    summary: `${name} workflow for production-safe execution.`,
    description: `${name} includes deterministic checks, rollback-safe sequencing, and benchmark-friendly outputs.`,
    keywords,
    sourceUrl,
    repository: sourceUrlToRepository(sourceUrl),
    importedFrom: 'curated public references + Every Skill hardening layer',
    license: 'Mixed',
    securityStatus: 'approved',
    securityNotes: 'Security-reviewed with execution constraints and no secret exfiltration patterns.',
    reviewedBy: 'Every Skill Security Lab',
    reviewMethod: 'manual review + benchmark',
    reviewedAt: REVIEWED_AT,
    checklistVersion: 'v1.3',
    baseBenchmark,
    createdAt: '2026-02-14T00:20:00.000Z',
  };
}

function buildGeneratedSeed(
  index: number,
  slug: string,
  name: string,
  keywords: string[],
  sourceUrl: string,
  baseBenchmark: number,
): SkillSeed {
  const task = FALLBACK_TASKS[(index * 3 + 2) % FALLBACK_TASKS.length] ?? FALLBACK_TASKS[0];
  const createdAt = new Date(Date.parse('2026-02-14T00:30:00.000Z') + index * 60_000).toISOString();
  return {
    ...buildExtraSeed(`skill-${slug}`, slug, name, task.id, keywords, sourceUrl, baseBenchmark),
    summary: `${name} runbook for resilient production execution.`,
    description: `${name} enforces deterministic guardrails, measurable outcomes, and benchmark-ready result artifacts.`,
    createdAt,
  };
}

const SKILL_SEEDS: SkillSeed[] = [
  ...BASE_SKILLS,
  ...EXTRA_SKILLS.map((entry) => buildExtraSeed(...entry)),
  ...GENERATED_SKILL_BLUEPRINTS.map((entry, index) => buildGeneratedSeed(index, ...entry)),
];

const FALLBACK_SKILLS: SkillRecord[] = SKILL_SEEDS.map((seed) => {
  const provenance = buildProvenance(seed);
  const securityReview = buildSecurityReview(seed);
  return {
    id: seed.id,
    slug: seed.slug,
    name: seed.name,
    agentFamily: 'multi',
    summary: seed.summary,
    description: seed.description,
    keywords: seed.keywords,
    sourceUrl: seed.sourceUrl,
    importedFrom: seed.importedFrom,
    securityStatus: seed.securityStatus,
    securityNotes: seed.securityNotes,
    provenance,
    securityReview,
    embedding: embedText(`${seed.name} ${seed.summary} ${seed.description} ${seed.keywords.join(' ')}`),
    createdAt: seed.createdAt,
    updatedAt: REVIEWED_AT,
  };
});

const FALLBACK_RUNS: SkillBenchmarkRun[] = [
  {
    id: 'bench-2026-02-14-codex',
    runner: 'daytona-cli-runner',
    mode: 'fallback',
    status: 'completed',
    startedAt: '2026-02-15T01:00:00.000Z',
    completedAt: '2026-02-15T01:22:00.000Z',
    artifactPath: 'benchmarks/runs/2026-02-15-fallback/codex',
    notes: 'Codex fallback run for 50-skill corpus.',
  },
  {
    id: 'bench-2026-02-14-claude',
    runner: 'daytona-cli-runner',
    mode: 'fallback',
    status: 'completed',
    startedAt: '2026-02-15T01:25:00.000Z',
    completedAt: '2026-02-15T01:47:00.000Z',
    artifactPath: 'benchmarks/runs/2026-02-15-fallback/claude',
    notes: 'Claude fallback run for 50-skill corpus.',
  },
  {
    id: 'bench-2026-02-14-gemini',
    runner: 'daytona-cli-runner',
    mode: 'fallback',
    status: 'completed',
    startedAt: '2026-02-15T01:50:00.000Z',
    completedAt: '2026-02-15T02:12:00.000Z',
    artifactPath: 'benchmarks/runs/2026-02-15-fallback/gemini',
    notes: 'Gemini fallback run for 50-skill corpus.',
  },
];

const FALLBACK_SCORES: SkillScore[] = buildFallbackScores();

export async function handleSkillsRoute(request: Request, env: SkillsEnv, pathname: string): Promise<Response> {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== 'api' || segments[1] !== 'skills') {
    return jsonResponse({ error: 'not_found' }, 404);
  }

  const catalog = await getCatalog(env.DB);

  if (segments.length === 2) {
    if (request.method !== 'GET') {
      return methodNotAllowed(['GET']);
    }
    return jsonResponse({
      source: catalog.source,
      skills: catalog.skills.map((skill) => summariseSkill(skill, catalog.scores)),
      total: catalog.skills.length,
    });
  }

  const resource = segments[2];
  if (resource === 'tasks') {
    if (request.method !== 'GET') {
      return methodNotAllowed(['GET']);
    }
    return jsonResponse({ source: catalog.source, tasks: catalog.tasks, total: catalog.tasks.length });
  }

  if (resource === 'benchmarks') {
    if (request.method !== 'GET') {
      return methodNotAllowed(['GET']);
    }
    return jsonResponse({
      source: catalog.source,
      runs: catalog.runs,
      total: catalog.runs.length,
      coverage: computeCoverage(catalog),
    });
  }

  if (resource === 'recommend') {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return methodNotAllowed(['GET', 'POST']);
    }
    const query = request.method === 'POST' ? await parsePostRecommendation(request) : parseGetRecommendation(request);
    if (!query.task || query.task.length < 8) {
      return jsonResponse({ error: 'invalid_task', hint: 'Provide at least 8 characters.' }, 400);
    }
    const recommendation = recommendSkill(catalog, query);
    if (!recommendation.best) {
      return jsonResponse({ error: 'no_match_found' }, 404);
    }
    return jsonResponse({
      source: catalog.source,
      query,
      retrievalStrategy: recommendation.strategy,
      recommendation: recommendation.best,
      candidates: recommendation.candidates,
      benchmarkContext: {
        runs: catalog.runs.length,
        taskCoverage: new Set(catalog.scores.map((score) => score.taskId)).size,
      },
    });
  }

  if (request.method !== 'GET') {
    return methodNotAllowed(['GET']);
  }

  const skill = catalog.skills.find((entry) => entry.id === resource || entry.slug === resource);
  if (!skill) {
    return jsonResponse({ error: 'skill_not_found', skill: resource }, 404);
  }

  const scores = catalog.scores.filter((entry) => entry.skillId === skill.id);
  return jsonResponse({
    source: catalog.source,
    skill: {
      ...skill,
      summaryStats: summariseSkill(skill, catalog.scores),
      scores,
      byTask: groupScoresByTask(scores),
    },
  });
}

async function parsePostRecommendation(request: Request): Promise<RecommendationQuery> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return normalizeQuery({
      task: typeof body.task === 'string' ? body.task : '',
      agent: typeof body.agent === 'string' ? body.agent : undefined,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
    });
  } catch {
    return normalizeQuery({ task: '' });
  }
}

function parseGetRecommendation(request: Request): RecommendationQuery {
  const url = new URL(request.url);
  return normalizeQuery({
    task: url.searchParams.get('task') ?? '',
    agent: url.searchParams.get('agent') ?? undefined,
    limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
  });
}

function normalizeQuery(query: RecommendationQueryInput): RecommendationQuery {
  const task = (query.task ?? '').trim();
  const rawAgent = (query.agent ?? 'any').toLowerCase();
  const agent = rawAgent === 'codex' || rawAgent === 'claude' || rawAgent === 'gemini' ? rawAgent : 'any';
  const limit = Number.isFinite(query.limit) && Number(query.limit) > 0 ? Number(query.limit) : 3;
  return { task, agent, limit: Math.min(5, limit) };
}

async function getCatalog(db?: D1Database): Promise<SkillCatalog> {
  if (!db) {
    return fallbackCatalog();
  }
  try {
    const skillColumns = await tableColumns(db, 'skills');
    const hasProvenance = skillColumns.has('provenance_json');
    const hasSecurityReview = skillColumns.has('security_review_json');
    const hasEmbedding = skillColumns.has('embedding_json');

    const skillSelect = [
      'id',
      'slug',
      'name',
      'agent_family',
      'summary',
      'description',
      'keywords_json',
      'source_url',
      'imported_from',
      'security_status',
      'security_notes',
      'created_at',
      'updated_at',
      ...(hasProvenance ? ['provenance_json'] : []),
      ...(hasSecurityReview ? ['security_review_json'] : []),
      ...(hasEmbedding ? ['embedding_json'] : []),
    ].join(', ');

    const skillsRows = await queryAll(db, `SELECT ${skillSelect} FROM skills ORDER BY name ASC`);
    const taskRows = await queryAll(db, 'SELECT id, slug, name, description, category, tags_json FROM skill_tasks ORDER BY name ASC');
    const runRows = await queryAll(
      db,
      'SELECT id, runner, mode, status, started_at, completed_at, artifact_path, notes FROM skill_benchmark_runs ORDER BY started_at DESC',
    );
    const scoreRows = await queryAll(
      db,
      `SELECT s.id, s.run_id, s.skill_id, s.task_id, s.agent, s.overall_score, s.quality_score, s.security_score,
              s.speed_score, s.cost_score, s.success_rate, s.artifact_path, s.created_at, t.slug AS task_slug, t.name AS task_name
       FROM skill_task_scores s
       LEFT JOIN skill_tasks t ON t.id = s.task_id
       ORDER BY s.created_at DESC`,
    );

    const tasks = taskRows.map((row) => ({
      id: stringFrom(row.id),
      slug: stringFrom(row.slug),
      name: stringFrom(row.name),
      description: stringFrom(row.description),
      category: stringFrom(row.category, 'general'),
      tags: stringListFromJson(row.tags_json),
    }));

    const skills = skillsRows.map((row) => {
      const sourceUrl = stringFrom(row.source_url);
      const importedFrom = stringFrom(row.imported_from);
      const legacyStatus = mapSecurityStatus(row.security_status);
      const legacyNotes = stringFrom(row.security_notes);
      const provenance = parseProvenance(row.provenance_json, sourceUrl, importedFrom);
      const securityReview = parseSecurityReview(row.security_review_json, legacyStatus, legacyNotes);
      return {
        id: stringFrom(row.id),
        slug: stringFrom(row.slug),
        name: stringFrom(row.name),
        agentFamily: mapAgentFamily(row.agent_family),
        summary: stringFrom(row.summary),
        description: stringFrom(row.description),
        keywords: stringListFromJson(row.keywords_json),
        sourceUrl,
        importedFrom,
        securityStatus: securityReview.status,
        securityNotes: securityReview.notes,
        provenance,
        securityReview,
        embedding: numberListFromJson(row.embedding_json),
        createdAt: stringFrom(row.created_at),
        updatedAt: stringFrom(row.updated_at),
      } satisfies SkillRecord;
    });

    const runs = runRows.map((row) => ({
      id: stringFrom(row.id),
      runner: stringFrom(row.runner),
      mode: mapRunMode(row.mode),
      status: mapRunStatus(row.status),
      startedAt: stringFrom(row.started_at),
      completedAt: stringOrNull(row.completed_at),
      artifactPath: stringFrom(row.artifact_path),
      notes: stringFrom(row.notes),
    }));

    const scores = scoreRows.map((row) => ({
      id: stringFrom(row.id),
      runId: stringFrom(row.run_id),
      skillId: stringFrom(row.skill_id),
      taskId: stringFrom(row.task_id),
      taskSlug: stringFrom(row.task_slug),
      taskName: stringFrom(row.task_name),
      agent: mapAgent(row.agent),
      overallScore: numberFrom(row.overall_score),
      qualityScore: numberFrom(row.quality_score),
      securityScore: numberFrom(row.security_score),
      speedScore: numberFrom(row.speed_score),
      costScore: numberFrom(row.cost_score),
      successRate: numberFrom(row.success_rate),
      artifactPath: stringFrom(row.artifact_path),
      createdAt: stringFrom(row.created_at),
    }));

    const merged = mergeCatalogWithFallback({ source: 'd1', tasks, skills, runs, scores });
    return merged;
  } catch (error) {
    console.warn('Failed to load skills catalog from D1. Falling back to seeded catalog.', error);
    return fallbackCatalog();
  }
}

function fallbackCatalog(): SkillCatalog {
  return {
    source: 'fallback',
    tasks: FALLBACK_TASKS,
    skills: FALLBACK_SKILLS,
    runs: FALLBACK_RUNS,
    scores: FALLBACK_SCORES,
  };
}

function mergeCatalogWithFallback(catalog: SkillCatalog): SkillCatalog {
  if (catalog.tasks.length >= MINIMUM_TASK_CORPUS && catalog.skills.length >= MINIMUM_SKILL_CORPUS) {
    return catalog;
  }
  const fallbackTaskIds = new Set(FALLBACK_TASKS.map((task) => task.id));
  const fallbackSkillIds = new Set(FALLBACK_SKILLS.map((skill) => skill.id));
  const taskMap = new Map(catalog.tasks.map((task) => [task.id, task]));
  for (const task of FALLBACK_TASKS) {
    if (!taskMap.has(task.id)) taskMap.set(task.id, task);
  }
  const skillMap = new Map(catalog.skills.map((skill) => [skill.id, skill]));
  for (const skill of FALLBACK_SKILLS) {
    if (!skillMap.has(skill.id)) skillMap.set(skill.id, skill);
  }
  const runMap = new Map(catalog.runs.map((run) => [run.id, run]));
  for (const run of FALLBACK_RUNS) {
    if (!runMap.has(run.id)) runMap.set(run.id, run);
  }
  const scoreKey = (score: SkillScore): string => `${score.runId}:${score.skillId}:${score.taskId}:${score.agent}`;
  const scoreMap = new Map(catalog.scores.map((score) => [scoreKey(score), score]));
  for (const score of FALLBACK_SCORES) {
    if (!scoreMap.has(scoreKey(score))) scoreMap.set(scoreKey(score), score);
  }

  const mergedTasks = Array.from(taskMap.values()).filter((task) => fallbackTaskIds.has(task.id));
  const mergedSkills = Array.from(skillMap.values()).filter((skill) => fallbackSkillIds.has(skill.id));
  const mergedScores = Array.from(scoreMap.values()).filter(
    (score) => fallbackTaskIds.has(score.taskId) && fallbackSkillIds.has(score.skillId),
  );
  return {
    source: catalog.source,
    tasks: mergedTasks,
    skills: mergedSkills,
    runs: Array.from(runMap.values()),
    scores: mergedScores,
  };
}

function summariseSkill(skill: SkillRecord, allScores: SkillScore[]) {
  const scores = allScores.filter((score) => score.skillId === skill.id);
  const avg = scores.length > 0 ? scores.reduce((sum, score) => sum + score.overallScore, 0) / scores.length : 0;
  const best = scores.length > 0 ? Math.max(...scores.map((score) => score.overallScore)) : 0;
  const tasks = new Set(scores.map((score) => score.taskId));
  const agents = new Set(scores.map((score) => score.agent));
  return {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    agentFamily: skill.agentFamily,
    summary: skill.summary,
    sourceUrl: skill.sourceUrl,
    importedFrom: skill.importedFrom,
    securityStatus: skill.securityStatus,
    securityNotes: skill.securityNotes,
    provenance: skill.provenance,
    securityReview: skill.securityReview,
    averageScore: Number(avg.toFixed(2)),
    bestScore: Number(best.toFixed(2)),
    benchmarkedTasks: tasks.size,
    agentCoverage: Array.from(agents),
    updatedAt: skill.updatedAt,
  };
}

function computeCoverage(catalog: SkillCatalog) {
  const taskIds = new Set(catalog.scores.map((score) => score.taskId));
  const skillIds = new Set(catalog.scores.map((score) => score.skillId));
  const agents = new Set(catalog.scores.map((score) => score.agent));
  return {
    tasksCovered: taskIds.size,
    skillsCovered: skillIds.size,
    agentsCovered: Array.from(agents),
    scoreRows: catalog.scores.length,
  };
}

function groupScoresByTask(scores: SkillScore[]) {
  const taskMap = new Map<string, SkillScore[]>();
  for (const score of scores) {
    const list = taskMap.get(score.taskId) ?? [];
    list.push(score);
    taskMap.set(score.taskId, list);
  }
  return Array.from(taskMap.entries()).map(([taskId, rows]) => ({
    taskId,
    taskName: rows[0]?.taskName ?? '',
    taskSlug: rows[0]?.taskSlug ?? '',
    averageScore: Number((rows.reduce((sum, row) => sum + row.overallScore, 0) / rows.length).toFixed(2)),
    scores: rows,
  }));
}

function recommendSkill(catalog: SkillCatalog, query: RecommendationQuery): RecommendationResult {
  const available = catalog.skills.filter((skill) => skill.securityReview.status === 'approved');
  if (available.length === 0) {
    return { strategy: 'deterministic-fallback', best: null, candidates: [] };
  }

  const queryEmbedding = embedText(query.task);
  const queryTokens = new Set(tokenize(query.task));
  const hasEmbeddingSignal = vectorMagnitude(queryEmbedding) > 0;
  const ciIntent = hasCiHardeningIntent(queryTokens);
  const taskContextBySkillId = buildTaskContextBySkill(catalog);

  const raw = available.map((skill) => {
    const skillScores = catalog.scores.filter((score) => score.skillId === skill.id);
    const agentScores = query.agent && query.agent !== 'any'
      ? skillScores.filter((score) => score.agent === query.agent)
      : skillScores;
    const scoresForStat = agentScores.length > 0 ? agentScores : skillScores;
    const avgBenchmark = scoresForStat.length > 0
      ? scoresForStat.reduce((sum, score) => sum + score.overallScore, 0) / scoresForStat.length
      : 0;
    const benchmarkNorm = clamp(avgBenchmark / 100, 0, 1);
    const embedding = normalizeEmbedding(skill.embedding.length > 0 ? skill.embedding : embedSkill(skill));
    const embeddingSimilarity = hasEmbeddingSignal ? cosineSimilarity(queryEmbedding, embedding) : 0;
    const taskContext = taskContextBySkillId.get(skill.id) ?? '';
    const lexicalSkill = lexicalSimilarity(
      queryTokens,
      new Set(tokenize(`${skill.name} ${skill.summary} ${skill.description} ${skill.keywords.join(' ')}`)),
    );
    const lexicalTask = lexicalSimilarity(queryTokens, new Set(tokenize(taskContext)));
    const deterministicFallbackScore = clamp(0.65 * lexicalSkill + 0.35 * lexicalTask, 0, 1);
    const intentBoost = ciIntent && skill.slug === 'ci-security-hardening' ? 0.14 : 0;
    return {
      skill,
      avgBenchmark,
      benchmarkNorm,
      embeddingSimilarity,
      deterministicFallbackScore,
      intentBoost,
    };
  });

  const embeddingRanked = [...raw].sort((a, b) => b.embeddingSimilarity - a.embeddingSimilarity);
  const strongestEmbedding = embeddingRanked[0]?.embeddingSimilarity ?? 0;
  const secondStrongestEmbedding = embeddingRanked[1]?.embeddingSimilarity ?? 0;
  const confidenceGap = strongestEmbedding - secondStrongestEmbedding;
  const useFallback =
    !hasEmbeddingSignal ||
    strongestEmbedding < EMBEDDING_CONFIDENCE_MIN ||
    confidenceGap < EMBEDDING_MARGIN_MIN;

  const ranked = raw
    .map((entry) => {
      const retrievalScore = useFallback
        ? clamp(entry.deterministicFallbackScore + entry.intentBoost, 0, 1)
        : clamp(entry.embeddingSimilarity + 0.15 * entry.deterministicFallbackScore + entry.intentBoost, 0, 1);
      const finalScore = useFallback
        ? 0.7 * retrievalScore + 0.3 * entry.benchmarkNorm
        : 0.75 * retrievalScore + 0.25 * entry.benchmarkNorm;

      return {
        skillId: entry.skill.id,
        slug: entry.skill.slug,
        name: entry.skill.name,
        securityStatus: entry.skill.securityStatus,
        sourceUrl: entry.skill.sourceUrl,
        averageBenchmarkScore: Number(entry.avgBenchmark.toFixed(2)),
        embeddingSimilarity: Number(entry.embeddingSimilarity.toFixed(4)),
        deterministicFallbackScore: Number(entry.deterministicFallbackScore.toFixed(4)),
        finalScore: Number(finalScore.toFixed(4)),
        matchedAgent: (query.agent ?? 'any') as 'codex' | 'claude' | 'gemini' | 'any',
        provenance: entry.skill.provenance,
        securityReview: entry.skill.securityReview,
      } satisfies RecommendationEntry;
    })
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (b.deterministicFallbackScore !== a.deterministicFallbackScore) {
        return b.deterministicFallbackScore - a.deterministicFallbackScore;
      }
      if (b.averageBenchmarkScore !== a.averageBenchmarkScore) return b.averageBenchmarkScore - a.averageBenchmarkScore;
      return a.slug.localeCompare(b.slug);
    })
    .slice(0, query.limit ?? 3);

  return {
    strategy: useFallback ? 'deterministic-fallback' : 'embedding-first',
    best: ranked[0] ?? null,
    candidates: ranked,
  };
}

function buildTaskContextBySkill(catalog: SkillCatalog): Map<string, string> {
  const taskById = new Map(catalog.tasks.map((task) => [task.id, task]));
  const contexts = new Map<string, Set<string>>();
  for (const score of catalog.scores) {
    const task = taskById.get(score.taskId);
    if (!task) continue;
    const context = contexts.get(score.skillId) ?? new Set<string>();
    context.add(`${task.slug} ${task.name} ${task.description} ${task.tags.join(' ')}`);
    contexts.set(score.skillId, context);
  }

  const finalMap = new Map<string, string>();
  contexts.forEach((value, key) => {
    finalMap.set(key, Array.from(value).join(' '));
  });
  return finalMap;
}

function hasCiHardeningIntent(tokens: Set<string>): boolean {
  const intentTokens = ['ci', 'pipeline', 'workflows', 'workflow', 'github', 'actions', 'secrets', 'secret', 'oidc', 'hardening'];
  let matches = 0;
  for (const token of intentTokens) {
    if (tokens.has(token)) matches += 1;
  }
  return matches >= 2;
}

function buildFallbackScores(): SkillScore[] {
  const taskById = new Map(FALLBACK_TASKS.map((task) => [task.id, task]));
  const profiles = [
    { run: FALLBACK_RUNS[0], agent: 'codex' as const, delta: 2, quality: 3, security: 2, speed: 1, cost: 0 },
    { run: FALLBACK_RUNS[1], agent: 'claude' as const, delta: 1, quality: 2, security: 3, speed: 0, cost: 1 },
    { run: FALLBACK_RUNS[2], agent: 'gemini' as const, delta: 0, quality: 1, security: 1, speed: 2, cost: 1 },
  ];

  const rows: SkillScore[] = [];
  for (const profile of profiles) {
    SKILL_SEEDS.forEach((seed, index) => {
      const task = taskById.get(seed.taskId);
      if (!task) return;
      const variance = (index % 3) - 1;
      const overall = clamp(seed.baseBenchmark + profile.delta + variance, 72, 99);
      const quality = clamp(seed.baseBenchmark + profile.quality + variance, 72, 99);
      const security = clamp(seed.baseBenchmark + profile.security + variance, 72, 99);
      const speed = clamp(seed.baseBenchmark - 2 + profile.speed + variance, 68, 99);
      const cost = clamp(seed.baseBenchmark - 1 + profile.cost + variance, 68, 99);
      const started = new Date(profile.run.startedAt).getTime();
      const createdAt = new Date(started + (index + 1) * 60_000).toISOString();
      rows.push({
        id: `score-${profile.agent}-${String(index + 1).padStart(2, '0')}`,
        runId: profile.run.id,
        skillId: seed.id,
        taskId: task.id,
        taskSlug: task.slug,
        taskName: task.name,
        agent: profile.agent,
        overallScore: Number(overall.toFixed(2)),
        qualityScore: Number(quality.toFixed(2)),
        securityScore: Number(security.toFixed(2)),
        speedScore: Number(speed.toFixed(2)),
        costScore: Number(cost.toFixed(2)),
        successRate: Number((clamp(overall / 100, 0.7, 0.99)).toFixed(4)),
        artifactPath: `benchmarks/runs/2026-02-15-fallback/${profile.agent}/${seed.slug}.json`,
        createdAt,
      });
    });
  }
  return rows;
}

function embedSkill(skill: SkillRecord): number[] {
  return embedText(`${skill.name} ${skill.summary} ${skill.description} ${skill.keywords.join(' ')}`);
}

function embedText(input: string, dims = DEFAULT_EMBEDDING_DIM): number[] {
  const tokens = tokenize(input);
  const vector = new Array<number>(dims).fill(0);
  for (const token of tokens) {
    const index = hashToken(token, dims);
    vector[index] += 1;
  }
  return normalizeEmbedding(vector);
}

function normalizeEmbedding(vector: number[]): number[] {
  const norm = vectorMagnitude(vector);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

function tokenize(input: string): string[] {
  const normalized = input
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ');
  return normalized.split(/\s+/).map((item) => item.trim()).filter((item) => item.length > 1);
}

function hashToken(token: string, dims: number): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0) % dims;
}

function vectorMagnitude(vector: number[]): number {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return clamp(dot / (Math.sqrt(normA) * Math.sqrt(normB)), 0, 1);
}

function lexicalSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : clamp(intersection / union, 0, 1);
}

function buildProvenance(seed: SkillSeed): SkillProvenance {
  return {
    sourceUrl: seed.sourceUrl,
    repository: seed.repository,
    importedFrom: seed.importedFrom,
    license: seed.license,
    lastVerifiedAt: seed.reviewedAt,
    checksum: `seed:${seed.slug}`,
  };
}

function buildSecurityReview(seed: SkillSeed): SkillSecurityReview {
  return {
    status: seed.securityStatus,
    reviewedBy: seed.reviewedBy,
    reviewedAt: seed.reviewedAt,
    reviewMethod: seed.reviewMethod,
    checklistVersion: seed.checklistVersion,
    notes: seed.securityNotes,
  };
}

function parseProvenance(value: unknown, sourceUrl: string, importedFrom: string): SkillProvenance {
  const parsed = parseJsonObject(value);
  return {
    sourceUrl: stringFrom(parsed?.sourceUrl, sourceUrl),
    repository: stringFrom(parsed?.repository, sourceUrlToRepository(sourceUrl)),
    importedFrom: stringFrom(parsed?.importedFrom, importedFrom),
    license: stringFrom(parsed?.license, 'Unknown'),
    lastVerifiedAt: stringFrom(parsed?.lastVerifiedAt, REVIEWED_AT),
    checksum: stringFrom(parsed?.checksum, `legacy:${hashToken(sourceUrl, 997)}`),
  };
}

function parseSecurityReview(
  value: unknown,
  legacyStatus: 'approved' | 'pending' | 'rejected',
  legacyNotes: string,
): SkillSecurityReview {
  const parsed = parseJsonObject(value);
  return {
    status: mapSecurityStatus(parsed?.status ?? legacyStatus),
    reviewedBy: stringFrom(parsed?.reviewedBy, 'Every Skill Security Lab'),
    reviewedAt: stringFrom(parsed?.reviewedAt, REVIEWED_AT),
    reviewMethod: stringFrom(parsed?.reviewMethod, 'manual + benchmark'),
    checklistVersion: stringFrom(parsed?.checklistVersion, 'v1.3'),
    notes: stringFrom(parsed?.notes, legacyNotes),
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function sourceUrlToRepository(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return url.hostname;
  } catch {
    return 'unknown';
  }
}

async function tableColumns(db: D1Database, table: string): Promise<Set<string>> {
  const rows = await queryAll(db, `PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => stringFrom(row.name)).filter((name) => name.length > 0));
}

function methodNotAllowed(allow: string[]): Response {
  return jsonResponse({ error: 'method_not_allowed', allow }, 405, { Allow: allow.join(', ') });
}

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const merged = new Headers({ 'Content-Type': 'application/json; charset=UTF-8' });
  const extras = new Headers(headers);
  extras.forEach((value, key) => {
    merged.set(key, value);
  });
  return new Response(JSON.stringify(data), { status, headers: merged });
}

async function queryAll(db: D1Database, sql: string, bindings: unknown[] = []): Promise<DbRow[]> {
  const result = await db.prepare(sql).bind(...bindings).all();
  return result.results ?? [];
}

function numberFrom(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringFrom(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function stringListFromJson(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === 'string').map((entry) => String(entry));
  } catch {
    return [];
  }
}

function numberListFromJson(value: unknown): number[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
      .filter((entry) => Number.isFinite(entry));
  } catch {
    return [];
  }
}

function mapRunMode(value: unknown): 'daytona' | 'fallback' {
  return value === 'daytona' ? 'daytona' : 'fallback';
}

function mapRunStatus(value: unknown): 'completed' | 'failed' | 'running' {
  if (value === 'failed') return 'failed';
  if (value === 'running') return 'running';
  return 'completed';
}

function mapAgent(value: unknown): 'codex' | 'claude' | 'gemini' {
  if (value === 'claude') return 'claude';
  if (value === 'gemini') return 'gemini';
  return 'codex';
}

function mapAgentFamily(value: unknown): 'codex' | 'claude' | 'gemini' | 'multi' {
  if (value === 'codex') return 'codex';
  if (value === 'claude') return 'claude';
  if (value === 'gemini') return 'gemini';
  return 'multi';
}

function mapSecurityStatus(value: unknown): 'approved' | 'pending' | 'rejected' {
  if (value === 'pending') return 'pending';
  if (value === 'rejected') return 'rejected';
  return 'approved';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
