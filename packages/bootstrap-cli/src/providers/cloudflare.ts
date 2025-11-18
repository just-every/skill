import chalk from 'chalk';
import { execa } from 'execa';
import type { BootstrapEnv } from '../env.js';

export interface CloudflarePlanStep {
  id: string;
  title: string;
  detail: string;
  status: 'noop' | 'ensure' | 'skipped';
}

export interface CloudflarePlan {
  provider: 'cloudflare';
  accountId: string;
  projectId: string;
  workerName: string;
  d1: { name: string };
  r2: { bucket: string };
  steps: CloudflarePlanStep[];
  notes: string[];
  capabilities?: CloudflareCapabilities;
}

export interface CloudflareCapabilities {
  authenticated: boolean;
  canUseD1: boolean;
  canUseR2: boolean;
  userEmail?: string;
}

export interface CloudflareGeneratedEnvUpdates {
  D1_DATABASE_NAME?: string;
  D1_DATABASE_ID?: string;
  CLOUDFLARE_R2_BUCKET?: string;
}

export interface CloudflareExecutionResult {
  updates: CloudflareGeneratedEnvUpdates;
}

export interface ExecuteCloudflareOptions {
  dryRun?: boolean;
  logger?: (line: string) => void;
  client?: CloudflareClient;
}

export interface CloudflareClient {
  getD1Database: (name: string) => Promise<CloudflareD1Database | null>;
  createD1Database: (name: string) => Promise<CloudflareD1Database>;
  getR2Bucket: (name: string) => Promise<CloudflareR2Bucket | null>;
  createR2Bucket: (name: string) => Promise<CloudflareR2Bucket>;
  listD1Databases?: () => Promise<CloudflareD1Database[]>;
  listR2Buckets?: () => Promise<CloudflareR2Bucket[]>;
  detectCapabilities?: () => Promise<CloudflareCapabilities>;
}

export interface CloudflareD1Database {
  id: string;
  name: string;
}

export interface CloudflareR2Bucket {
  name: string;
}

export function buildCloudflarePlan(
  env: BootstrapEnv,
  capabilities?: CloudflareCapabilities
): CloudflarePlan {
  const projectId = env.PROJECT_ID;
  const d1Name = env.D1_DATABASE_NAME ?? `${projectId}-d1`;
  const bucket = env.CLOUDFLARE_R2_BUCKET ?? `${projectId}-assets`;
  const workerName = `${projectId}-worker`;

  const steps: CloudflarePlanStep[] = [
    {
      id: 'worker',
      title: 'Worker project',
      detail: `Ensure worker "${workerName}" exists`,
      status: 'ensure'
    },
    {
      id: 'd1',
      title: 'D1 database',
      detail: capabilities?.canUseD1 === false
        ? `Skip database "${d1Name}" (no D1 permissions)`
        : `Ensure database "${d1Name}" exists`,
      status: capabilities?.canUseD1 === false ? 'skipped' : 'ensure'
    },
    {
      id: 'r2',
      title: 'R2 bucket',
      detail: capabilities?.canUseR2 === false
        ? `Skip bucket "${bucket}" (no R2 permissions)`
        : `Ensure bucket "${bucket}" exists`,
      status: capabilities?.canUseR2 === false ? 'skipped' : 'ensure'
    }
  ];

  const notes = [
    `Zone: ${env.CLOUDFLARE_ZONE_ID ?? 'not set'}`,
    `Stripe webhook: ${env.STRIPE_WEBHOOK_SECRET ? 'configured' : 'missing'}`
  ];

  if (capabilities) {
    if (capabilities.userEmail) {
      notes.push(`Authenticated: ${capabilities.userEmail}`);
    }
    if (!capabilities.canUseD1) {
      notes.push('Warning: No D1 permissions detected');
    }
    if (!capabilities.canUseR2) {
      notes.push('Warning: No R2 permissions detected');
    }
  }

  return {
    provider: 'cloudflare',
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    projectId,
    workerName,
    d1: { name: d1Name },
    r2: { bucket },
    steps,
    notes,
    capabilities
  };
}

export function formatCloudflarePlan(plan: CloudflarePlan): string {
  const header = `Provider: cloudflare (account ${plan.accountId})`;
  const steps = plan.steps.map((step) => `  - ${step.title}: ${step.detail} [${step.status}]`);
  const notes = plan.notes.map((note) => `    ${note}`);
  return [header, ...steps, '  Notes:', ...notes].join('\n');
}

