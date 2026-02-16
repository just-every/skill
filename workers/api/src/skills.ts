type DbRow = Record<string, unknown>;

type Agent = 'codex' | 'claude' | 'gemini';
type AgentFamily = Agent | 'multi';
type SecurityStatus = 'approved' | 'pending' | 'rejected';
type BenchmarkRunStatus = 'completed' | 'failed' | 'running';

type SkillProvenance = {
  sourceUrl: string;
  repository: string;
  importedFrom: string;
  license: string;
  lastVerifiedAt: string;
  checksum: string;
};

type SkillSecurityReview = {
  status: SecurityStatus;
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
  agentFamily: AgentFamily;
  summary: string;
  description: string;
  keywords: string[];
  sourceUrl: string;
  importedFrom: string;
  securityStatus: SecurityStatus;
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
  mode: 'daytona';
  status: BenchmarkRunStatus;
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
  agent: Agent;
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
  source: 'd1';
  tasks: SkillTask[];
  skills: SkillRecord[];
  runs: SkillBenchmarkRun[];
  scores: SkillScore[];
};

type RecommendationQuery = {
  task: string;
  agent: Agent | 'any';
  limit: number;
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
  securityStatus: SecurityStatus;
  sourceUrl: string;
  averageBenchmarkScore: number;
  embeddingSimilarity: number;
  lexicalScore: number;
  finalScore: number;
  matchedAgent: Agent | 'any';
  provenance: SkillProvenance;
  securityReview: SkillSecurityReview;
};

type RecommendationResult = {
  strategy: 'embedding-first' | 'lexical-backoff';
  best: RecommendationEntry | null;
  candidates: RecommendationEntry[];
};

type SkillsEnv = {
  DB?: D1Database;
};

const DEFAULT_EMBEDDING_DIM = 96;
const REVIEWED_AT_FALLBACK = '1970-01-01T00:00:00.000Z';
const EMBEDDING_CONFIDENCE_MIN = 0.22;
const EMBEDDING_MARGIN_MIN = 0.03;
const SYNTHETIC_KEYWORDS = ['fallback', 'mock', 'synthetic', 'seed'];

