import { promises as fs } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execa } from 'execa';

export type SmokeMode = 'full' | 'minimal';

export interface SmokeCheckOptions {
  baseUrl: string;
  routes?: string[];
  bearerToken?: string | null;
  outputRoot?: string;
  stamp?: string;
  mode?: SmokeMode;
  skipWrangler?: boolean;
  attempts?: number;
  delayMs?: number;
  projectId?: string | null;
  d1Name?: string | null;
  r2Bucket?: string | null;
}

export interface SmokeCheckEntry {
  name: string;
  url: string;
  expected: string;
  status?: number;
  ok: boolean;
  attempts: number;
  bodySnippet?: string;
  note?: string;
}

export interface WranglerCheckResult {
  ok: boolean;
  skipped: boolean;
  message: string;
  database?: string;
}

export interface SmokeSecretsResult {
  ok: boolean;
  skipped: boolean;
  message: string;
  names?: string[];
}

export interface SmokeCheckReport {
  generatedAt: string;
  baseUrl: string;
  projectId: string | null;
  mode: SmokeMode;
  checks: SmokeCheckEntry[];
  d1: WranglerCheckResult;
  workerSecrets: SmokeSecretsResult;
  runDir: string;
  reportPath: string;
  ok: boolean;
}

const DEFAULT_OUTPUT_ROOT = join('test-results', 'smoke');
const DEFAULT_ROUTES = ['/', '/login', '/callback', '/logout', '/app', '/payments'];

export async function runSmokeChecks(options: SmokeCheckOptions): Promise<SmokeCheckReport> {
  const mode: SmokeMode = options.mode ?? 'full';
  const skipWrangler = options.skipWrangler ?? mode === 'minimal';
  const outputRoot = resolve(options.outputRoot ?? DEFAULT_OUTPUT_ROOT);
  const stamp = options.stamp ?? formatTimestamp();
  const runDir = join(outputRoot, stamp);
  mkdirSync(runDir, { recursive: true });

  const routes = (options.routes?.length ? options.routes : DEFAULT_ROUTES).map((route) =>
    route.startsWith('/') ? route : `/${route}`
  );

  const bearerToken = options.bearerToken ?? null;
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 500;

  const endpointPlan = buildEndpoints(options.baseUrl, routes, bearerToken);
  const checks: SmokeCheckEntry[] = [];

  for (const endpoint of endpointPlan) {
    const captureFullBody = endpoint.name === 'callback:error-debug';
    const response = await fetchWithRetry(
      endpoint.url,
      { headers: endpoint.headers },
      attempts,
      delayMs,
      captureFullBody
    );

    const ok = evaluateStatus(response.status, endpoint.expectMode);
    const entry: SmokeCheckEntry = {
      name: endpoint.name,
      url: endpoint.url,
      expected: endpoint.expectMode,
      status: response.status,
      ok,
      attempts: response.attempts,
      bodySnippet: response.bodySnippet,
      note: response.note
    };

    checks.push(entry);

    if (captureFullBody && response.fullBody) {
      const artefactDir = join(runDir, 'artefacts');
      mkdirSync(artefactDir, { recursive: true });
      const safeName = endpoint.name.replace(/[:/]/g, '-');
      await fs.writeFile(
        join(artefactDir, `${safeName}-response.json`),
        JSON.stringify(
          {
            url: endpoint.url,
            status: response.status,
            headers: response.headers,
            body: response.fullBody
          },
          null,
          2
        )
      );
    }
  }

  const d1Result = skipWrangler
    ? { ok: false, skipped: true, message: 'Skipped (minimal mode)' }
    : await checkD1({
        d1Name: options.d1Name,
        projectId: options.projectId,
        baseUrl: options.baseUrl
      });

  const secretsResult = skipWrangler
    ? { ok: false, skipped: true, message: 'Skipped (minimal mode)' }
    : await checkWorkerSecrets();

  const report: SmokeCheckReport = {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    projectId: options.projectId ?? null,
    mode,
    checks,
    d1: d1Result,
    workerSecrets: secretsResult,
    runDir,
    reportPath: join(runDir, 'report.json'),
    ok: summariseChecks(checks) && (skipWrangler || (d1Result.ok && secretsResult.ok))
  };

  await writeReportFiles(runDir, report, checks);

  return report;
}

interface EndpointPlanEntry {
  name: string;
  url: string;
  expectMode: string;
  headers?: Record<string, string>;
}

