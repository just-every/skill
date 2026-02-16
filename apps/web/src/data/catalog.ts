export type Agent = 'codex' | 'claude' | 'gemini';

export type TaskRecord = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
};

export type SkillProvenance = {
  sourceUrl: string;
  repository: string;
  importedFrom: string;
  license: string;
  lastVerifiedAt: string;
  checksum: string;
};

export type SecurityReview = {
  status: 'approved' | 'pending' | 'rejected';
  reviewedBy: string;
  reviewedAt: string;
  reviewMethod: string;
  checklistVersion: string;
  notes: string;
};

export type SkillRecord = {
  id: string;
  slug: string;
  name: string;
  agentFamily: Agent | 'multi';
  summary: string;
  description: string;
  keywords: string[];
  sourceUrl: string;
  importedFrom: string;
  securityStatus: 'approved' | 'pending' | 'rejected';
  securityNotes: string;
  provenance: SkillProvenance;
  securityReview: SecurityReview;
  embedding: number[];
  createdAt: string;
  updatedAt: string;
};

export type BenchmarkRun = {
  id: string;
  runner: string;
  mode: 'daytona';
  status: 'completed' | 'failed' | 'running';
  startedAt: string;
  completedAt: string | null;
  artifactPath: string;
  notes: string;
};

export type BenchmarkScore = {
  id: string;
  runId: string;
  agent: Agent;
  skillId: string;
  taskId: string;
  taskSlug: string;
  taskName: string;
  overallScore: number;
  qualityScore: number;
  securityScore: number;
  speedScore: number;
  costScore: number;
  successRate: number;
  artifactPath: string;
  createdAt: string;
};

export type CatalogData = {
  source: 'd1';
  tasks: TaskRecord[];
  skills: SkillRecord[];
  runs: BenchmarkRun[];
  scores: BenchmarkScore[];
};

export type SkillSummary = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  securityStatus: 'approved' | 'pending' | 'rejected';
  averageScore: number;
  bestScore: number;
  benchmarkedTasks: number;
  agentCoverage: Agent[];
  provenance: SkillProvenance;
  securityReview: SecurityReview;
};

export type RecommendationResult = {
  retrievalStrategy: 'embedding-first' | 'lexical-backoff';
  recommendation: {
    id: string;
    slug: string;
    name: string;
    finalScore: number;
    embeddingSimilarity: number;
    lexicalScore: number;
    averageBenchmarkScore: number;
    securityReview: SecurityReview;
    provenance: SkillProvenance;
  } | null;
  candidates: Array<{
    id: string;
    slug: string;
    name: string;
    finalScore: number;
    embeddingSimilarity: number;
    lexicalScore: number;
    averageBenchmarkScore: number;
  }>;
};

export type SkillDetail = {
  skill: SkillRecord;
  task: TaskRecord | null;
  scores: BenchmarkScore[];
  summary: SkillSummary;
  byAgent: Array<{
    agent: Agent;
    rows: number;
    averageScore: number;
    bestScore: number;
    averageQuality: number;
    averageSecurity: number;
    averageSpeed: number;
    averageCost: number;
  }>;
  byTask: Array<{
    taskId: string;
    taskSlug: string;
    taskName: string;
    rows: number;
    averageScore: number;
  }>;
};

export type BenchmarkFilter = {
  skillId?: string;
  runId?: string;
  agent?: Agent;
  taskId?: string;
  query?: string;
};

const DEFAULT_EMBEDDING_DIM = 96;
const EMBEDDING_CONFIDENCE_MIN = 0.22;
const EMBEDDING_MARGIN_MIN = 0.03;