export async function executeCloudflarePlan(
  plan: CloudflarePlan,
  env: BootstrapEnv,
  options: ExecuteCloudflareOptions = {}
): Promise<CloudflareExecutionResult> {
  const { dryRun = false, logger = (line: string) => console.log(line), client } = options;
  const prefix = dryRun ? chalk.cyan('[dry-run]') : chalk.green('[apply]');
  const effectiveClient = client ?? createCloudflareClient(env);

  const updates: CloudflareGeneratedEnvUpdates = {};

  logger(`${prefix} Worker project -> ${plan.workerName}`);

  const d1Step = plan.steps.find((s) => s.id === 'd1');
  if (d1Step?.status === 'skipped') {
    logger(chalk.yellow(`[skipped] D1 database -> ${plan.d1.name} (no permissions)`));
    if (!dryRun) {
      updates.D1_DATABASE_NAME = plan.d1.name;
      updates.D1_DATABASE_ID = '';
    }
  } else {
    const d1Result = await ensureD1Database(plan.d1.name, effectiveClient, {
      dryRun,
      logger
    });
    if (d1Result && !dryRun) {
      updates.D1_DATABASE_NAME = d1Result.name;
      updates.D1_DATABASE_ID = d1Result.id;
    }
  }

  const r2Step = plan.steps.find((s) => s.id === 'r2');
  if (r2Step?.status === 'skipped') {
    logger(chalk.yellow(`[skipped] R2 bucket -> ${plan.r2.bucket} (no permissions)`));
    if (!dryRun) {
      updates.CLOUDFLARE_R2_BUCKET = '';
    }
  } else {
    const r2Result = await ensureR2Bucket(plan.r2.bucket, effectiveClient, {
      dryRun,
      logger
    });
    if (r2Result && !dryRun) {
      updates.CLOUDFLARE_R2_BUCKET = r2Result.name;
    }
  }

  for (const note of plan.notes) {
    logger(chalk.gray(`note: ${note}`));
  }
  if (dryRun) {
    logger(chalk.gray('Dry run completed without side effects.'));
  }

  return { updates };
}

interface EnsureOptions {
  dryRun: boolean;
  logger: (line: string) => void;
}

async function ensureD1Database(
  name: string,
  client: CloudflareClient,
  options: EnsureOptions
): Promise<CloudflareD1Database | null> {
  const { dryRun, logger } = options;
  const prefix = dryRun ? chalk.cyan('[dry-run]') : chalk.green('[apply]');
  const existing = await client.getD1Database(name);
  if (existing) {
    logger(`${prefix} D1 database -> ${name} (exists as ${existing.id})`);
    return existing;
  }
  logger(`${prefix} D1 database -> create ${name}`);
  if (dryRun) {
    return { id: '', name };
  }
  const created = await client.createD1Database(name);
  if (!created) {
    throw new Error(`Failed to create D1 database "${name}"`);
  }
  return created;
}

async function ensureR2Bucket(
  name: string,
  client: CloudflareClient,
  options: EnsureOptions
): Promise<CloudflareR2Bucket | null> {
  const { dryRun, logger } = options;
  const prefix = dryRun ? chalk.cyan('[dry-run]') : chalk.green('[apply]');
  const existing = await client.getR2Bucket(name);
  if (existing) {
    logger(`${prefix} R2 bucket -> ${name} (exists)`);
    return existing;
  }
  logger(`${prefix} R2 bucket -> create ${name}`);
  if (dryRun) {
    return { name };
  }
  const created = await client.createR2Bucket(name);
  if (!created?.name) {
    throw new Error(`Failed to create R2 bucket "${name}"`);
  }
  return created;
}