function buildEndpoints(base: string, routes: string[], token: string | null): EndpointPlanEntry[] {
  const plan: EndpointPlanEntry[] = [];
  const redirectable = new Set(['/login', '/logout', '/callback']);

  for (const route of routes) {
    const expectMode = redirectable.has(route) ? '2xx-3xx' : '2xx';
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    plan.push({
      name: `page:${route}`,
      url: `${base}${route}`,
      expectMode,
      headers
    });
  }

  plan.push({ name: 'api:session-unauthenticated', url: `${base}/api/session`, expectMode: '401' });
  plan.push({ name: 'callback:error-debug', url: `${base}/callback?error=debug`, expectMode: '2xx-3xx' });

  if (token) {
    plan.push({
      name: 'api:session-authenticated',
      url: `${base}/api/session`,
      expectMode: '2xx',
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  plan.push({ name: 'asset:hero', url: `${base}/marketing/hero.png`, expectMode: 'optional-hero' });

  return plan;
}

interface FetchResult {
  url: string;
  method: string;
  attempts: number;
  status?: number;
  ok: boolean;
  headers?: Record<string, string>;
  bodySnippet?: string;
  fullBody?: string;
  note?: string;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  attempts: number,
  delayMs: number,
  captureFullBody: boolean
): Promise<FetchResult> {
  const result: FetchResult = {
    url,
    method: options.method ?? 'GET',
    attempts: 0,
    ok: false
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result.attempts = attempt;
    try {
      const response = await fetch(url, options);
      result.status = response.status;
      result.ok = response.ok;
      result.headers = Object.fromEntries(response.headers.entries());
      const text = await response.text();
      result.bodySnippet = text.slice(0, 256);
      if (captureFullBody) {
        result.fullBody = text;
      }
      return result;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  result.ok = false;
  result.note = lastError instanceof Error ? lastError.message : 'Unknown error';
  return result;
}

function evaluateStatus(status: number | undefined, expected: string): boolean {
  if (typeof status !== 'number') return false;
  if (expected === '2xx') return status >= 200 && status < 300;
  if (expected === '2xx-3xx') return status >= 200 && status < 400;
  if (expected === 'optional-hero') return status === 200 || status === 404;
  if (expected === '400') return status === 400;
  if (expected === '401') return status === 401;
  return false;
}

async function checkD1({
  d1Name,
  projectId,
  baseUrl
}: {
  d1Name?: string | null;
  projectId?: string | null;
  baseUrl: string;
}): Promise<WranglerCheckResult> {
  if (!d1Name) {
    return {
      ok: false,
      skipped: false,
      message: 'Database name unavailable'
    };
  }

  try {
    const { stdout } = await execa('wrangler', [
      '--config',
      'workers/api/wrangler.toml',
      'd1',
      'execute',
      d1Name,
      '--remote',
      '--command',
      'SELECT id, slug, domain, app_url FROM projects LIMIT 5;',
      '--json'
    ]);

    const parsed = JSON.parse(stdout);
    const rows = Array.isArray(parsed) && parsed[0]?.results ? parsed[0].results : [];
    const demoRow = rows.find((row: any) => projectId && row.id === projectId);
    return {
      ok: Boolean(demoRow),
      skipped: false,
      database: d1Name,
      message: demoRow
        ? `Found project row for ${projectId}`
        : rows.length > 0
          ? 'Projects table returned results but missing expected row'
          : 'Projects table is empty'
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      database: d1Name,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkWorkerSecrets(): Promise<SmokeSecretsResult> {
  try {
    const { stdout } = await execa('wrangler', [
      '--config',
      'workers/api/wrangler.toml',
      'secret',
      'list'
    ]);

    const secrets = JSON.parse(stdout);
    const names = secrets.map((secret: any) => secret.name).sort();
    const hasStripeSecret = names.includes('STRIPE_WEBHOOK_SECRET');
    const allPresent = hasStripeSecret;

    const missing: string[] = [];
    if (!hasStripeSecret) missing.push('STRIPE_WEBHOOK_SECRET');

    return {
      ok: allPresent,
      skipped: false,
      message: allPresent
        ? 'All required secrets present'
        : `Missing secrets: ${missing.join(', ')}`,
      names
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function writeReportFiles(runDir: string, report: SmokeCheckReport, checks: SmokeCheckEntry[]): Promise<void> {
  await fs.writeFile(report.reportPath, JSON.stringify(report, null, 2));
  await fs.writeFile(join(runDir, 'checks.json'), JSON.stringify(checks, null, 2));

  const markdown = [
    `# Smoke Report (${report.generatedAt})`,
    '',
    `- Base URL: ${report.baseUrl}`,
    `- Mode: ${report.mode}`,
    `- Project ID: ${report.projectId ?? 'unknown'}`,
    '',
    '## HTTP Checks',
    '',
    ...checks.map((check) =>
      `- ${check.name}: expected ${check.expected}, got ${check.status ?? 'error'} — ${check.ok ? '✅' : '❌'}`
    ),
    '',
    '## D1 Remote Projects Table',
    '',
    `- ${report.d1.database ?? 'unknown'}: ${report.d1.skipped ? 'skipped' : report.d1.ok ? '✅' : '❌'} ${report.d1.message}`,
    '',
    '## Worker Secrets',
    '',
    `- Required secrets: ${report.workerSecrets.skipped ? 'skipped' : report.workerSecrets.ok ? '✅' : '❌'} (${report.workerSecrets.message})`
  ].join('\n');

  await fs.writeFile(join(report.runDir, 'report.md'), markdown);
}

function summariseChecks(checks: SmokeCheckEntry[]): boolean {
  return checks.every((check) => check.ok);
}

function formatTimestamp(date = new Date()): string {
  const pad = (num: number) => String(num).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}