export async function loadCatalog(signal?: AbortSignal): Promise<CatalogData> {
  const response = await fetch('/api/skills/catalog', { signal });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to load skills catalog (${response.status}): ${detail.slice(0, 140)}`);
  }
  const payload = (await response.json()) as Partial<CatalogData>;
  if (!Array.isArray(payload.tasks) || !Array.isArray(payload.skills) || !Array.isArray(payload.runs) || !Array.isArray(payload.scores)) {
    throw new Error('Invalid skills catalog payload');
  }
  return {
    source: 'd1',
    tasks: payload.tasks as TaskRecord[],
    skills: payload.skills as SkillRecord[],
    runs: payload.runs as BenchmarkRun[],
    scores: payload.scores as BenchmarkScore[],
  };
}

export function getCoverage(catalog: CatalogData) {
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

export function getSkillSummaries(catalog: CatalogData): SkillSummary[] {
  return catalog.skills
    .map((skill) => {
      const rows = catalog.scores.filter((score) => score.skillId === skill.id);
      const averageScore = rows.length > 0 ? rows.reduce((sum, row) => sum + row.overallScore, 0) / rows.length : 0;
      const bestScore = rows.length > 0 ? Math.max(...rows.map((row) => row.overallScore)) : 0;
      const benchmarkedTasks = new Set(rows.map((row) => row.taskId)).size;
      const agentCoverage = Array.from(new Set(rows.map((row) => row.agent)));
      return {
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        summary: skill.summary,
        securityStatus: skill.securityStatus,
        averageScore: Number(averageScore.toFixed(2)),
        bestScore: Number(bestScore.toFixed(2)),
        benchmarkedTasks,
        agentCoverage,
        provenance: skill.provenance,
        securityReview: skill.securityReview,
      } satisfies SkillSummary;
    })
    .sort((a, b) => {
      if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
      return a.name.localeCompare(b.name);
    });
}

export function getTopRows(catalog: CatalogData, limit = 3): SkillSummary[] {
  return getSkillSummaries(catalog).slice(0, limit);
}

export function getSkillDetail(catalog: CatalogData, skillId: string): SkillDetail | null {
  const skill = catalog.skills.find((entry) => entry.id === skillId);
  if (!skill) return null;
  const task = catalog.tasks.find((entry) => entry.id === catalog.scores.find((score) => score.skillId === skill.id)?.taskId) ?? null;
  const scores = catalog.scores.filter((row) => row.skillId === skill.id);
  const summary = getSkillSummaries(catalog).find((entry) => entry.id === skill.id);
  if (!summary) return null;

  const byAgent = (['codex', 'claude', 'gemini'] as Agent[])
    .map((agent) => {
      const rows = scores.filter((row) => row.agent === agent);
      if (rows.length === 0) {
        return {
          agent,
          rows: 0,
          averageScore: 0,
          bestScore: 0,
          averageQuality: 0,
          averageSecurity: 0,
          averageSpeed: 0,
          averageCost: 0,
        };
      }
      return {
        agent,
        rows: rows.length,
        averageScore: Number((rows.reduce((sum, row) => sum + row.overallScore, 0) / rows.length).toFixed(2)),
        bestScore: Number(Math.max(...rows.map((row) => row.overallScore)).toFixed(2)),
        averageQuality: Number((rows.reduce((sum, row) => sum + row.qualityScore, 0) / rows.length).toFixed(2)),
        averageSecurity: Number((rows.reduce((sum, row) => sum + row.securityScore, 0) / rows.length).toFixed(2)),
        averageSpeed: Number((rows.reduce((sum, row) => sum + row.speedScore, 0) / rows.length).toFixed(2)),
        averageCost: Number((rows.reduce((sum, row) => sum + row.costScore, 0) / rows.length).toFixed(2)),
      };
    })
    .filter((entry) => entry.rows > 0);

  const byTaskMap = new Map<string, BenchmarkScore[]>();
  for (const row of scores) {
    const existing = byTaskMap.get(row.taskId) ?? [];
    existing.push(row);
    byTaskMap.set(row.taskId, existing);
  }
  const byTask = Array.from(byTaskMap.entries()).map(([taskId, rows]) => ({
    taskId,
    taskSlug: rows[0]?.taskSlug ?? '',
    taskName: rows[0]?.taskName ?? '',
    rows: rows.length,
    averageScore: Number((rows.reduce((sum, row) => sum + row.overallScore, 0) / rows.length).toFixed(2)),
  }));

  return {
    skill,
    task,
    scores,
    summary,
    byAgent,
    byTask,
  };
}

export function getBenchmarkRows(catalog: CatalogData, filters: BenchmarkFilter = {}): BenchmarkScore[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  return catalog.scores.filter((row) => {
    if (filters.skillId && row.skillId !== filters.skillId) return false;
    if (filters.runId && row.runId !== filters.runId) return false;
    if (filters.agent && row.agent !== filters.agent) return false;
    if (filters.taskId && row.taskId !== filters.taskId) return false;

    if (!query) return true;
    const skill = catalog.skills.find((entry) => entry.id === row.skillId);
    const haystack = [
      row.id,
      row.runId,
      row.taskId,
      row.taskSlug,
      row.taskName,
      row.agent,
      row.artifactPath,
      skill?.name ?? '',
      skill?.slug ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function recommendSkill(catalog: CatalogData, task: string, agent: Agent, limit = 5): RecommendationResult {
  const query = task.trim();
  const approved = catalog.skills.filter((skill) => skill.securityReview.status === 'approved');
  if (approved.length === 0) {
    return {
      retrievalStrategy: 'lexical-backoff',
      recommendation: null,
      candidates: [],
    };
  }

  const queryEmbedding = embedText(query);
  const queryTokens = new Set(tokenize(query));
  const hasEmbeddingSignal = vectorMagnitude(queryEmbedding) > 0;
  const taskContextBySkill = buildTaskContextBySkill(catalog);

  const scored = approved.map((skill) => {
    const rows = catalog.scores.filter((entry) => entry.skillId === skill.id && entry.agent === agent);
    const effectiveRows = rows.length > 0 ? rows : catalog.scores.filter((entry) => entry.skillId === skill.id);
    const averageBenchmarkScore = effectiveRows.length > 0
      ? effectiveRows.reduce((sum, row) => sum + row.overallScore, 0) / effectiveRows.length
      : 0;
    const benchmarkNorm = clamp(averageBenchmarkScore / 100, 0, 1);

    const embedding = normalizeEmbedding(skill.embedding.length > 0 ? skill.embedding : embedText(`${skill.name} ${skill.summary} ${skill.description}`));
    const embeddingSimilarity = hasEmbeddingSignal ? cosineSimilarity(queryEmbedding, embedding) : 0;
    const lexicalSkill = lexicalSimilarity(
      queryTokens,
      new Set(tokenize(`${skill.name} ${skill.summary} ${skill.description} ${skill.keywords.join(' ')}`)),
    );
    const lexicalTask = lexicalSimilarity(queryTokens, new Set(tokenize(taskContextBySkill.get(skill.id) ?? '')));
    const lexicalScore = clamp(0.65 * lexicalSkill + 0.35 * lexicalTask, 0, 1);

    return {
      skill,
      averageBenchmarkScore,
      benchmarkNorm,
      embeddingSimilarity,
      lexicalScore,
    };
  });

  const rankingByEmbedding = [...scored].sort((a, b) => b.embeddingSimilarity - a.embeddingSimilarity);
  const strongest = rankingByEmbedding[0]?.embeddingSimilarity ?? 0;
  const second = rankingByEmbedding[1]?.embeddingSimilarity ?? 0;
  const useLexicalBackoff = !hasEmbeddingSignal || strongest < EMBEDDING_CONFIDENCE_MIN || strongest - second < EMBEDDING_MARGIN_MIN;

  const candidates = scored
    .map((entry) => {
      const retrievalScore = useLexicalBackoff
        ? entry.lexicalScore
        : clamp(entry.embeddingSimilarity + 0.15 * entry.lexicalScore, 0, 1);
      const finalScore = useLexicalBackoff
        ? 0.7 * retrievalScore + 0.3 * entry.benchmarkNorm
        : 0.75 * retrievalScore + 0.25 * entry.benchmarkNorm;
      return {
        id: entry.skill.id,
        slug: entry.skill.slug,
        name: entry.skill.name,
        finalScore: Number(finalScore.toFixed(4)),
        embeddingSimilarity: Number(entry.embeddingSimilarity.toFixed(4)),
        lexicalScore: Number(entry.lexicalScore.toFixed(4)),
        averageBenchmarkScore: Number(entry.averageBenchmarkScore.toFixed(2)),
        securityReview: entry.skill.securityReview,
        provenance: entry.skill.provenance,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);

  const recommendation = candidates[0] ?? null;
  return {
    retrievalStrategy: useLexicalBackoff ? 'lexical-backoff' : 'embedding-first',
    recommendation,
    candidates,
  };
}

function buildTaskContextBySkill(catalog: CatalogData): Map<string, string> {
  const context = new Map<string, Set<string>>();
  const tasksById = new Map(catalog.tasks.map((task) => [task.id, task]));

  for (const score of catalog.scores) {
    const task = tasksById.get(score.taskId);
    if (!task) continue;
    const skillContext = context.get(score.skillId) ?? new Set<string>();
    skillContext.add(`${task.slug} ${task.name} ${task.description} ${task.tags.join(' ')}`);
    context.set(score.skillId, skillContext);
  }

  const final = new Map<string, string>();
  for (const [skillId, chunks] of context.entries()) {
    final.set(skillId, Array.from(chunks).join(' '));
  }
  return final;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function embedText(input: string, dims = DEFAULT_EMBEDDING_DIM): number[] {
  const vector = new Array<number>(dims).fill(0);
  for (const token of tokenize(input)) {
    const index = hashToken(token, dims);
    vector[index] += 1;
  }
  return normalizeEmbedding(vector);
}

function hashToken(token: string, dims: number): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
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

function normalizeEmbedding(vector: number[]): number[] {
  const magnitude = vectorMagnitude(vector);
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