export async function handleSkillsRoute(request: Request, env: SkillsEnv, pathname: string): Promise<Response> {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== 'api' || segments[1] !== 'skills') {
    return jsonResponse({ error: 'not_found' }, 404);
  }

  if (!env.DB) {
    return jsonResponse(
      {
        error: 'skills_db_unavailable',
        hint: 'D1 binding `DB` is required. Synthetic fallback catalogs are disabled.',
      },
      503,
    );
  }

  const catalogResult = await getCatalog(env.DB);
  if (!catalogResult.ok) {
    return jsonResponse(
      {
        error: catalogResult.error,
        details: catalogResult.details,
      },
      catalogResult.status,
    );
  }
  const catalog = catalogResult.catalog;

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
  if (resource === 'catalog') {
    if (request.method !== 'GET') {
      return methodNotAllowed(['GET']);
    }
    return jsonResponse({
      source: catalog.source,
      tasks: catalog.tasks,
      skills: catalog.skills,
      runs: catalog.runs,
      scores: catalog.scores,
      coverage: computeCoverage(catalog),
    });
  }

  if (resource === 'tasks') {
    if (request.method !== 'GET') {
      return methodNotAllowed(['GET']);
    }
    return jsonResponse({ source: catalog.source, tasks: catalog.tasks, total: catalog.tasks.length });
  }

  if (resource === 'scores') {
    if (request.method !== 'GET') {
      return methodNotAllowed(['GET']);
    }
    return jsonResponse({ source: catalog.source, scores: catalog.scores, total: catalog.scores.length });
  }

  if (resource === 'benchmarks') {
    if (request.method !== 'GET') {
      return methodNotAllowed(['GET']);
    }
    return jsonResponse({
      source: catalog.source,
      runs: catalog.runs,
      scores: catalog.scores,
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

type CatalogResult =
  | { ok: true; catalog: SkillCatalog }
  | { ok: false; status: number; error: string; details?: string };

async function getCatalog(db: D1Database): Promise<CatalogResult> {
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

    const runs: SkillBenchmarkRun[] = [];
    for (const row of runRows) {
      const mode = stringFrom(row.mode).toLowerCase();
      if (mode !== 'daytona') {
        return {
          ok: false,
          status: 409,
          error: 'non_real_benchmark_mode',
          details: `Run ${stringFrom(row.id)} has mode '${mode || 'unknown'}'. Only 'daytona' is allowed.`,
        };
      }
      runs.push({
        id: stringFrom(row.id),
        runner: stringFrom(row.runner),
        mode: 'daytona',
        status: mapRunStatus(row.status),
        startedAt: stringFrom(row.started_at),
        completedAt: stringOrNull(row.completed_at),
        artifactPath: stringFrom(row.artifact_path),
        notes: stringFrom(row.notes),
      });
    }

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

    const catalog: SkillCatalog = {
      source: 'd1',
      tasks,
      skills,
      runs,
      scores,
    };

    const integrityError = validateCatalogIntegrity(catalog);
    if (integrityError) {
      return {
        ok: false,
        status: 409,
        error: 'benchmark_integrity_failed',
        details: integrityError,
      };
    }

    return { ok: true, catalog };
  } catch (error) {
    console.error('Failed to load skills catalog from D1.', error);
    return {
      ok: false,
      status: 500,
      error: 'skills_catalog_load_failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function validateCatalogIntegrity(catalog: SkillCatalog): string | null {
  const taskIds = new Set(catalog.tasks.map((task) => task.id));
  const skillIds = new Set(catalog.skills.map((skill) => skill.id));
  const runIds = new Set(catalog.runs.map((run) => run.id));

  if (catalog.skills.length !== 50) {
    return `Expected exactly 50 skills, found ${catalog.skills.length}.`;
  }

  if (catalog.scores.length !== 150) {
    return `Expected exactly 150 score rows, found ${catalog.scores.length}.`;
  }

  if (catalog.runs.length !== 3) {
    return `Expected exactly 3 benchmark runs, found ${catalog.runs.length}.`;
  }

  for (const run of catalog.runs) {
    if (containsSyntheticMarker(run.artifactPath) || containsSyntheticMarker(run.notes)) {
      return `Run ${run.id} contains blocked synthetic marker in artifact/notes.`;
    }
  }

  for (const score of catalog.scores) {
    if (!taskIds.has(score.taskId)) return `Score ${score.id} references unknown task ${score.taskId}.`;
    if (!skillIds.has(score.skillId)) return `Score ${score.id} references unknown skill ${score.skillId}.`;
    if (!runIds.has(score.runId)) return `Score ${score.id} references unknown run ${score.runId}.`;
    if (containsSyntheticMarker(score.artifactPath)) {
      return `Score ${score.id} artifact path contains blocked synthetic marker.`;
    }
    if (score.createdAt.length === 0) {
      return `Score ${score.id} is missing createdAt.`;
    }
  }

  const scoresBySkill = new Map<string, SkillScore[]>();
  const scoresByAgent = new Map<Agent, number>([
    ['codex', 0],
    ['claude', 0],
    ['gemini', 0],
  ]);

  for (const score of catalog.scores) {
    const perSkill = scoresBySkill.get(score.skillId) ?? [];
    perSkill.push(score);
    scoresBySkill.set(score.skillId, perSkill);
    scoresByAgent.set(score.agent, (scoresByAgent.get(score.agent) ?? 0) + 1);
  }

  for (const skillId of skillIds) {
    const rows = scoresBySkill.get(skillId) ?? [];
    if (rows.length !== 3) {
      return `Skill ${skillId} must have exactly 3 score rows (one per agent), found ${rows.length}.`;
    }
    const agents = new Set(rows.map((row) => row.agent));
    if (agents.size !== 3) {
      return `Skill ${skillId} is missing agent benchmark coverage.`;
    }
  }

  for (const [agent, count] of scoresByAgent.entries()) {
    if (count !== 50) {
      return `Agent ${agent} must have exactly 50 score rows, found ${count}.`;
    }
  }

  return null;
}

function containsSyntheticMarker(value: string): boolean {
  if (!value) return false;
  const lowered = value.toLowerCase();
  return SYNTHETIC_KEYWORDS.some((keyword) => lowered.includes(keyword));
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
    return { strategy: 'lexical-backoff', best: null, candidates: [] };
  }

  const queryEmbedding = embedText(query.task);
  const queryTokens = new Set(tokenize(query.task));
  const hasEmbeddingSignal = vectorMagnitude(queryEmbedding) > 0;
  const taskContextBySkillId = buildTaskContextBySkill(catalog);

  const raw = available.map((skill) => {
    const skillScores = catalog.scores.filter((score) => score.skillId === skill.id);
    const agentScores = query.agent !== 'any'
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
    const lexicalScore = clamp(0.65 * lexicalSkill + 0.35 * lexicalTask, 0, 1);

    return {
      skill,
      avgBenchmark,
      benchmarkNorm,
      embeddingSimilarity,
      lexicalScore,
    };
  });

  const embeddingRanked = [...raw].sort((a, b) => b.embeddingSimilarity - a.embeddingSimilarity);
  const strongestEmbedding = embeddingRanked[0]?.embeddingSimilarity ?? 0;
  const secondStrongestEmbedding = embeddingRanked[1]?.embeddingSimilarity ?? 0;
  const confidenceGap = strongestEmbedding - secondStrongestEmbedding;
  const useLexicalBackoff =
    !hasEmbeddingSignal ||
    strongestEmbedding < EMBEDDING_CONFIDENCE_MIN ||
    confidenceGap < EMBEDDING_MARGIN_MIN;

  const ranked = raw
    .map((entry) => {
      const retrievalScore = useLexicalBackoff
        ? entry.lexicalScore
        : clamp(entry.embeddingSimilarity + 0.15 * entry.lexicalScore, 0, 1);
      const finalScore = useLexicalBackoff
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
        lexicalScore: Number(entry.lexicalScore.toFixed(4)),
        finalScore: Number(finalScore.toFixed(4)),
        matchedAgent: query.agent,
        provenance: entry.skill.provenance,
        securityReview: entry.skill.securityReview,
      } satisfies RecommendationEntry;
    })
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (b.lexicalScore !== a.lexicalScore) return b.lexicalScore - a.lexicalScore;
      if (b.averageBenchmarkScore !== a.averageBenchmarkScore) return b.averageBenchmarkScore - a.averageBenchmarkScore;
      return a.slug.localeCompare(b.slug);
    })
    .slice(0, query.limit);

  return {
    strategy: useLexicalBackoff ? 'lexical-backoff' : 'embedding-first',
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

function parseProvenance(value: unknown, sourceUrl: string, importedFrom: string): SkillProvenance {
  const parsed = parseJsonObject(value);
  return {
    sourceUrl: stringFrom(parsed?.sourceUrl, sourceUrl),
    repository: stringFrom(parsed?.repository, sourceUrlToRepository(sourceUrl)),
    importedFrom: stringFrom(parsed?.importedFrom, importedFrom),
    license: stringFrom(parsed?.license, 'Unknown'),
    lastVerifiedAt: stringFrom(parsed?.lastVerifiedAt, REVIEWED_AT_FALLBACK),
    checksum: stringFrom(parsed?.checksum, `legacy:${hashToken(sourceUrl, 997)}`),
  };
}

function parseSecurityReview(
  value: unknown,
  legacyStatus: SecurityStatus,
  legacyNotes: string,
): SkillSecurityReview {
  const parsed = parseJsonObject(value);
  return {
    status: mapSecurityStatus(parsed?.status ?? legacyStatus),
    reviewedBy: stringFrom(parsed?.reviewedBy, 'Unknown reviewer'),
    reviewedAt: stringFrom(parsed?.reviewedAt, REVIEWED_AT_FALLBACK),
    reviewMethod: stringFrom(parsed?.reviewMethod, 'manual'),
    checklistVersion: stringFrom(parsed?.checklistVersion, 'unspecified'),
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

function mapRunStatus(value: unknown): BenchmarkRunStatus {
  if (value === 'failed') return 'failed';
  if (value === 'running') return 'running';
  return 'completed';
}

function mapAgent(value: unknown): Agent {
  if (value === 'claude') return 'claude';
  if (value === 'gemini') return 'gemini';
  return 'codex';
}

function mapAgentFamily(value: unknown): AgentFamily {
  if (value === 'codex') return 'codex';
  if (value === 'claude') return 'claude';
  if (value === 'gemini') return 'gemini';
  return 'multi';
}

function mapSecurityStatus(value: unknown): SecurityStatus {
  if (value === 'pending') return 'pending';
  if (value === 'rejected') return 'rejected';
  return 'approved';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