export async function detectCloudflareCapabilities(
  env: BootstrapEnv
): Promise<CloudflareCapabilities> {
  const wranglerEnv = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID
  };

  let authenticated = false;
  let userEmail: string | undefined;
  let canUseD1 = false;
  let canUseR2 = false;

  // Test authentication with whoami
  try {
    const whoamiOutput = await runWrangler(['whoami'], wranglerEnv, { ignoreFailure: true });
    if (whoamiOutput && whoamiOutput.trim()) {
      authenticated = true;
      const emailMatch = whoamiOutput.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        userEmail = emailMatch[0];
      }
    }
  } catch {
    // Authentication failed
  }

  // Test D1 permissions
  try {
    const d1ListOutput = await runWrangler(['d1', 'list', '--json'], wranglerEnv, {
      ignoreFailure: true
    });
    if (d1ListOutput && d1ListOutput.trim()) {
      // If we can list D1 databases (even if empty), we have permission
      canUseD1 = true;
    }
  } catch {
    // No D1 permissions
  }

  // Test R2 permissions
  try {
    const r2ListOutput = await runWrangler(['r2', 'bucket', 'list'], wranglerEnv, {
      ignoreFailure: true
    });
    if (r2ListOutput && r2ListOutput.trim()) {
      // If we can list R2 buckets (even if empty), we have permission
      canUseR2 = true;
    }
  } catch {
    // No R2 permissions
  }

  return {
    authenticated,
    canUseD1,
    canUseR2,
    userEmail
  };
}

export function createCloudflareClient(env: BootstrapEnv): CloudflareClient {
  const wranglerEnv = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID
  };

  return {
    getD1Database: async (name: string) => {
      const stdout = await runWrangler(
        ['d1', 'info', name, '--json'],
        wranglerEnv,
        { ignoreFailure: true }
      );
      if (!stdout.trim()) {
        const listOutput = await runWrangler(['d1', 'list', '--json'], wranglerEnv, {
          ignoreFailure: true
        });
        const fromList = parseD1DatabaseList(listOutput).find((entry) => entry.name === name);
        return fromList ?? null;
      }
      return parseD1Database(stdout);
    },
    createD1Database: async (name: string) => {
      const created = await runWrangler(['d1', 'create', name, '--json'], wranglerEnv, {
        ignoreFailure: true
      });
      const parsedFromCreate = parseD1DatabaseIfPossible(created);
      if (parsedFromCreate) {
        return parsedFromCreate;
      }

      const info = await runWrangler(['d1', 'info', name, '--json'], wranglerEnv, {
        ignoreFailure: true
      });
      if (info.trim()) {
        return parseD1Database(info);
      }

      const listOutput = await runWrangler(['d1', 'list', '--json'], wranglerEnv, {
        ignoreFailure: true
      });
      const parsedFromList = parseD1DatabaseList(listOutput).find(
        (entry) => entry.name === name
      );
      if (parsedFromList) {
        return parsedFromList;
      }

      return { id: '', name };
    },
    getR2Bucket: async (name: string) => {
      const buckets = await listR2BucketsWithFallback(
        wranglerEnv,
        env.CLOUDFLARE_ACCOUNT_ID,
        env.CLOUDFLARE_API_TOKEN
      );
      return buckets.find((bucket) => bucket.name === name) ?? null;
    },
    createR2Bucket: async (name: string) => {
      await runWrangler(['r2', 'bucket', 'create', name], wranglerEnv, { ignoreFailure: true });
      const buckets = await listR2BucketsWithFallback(
        wranglerEnv,
        env.CLOUDFLARE_ACCOUNT_ID,
        env.CLOUDFLARE_API_TOKEN
      );
      const bucket = buckets.find((entry) => entry.name === name);
      return bucket ?? { name };
    },
    detectCapabilities: async () => {
      return detectCloudflareCapabilities(env);
    }
  };
}

async function listR2BucketsWithFallback(
  wranglerEnv: NodeJS.ProcessEnv,
  accountId?: string,
  apiToken?: string
): Promise<CloudflareR2Bucket[]> {
  const jsonOutput = await runWrangler(['r2', 'bucket', 'list', '--json'], wranglerEnv, {
    ignoreFailure: true
  });
  if (jsonOutput.trim()) {
    try {
      const buckets = parseR2Buckets(jsonOutput);
      if (buckets.length > 0) {
        return buckets;
      }
    } catch {
      // fall through to plain output parsing
    }
  }

  const plainOutput = await runWrangler(['r2', 'bucket', 'list'], wranglerEnv, {
    ignoreFailure: true
  });
  if (plainOutput.trim()) {
    const buckets = parseR2BucketsFromPlainOutput(plainOutput);
    if (buckets.length > 0) {
      return buckets;
    }
  }

  const apiBuckets = await listR2BucketsViaApi(accountId, apiToken);
  if (apiBuckets.length > 0) {
    return apiBuckets;
  }

  return [];
}

async function defaultRunWrangler(
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { ignoreFailure?: boolean } = {}
): Promise<string> {
  try {
    const { stdout } = await execa('wrangler', args, {
      env,
      stdout: 'pipe'
    });
    return stdout;
  } catch (error) {
    if (options.ignoreFailure) {
      return '';
    }
    throw error;
  }
}

let runWranglerDelegate = defaultRunWrangler;

export async function runWrangler(
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { ignoreFailure?: boolean } = {}
): Promise<string> {
  return runWranglerDelegate(args, env, options);
}

function setRunWranglerDelegate(
  fn: typeof defaultRunWrangler
): void {
  runWranglerDelegate = fn;
}

function resetRunWranglerDelegate(): void {
  runWranglerDelegate = defaultRunWrangler;
}

function parseD1Database(stdout: string): CloudflareD1Database {
  const parsed = safeJson(stdout);
  if (typeof parsed !== 'object' || !parsed) {
    throw new Error('Unexpected D1 database payload');
  }
  const id = (parsed as any).uuid ?? (parsed as any).id ?? (parsed as any).database_id;
  const name = (parsed as any).name ?? (parsed as any).database?.name;
  if (!id || !name) {
    throw new Error('Invalid D1 database payload');
  }
  return { id: String(id), name: String(name) };
}

function parseD1DatabaseIfPossible(stdout: string): CloudflareD1Database | null {
  if (!stdout || !stdout.trim()) {
    return null;
  }
  try {
    return parseD1Database(stdout);
  } catch {
    return null;
  }
}

function parseD1DatabaseList(stdout: string): CloudflareD1Database[] {
  if (!stdout.trim()) {
    return [];
  }
  const parsed = safeJson(stdout);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((entry) => {
      try {
        return parseD1Database(JSON.stringify(entry));
      } catch {
        return null;
      }
    })
    .filter((entry): entry is CloudflareD1Database => entry !== null);
}

function parseR2Buckets(stdout: string): CloudflareR2Bucket[] {
  const parsed = safeJson(stdout);
  if (!Array.isArray(parsed)) {
    throw new Error('Unexpected R2 bucket payload');
  }
  return parsed
    .map((entry) => ({
      name: typeof entry?.name === 'string' ? entry.name : ''
    }))
    .filter((entry) => entry.name.length > 0);
}

function parseR2BucketsFromPlainOutput(stdout: string): CloudflareR2Bucket[] {
  if (!stdout.trim()) {
    return [];
  }

  const names = new Set<string>();
  const lines = stdout.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^no buckets/i.test(line)) {
      return [];
    }

    const stripped = line
      .replace(/[│|]/g, ' ')
      .replace(/[┌┐└┘├┤┬┴┼─+]+/g, ' ')
      .trim();
    if (!stripped) continue;

    const [firstToken] = stripped.split(/\s+/);
    if (!firstToken) continue;
    if (/^(name|bucket|buckets|created|listing)$/i.test(firstToken)) continue;
    if (firstToken.includes(':')) continue;
    if (!/^[a-z0-9._-]+$/i.test(firstToken)) continue;

    names.add(firstToken);
  }

  return [...names].map((name) => ({ name }));
}

async function listR2BucketsViaApi(
  accountId?: string,
  apiToken?: string
): Promise<CloudflareR2Bucket[]> {
  if (!accountId || !apiToken) {
    return [];
  }
  if (typeof fetch !== 'function') {
    return [];
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (!data?.success || !Array.isArray(data.result)) {
      return [];
    }

    return data.result
      .map((entry: any) => ({ name: typeof entry?.name === 'string' ? entry.name : '' }))
      .filter((entry: CloudflareR2Bucket) => entry.name.length > 0);
  } catch {
    return [];
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Failed to parse wrangler JSON output: ${(error as Error).message}`);
  }
}

export const __cloudflareInternals = {
  listR2BucketsWithFallback,
  parseR2BucketsFromPlainOutput,
  listR2BucketsViaApi,
  runWrangler,
  setRunWranglerDelegate,
  resetRunWranglerDelegate
};
