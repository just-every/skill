import { Listr, type ListrTask, type ListrTaskWrapper } from 'listr2';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { execa } from 'execa';
import {
  loadBootstrapEnvironment,
  mergeGeneratedValues,
  type BootstrapEnv,
  type GeneratedEnv,
  type LoadEnvironmentResult
} from './env.js';
import {
  buildCloudflarePlan,
  executeCloudflarePlan,
  formatCloudflarePlan,
  detectCloudflareCapabilities,
  createCloudflareClient,
  type CloudflarePlan,
  type CloudflareCapabilities
} from './providers/cloudflare.js';
import {
  buildStripePlan,
  executeStripePlan,
  formatStripePlan,
  createStripeClient,
  buildStripeProductsPayload,
  type StripePlan,
  type StripeProvisionResult
} from './providers/stripe.js';
import { buildGeneratedFiles, deriveAppUrl, deriveWorkerOrigin } from './env/files.js';
import {
  writeFileIfChanged,
  type FileWriteResult
} from './files.js';
import { renderWranglerConfig } from './deploy/render.js';
import { ensureWranglerReady } from './deploy/preflight.js';
import { runSmoke, type SmokeCommandResult } from './smoke/index.js';

interface BootstrapTaskContext {
  envResult?: LoadEnvironmentResult;
  cloudflareCapabilities?: CloudflareCapabilities;
  cloudflarePlan?: CloudflarePlan;
  stripePlan?: StripePlan;
  stripeResult?: StripeProvisionResult;
}

type BootstrapTaskWrapper = ListrTaskWrapper<BootstrapTaskContext, any, any>;

interface PipelineOptions {
  cwd?: string;
  dryRun?: boolean;
}

interface EnvGenerateContext {
  envResult?: LoadEnvironmentResult;
  stripeResult?: StripeProvisionResult;
  fileResults?: FileWriteResult[];
}

type EnvGenerateTaskWrapper = ListrTaskWrapper<EnvGenerateContext, any, any>;

interface EnvGenerateOptions {
  cwd?: string;
  checkOnly?: boolean;
}

interface DeployContext {
  envResult?: LoadEnvironmentResult;
  cloudflareCapabilities?: CloudflareCapabilities;
  wranglerResult?: FileWriteResult;
  deployResult?: { command: string; dryRun: boolean };
}

type DeployTaskWrapper = ListrTaskWrapper<DeployContext, any, any>;

interface DeployOptions {
  cwd?: string;
  checkOnly?: boolean;
  dryRun?: boolean;
}

interface SmokeContext {
  envResult?: LoadEnvironmentResult;
  smokeResult?: SmokeCommandResult;
}

interface SmokeOptions {
  cwd?: string;
  base?: string;
  mode?: 'full' | 'minimal';
  routes?: string[];
  token?: string;
  outputDir?: string;
  stamp?: string;
  skipWrangler?: boolean;
  attempts?: number;
  delayMs?: number;
  headless?: boolean;
  projectId?: string;
  d1Name?: string;
  r2Bucket?: string;
}

function baseTasks(cwd: string): ListrTask<BootstrapTaskContext>[] {
  return [
    {
      title: 'Load environment',
      task: (ctx: BootstrapTaskContext, task: BootstrapTaskWrapper) => {
        ctx.envResult = loadBootstrapEnvironment({ cwd });
        task.output = ctx.envResult.report.summary;
      }
    },
    {
      title: 'Sync Font Awesome credentials',
      task: async (ctx: BootstrapTaskContext, task: BootstrapTaskWrapper) => {
        const token = ctx.envResult?.env.FONT_AWESOME_PACKAGE_TOKEN ?? process.env.FONT_AWESOME_PACKAGE_TOKEN;
        if (!token) {
          task.skip('FONT_AWESOME_PACKAGE_TOKEN not configured');
          return;
        }
        await execa('node', ['scripts/sync-fontawesome-token.mjs'], {
          cwd,
          env: { ...process.env, FONT_AWESOME_PACKAGE_TOKEN: token }
        });
        task.output = '.npmrc updated for Font Awesome registry';
      }
    },
    {
      title: 'Detect Cloudflare capabilities',
      task: async (ctx: BootstrapTaskContext, task: BootstrapTaskWrapper) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        const env = ctx.envResult.env;
        if (
          looksLikePlaceholderAccountId(env.CLOUDFLARE_ACCOUNT_ID) ||
          looksLikePlaceholderApiToken(env.CLOUDFLARE_API_TOKEN)
        ) {
          guardCloudflareCredentials(env);
        }
        try {
          ctx.cloudflareCapabilities = await detectCloudflareCapabilities(env);
          const caps = ctx.cloudflareCapabilities;
          const status = [
            caps.authenticated ? '✓ authenticated' : '✗ not authenticated',
            caps.canUseD1 ? '✓ D1' : '✗ D1',
            caps.canUseR2 ? '✓ R2' : '✗ R2'
          ].join(', ');
          task.output = caps.userEmail ? `${caps.userEmail}: ${status}` : status;
        } catch (error) {
          task.output = 'Capability detection failed; proceeding with default plan';
          ctx.cloudflareCapabilities = {
            authenticated: false,
            canUseD1: true,
            canUseR2: true
          };
        }
      }
    },
    {
      title: 'Generate Cloudflare plan',
      task: (ctx: BootstrapTaskContext, task: BootstrapTaskWrapper) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        ctx.cloudflarePlan = buildCloudflarePlan(
          ctx.envResult.env,
          ctx.cloudflareCapabilities
        );
        task.output = formatCloudflarePlan(ctx.cloudflarePlan);
      }
    },
    {
      title: 'Generate Stripe plan',
      task: async (ctx: BootstrapTaskContext, task: BootstrapTaskWrapper) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        const env = ctx.envResult.env;

        // Skip if no Stripe products configured
        if (!env.STRIPE_PRODUCTS || env.STRIPE_PRODUCTS.trim() === '') {
          task.skip('No STRIPE_PRODUCTS configured');
          return;
        }

        if (!env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.trim() === '') {
          task.skip?.('STRIPE_SECRET_KEY not configured');
          return;
        }

        const stripe = await createStripeClient(env.STRIPE_SECRET_KEY);
        const webhookUrl = env.STRIPE_WEBHOOK_URL ?? (env.PROJECT_DOMAIN ? `${env.PROJECT_DOMAIN}/api/webhooks/stripe` : undefined);

        ctx.stripePlan = await buildStripePlan(env, stripe, { webhookUrl });
        task.output = formatStripePlan(ctx.stripePlan);
      }
    }
  ];
}

export function createPreflightTasks(options: PipelineOptions = {}): Listr<BootstrapTaskContext> {
  const cwd = resolveCwd(options.cwd);
  return new Listr<BootstrapTaskContext>(baseTasks(cwd), {
    ctx: {},
    rendererOptions: {
      collapseSubtasks: false
    }
  });
}

export function createApplyTasks(options: PipelineOptions = {}): Listr<BootstrapTaskContext> {
  const cwd = resolveCwd(options.cwd);
  const dryRun = options.dryRun ?? false;
  const tasks = [
    ...baseTasks(cwd),
    {
      title: dryRun ? 'Preview Cloudflare actions' : 'Apply Cloudflare actions',
      task: async (ctx: BootstrapTaskContext, task: BootstrapTaskWrapper) => {
        if (!ctx.cloudflarePlan) {
          throw new Error('Cloudflare plan missing');
        }
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        const lines: string[] = [];
        const execution = await executeCloudflarePlan(ctx.cloudflarePlan, ctx.envResult.env, {
          dryRun,
          logger: (line) => {
            lines.push(line);
          }
        });
        task.output = lines.join('\n');
        if (!dryRun && execution.updates && Object.keys(execution.updates).length > 0) {
          ctx.envResult = mergeGeneratedValues(ctx.envResult, execution.updates);
        }
      }
    },
    {
      title: dryRun ? 'Preview Stripe provisioning' : 'Provision Stripe resources',
      skip: (ctx: BootstrapTaskContext) => {
        const env = ctx.envResult?.env;
        if (!env?.STRIPE_PRODUCTS || env.STRIPE_PRODUCTS.trim() === '') {
          return 'No STRIPE_PRODUCTS configured';
        }
        if (!env?.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.trim() === '') {
          return 'STRIPE_SECRET_KEY not configured';
        }
        return false;
      },
      task: async (ctx: BootstrapTaskContext, task: BootstrapTaskWrapper) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        const env = ctx.envResult.env;
        const stripe = await createStripeClient(env.STRIPE_SECRET_KEY);
        const webhookUrl = env.STRIPE_WEBHOOK_URL ?? (env.PROJECT_DOMAIN ? `${env.PROJECT_DOMAIN}/api/webhooks/stripe` : undefined);

        const lines: string[] = [];
        ctx.stripeResult = await executeStripePlan(env, stripe, {
          dryRun,
          webhookUrl,
          logger: (line) => {
            lines.push(line);
          }
        });
        task.output = lines.join('\n');
        if (!dryRun && ctx.stripeResult) {
        const productIds = ctx.stripeResult.products
          .map((p) => p.productId)
          .join(',');
        const priceIds = ctx.stripeResult.products
          .flatMap((p) => p.priceIds)
          .join(',');
        const stripeProductDefinitions = env.STRIPE_PRODUCT_DEFINITIONS ?? env.STRIPE_PRODUCTS ?? '';
        const stripeProductsPayload = buildStripeProductsPayload(env, ctx.stripeResult);
        const webhookSecret =
          ctx.stripeResult.webhook?.webhookSecret ?? env.STRIPE_WEBHOOK_SECRET ?? 'whsec_missing_secret';
        const stripeUpdates = {
          STRIPE_WEBHOOK_SECRET: webhookSecret,
          STRIPE_PRODUCT_DEFINITIONS: stripeProductDefinitions,
          STRIPE_PRODUCT_IDS: productIds,
          STRIPE_PRICE_IDS: priceIds,
          STRIPE_WEBHOOK_URL: webhookUrl,
          STRIPE_PRODUCTS: stripeProductsPayload
        } as Partial<GeneratedEnv>;
          ctx.envResult = mergeGeneratedValues(ctx.envResult, stripeUpdates);
        }
      }
    },
    {
      title: 'Write generated env files',
      enabled: () => !dryRun,
      task: async (ctx: BootstrapTaskContext, task: BootstrapTaskWrapper) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }

        const { summary } = await writeGeneratedArtifacts(cwd, ctx.envResult, {
          stripeResult: ctx.stripeResult
        });

        task.output = summary || 'No changes';
      }
    }
  ];

  return new Listr<BootstrapTaskContext>(tasks, {
    ctx: {},
    rendererOptions: {
      collapseSubtasks: false
    }
  });
}

export function createEnvGenerateTasks(options: EnvGenerateOptions = {}): Listr<EnvGenerateContext> {
  const cwd = resolveCwd(options.cwd);
  const checkOnly = options.checkOnly ?? false;

  return new Listr<EnvGenerateContext>(
    [
      {
        title: 'Load environment',
        task: (ctx: EnvGenerateContext, task: EnvGenerateTaskWrapper) => {
          ctx.envResult = loadBootstrapEnvironment({ cwd });
          task.output = ctx.envResult.report.summary;
        }
      },
      {
        title: 'Provision Stripe resources',
        skip: (ctx) => {
          const env = ctx.envResult?.env;
          if (!env?.STRIPE_PRODUCTS || env.STRIPE_PRODUCTS.trim() === '') {
            return 'No STRIPE_PRODUCTS configured';
          }
          return false;
        },
        task: async (ctx: EnvGenerateContext, task: EnvGenerateTaskWrapper) => {
          if (!ctx.envResult) {
            throw new Error('Environment not loaded');
          }

          const env = ctx.envResult.env;
          const stripe = await createStripeClient(env.STRIPE_SECRET_KEY);
          const webhookUrl = env.STRIPE_WEBHOOK_URL ?? (env.PROJECT_DOMAIN ? `${env.PROJECT_DOMAIN}/api/webhooks/stripe` : undefined);

          const lines: string[] = [];
          ctx.stripeResult = await executeStripePlan(env, stripe, {
            dryRun: checkOnly,
            webhookUrl,
            logger: (line) => {
              lines.push(line);
            }
          });
          task.output = lines.join('\n') || 'Stripe provisioned';
          if (!checkOnly && ctx.stripeResult) {
            const productIds = ctx.stripeResult.products
              .map((p) => p.productId)
              .join(',');
            const priceIds = ctx.stripeResult.products
              .flatMap((p) => p.priceIds)
              .join(',');
            const stripeProductDefinitions = env.STRIPE_PRODUCT_DEFINITIONS ?? env.STRIPE_PRODUCTS ?? '';
            const stripeProductsPayload = buildStripeProductsPayload(env, ctx.stripeResult);
            const webhookSecret =
              ctx.stripeResult.webhook?.webhookSecret ?? env.STRIPE_WEBHOOK_SECRET ?? 'whsec_missing_secret';
            const stripeUpdates = {
              STRIPE_WEBHOOK_SECRET: webhookSecret,
              STRIPE_PRODUCT_DEFINITIONS: stripeProductDefinitions,
              STRIPE_PRODUCT_IDS: productIds,
              STRIPE_PRICE_IDS: priceIds,
              STRIPE_WEBHOOK_URL: webhookUrl,
              STRIPE_PRODUCTS: stripeProductsPayload
            } as Partial<GeneratedEnv>;
            ctx.envResult = mergeGeneratedValues(ctx.envResult, stripeUpdates);
          }
        }
      },
      {
        title: checkOnly ? 'Check env files' : 'Write env files',
        task: async (ctx: EnvGenerateContext, task: EnvGenerateTaskWrapper) => {
          if (!ctx.envResult) {
            throw new Error('Environment not loaded');
          }

          const { results, summary } = await writeGeneratedArtifacts(cwd, ctx.envResult, {
            checkOnly,
            stripeResult: ctx.stripeResult
          });

          ctx.fileResults = results;
          task.output = summary || 'No changes';

          if (checkOnly && results.some((result) => result.changed)) {
            const diffPaths = results
              .filter((result) => result.changed)
              .map((result) => relative(cwd, result.path));
            throw new Error(
              `Differences detected in generated files: ${diffPaths.join(', ')}`
            );
          }
        }
      }
    ],
    {
      ctx: {},
      rendererOptions: {
        collapseSubtasks: false
      }
    }
  );
}

function formatWriteResult(cwd: string, result: FileWriteResult, checkOnly: boolean): string {
  const status = result.changed
    ? checkOnly
      ? 'diff'
      : 'updated'
    : 'unchanged';
  return `${status}: ${relative(cwd, result.path)}`;
}

async function writeGeneratedArtifacts(
  cwd: string,
  envResult: LoadEnvironmentResult,
  options: {
    checkOnly?: boolean;
    stripeResult?: StripeProvisionResult;
  }
): Promise<{ results: FileWriteResult[]; summary: string }> {
  const { checkOnly = false, stripeResult } = options;
  const { generatedEnvContents, devVarsContents } = buildGeneratedFiles({
    base: envResult.base,
    generated: envResult.generated,
    stripeResult
  });

  const results: FileWriteResult[] = [];
  results.push(
    await writeFileIfChanged(cwd, '.env.local.generated', generatedEnvContents, {
      checkOnly
    })
  );

  results.push(
    await writeFileIfChanged(cwd, 'workers/api/.dev.vars', devVarsContents, {
      checkOnly
    })
  );

  const summary = results
    .map((result) => formatWriteResult(cwd, result, checkOnly))
    .join('\n');

  return { results, summary };
}

export function createDeployTasks(options: DeployOptions = {}): Listr<DeployContext> {
  const cwd = resolveCwd(options.cwd);
  const checkOnly = options.checkOnly ?? false;
  const dryRun = options.dryRun ?? false;

  return new Listr<DeployContext>(
    [
    {
      title: 'Load environment',
      task: (ctx: DeployContext, task: DeployTaskWrapper) => {
        ctx.envResult = loadBootstrapEnvironment({ cwd });
        task.output = ctx.envResult.report.summary;
      }
    },
    {
      title: 'Build Expo web bundle',
      enabled: () => !checkOnly,
      task: async (ctx, task) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        if (shouldSkipExpoBuild(ctx.envResult.env)) {
          task.skip?.('Skipping Expo build in test mode or with placeholder credentials');
          return;
        }
        await execa('pnpm', ['--filter', '@justevery/web', 'run', 'build'], {
          cwd,
          stdio: 'inherit',
          env: createCommandEnv(ctx.envResult.env)
        });
      }
    },
    {
      title: 'Detect Cloudflare capabilities',
      task: async (ctx, task) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        const env = ctx.envResult.env;
        if (
          looksLikePlaceholderAccountId(env.CLOUDFLARE_ACCOUNT_ID) ||
          looksLikePlaceholderApiToken(env.CLOUDFLARE_API_TOKEN)
        ) {
          task.skip?.('Placeholder Cloudflare credentials');
          ctx.cloudflareCapabilities = {
            authenticated: false,
            canUseD1: false,
            canUseR2: false
          };
          return;
        }
        try {
          ctx.cloudflareCapabilities = await detectCloudflareCapabilities(env);
          const caps = ctx.cloudflareCapabilities;
          const status = [
            caps.authenticated ? '✓ authenticated' : '✗ not authenticated',
            caps.canUseD1 ? '✓ D1' : '✗ D1',
            caps.canUseR2 ? '✓ R2' : '✗ R2'
          ].join(', ');
          task.output = caps.userEmail ? `${caps.userEmail}: ${status}` : status;
        } catch (error) {
          task.output = 'Capability detection failed; proceeding with default plan';
          ctx.cloudflareCapabilities = {
            authenticated: false,
            canUseD1: true,
            canUseR2: true
          };
        }
      }
    },
    {
      title: checkOnly ? 'Skip R2 bucket ensure (check-only)' : dryRun ? 'Preview R2 bucket' : 'Ensure R2 bucket',
      enabled: () => !checkOnly,
      task: async (ctx, task) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        const env = ctx.envResult.env;
        if (
          looksLikePlaceholderAccountId(env.CLOUDFLARE_ACCOUNT_ID) ||
          looksLikePlaceholderApiToken(env.CLOUDFLARE_API_TOKEN)
        ) {
          task.skip?.('Placeholder Cloudflare credentials');
          return;
        }
        const bucketName = deriveR2BucketName(env);
        const client = createCloudflareClient(env);
        const existing = await client.getR2Bucket(bucketName);
        if (existing) {
          task.output = `${bucketName} (exists)`;
        } else if (dryRun) {
          task.output = `${bucketName} (would create)`;
        } else {
          await client.createR2Bucket(bucketName);
          task.output = `${bucketName} (created)`;
        }
        if (!dryRun) {
          ctx.envResult = mergeGeneratedValues(ctx.envResult, {
            CLOUDFLARE_R2_BUCKET: bucketName
          });
        }
      }
    },
    {
      title: checkOnly ? 'Skip D1 migrations (check-only)' : 'Run D1 migrations',
      enabled: () => !checkOnly && !dryRun,
      task: async (ctx, task) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        if (shouldSkipWranglerCommands(ctx.envResult.env)) {
          task.skip?.('Skipping migrations with placeholder credentials');
          return;
        }
        await execa('pnpm', ['--filter', '@justevery/worker', 'run', 'migrate', '--', '--remote'], {
          cwd,
          stdio: 'inherit',
          env: createCommandEnv(ctx.envResult.env)
        });
        task.output = 'D1 migrations applied';
      }
    },
    {
      title: 'Check Wrangler CLI',
      enabled: () => !checkOnly,
      task: async (ctx, task) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        if (shouldSkipWranglerCommands(ctx.envResult.env)) {
          task.skip?.('Skipping Wrangler checks in test mode or with placeholder credentials');
          return;
        }
        await ensureWranglerReady({ cwd });
      }
    },
    {
      title: checkOnly ? 'Check Wrangler config' : 'Render Wrangler config',
      task: async (ctx, task) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        ctx.wranglerResult = await renderWranglerConfig({
          cwd,
          checkOnly,
          env: ctx.envResult.env,
          capabilities: ctx.cloudflareCapabilities
        });
        task.output = formatWriteResult(cwd, ctx.wranglerResult, checkOnly);
        if (checkOnly && ctx.wranglerResult.changed) {
          throw new Error('Differences detected in wrangler.toml');
        }
      }
    },
    {
      title: dryRun ? 'Skip secret sync (dry run)' : 'Sync worker secrets',
      enabled: () => !checkOnly,
      task: async (ctx, task) => {
        if (dryRun) {
          task.skip?.('Dry run requested; skipping secret sync');
          return;
        }
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        if (shouldSkipWranglerCommands(ctx.envResult.env)) {
          task.skip?.('Skipping secret sync with placeholder credentials');
          return;
        }

        const secrets: Array<{ name: string; value?: string | null; placeholder?: string }> = [
          {
            name: 'STRIPE_SECRET_KEY',
            value: ctx.envResult.env.STRIPE_SECRET_KEY?.trim()
          },
          {
            name: 'STRIPE_WEBHOOK_SECRET',
            value: ctx.envResult.env.STRIPE_WEBHOOK_SECRET?.trim(),
            placeholder: 'whsec_missing_secret'
          }
        ];

        const updates: string[] = [];
        for (const secret of secrets) {
          if (!secret.value || (secret.placeholder && secret.value === secret.placeholder)) {
            updates.push(`${secret.name} skipped (not configured)`);
            continue;
          }
          await execa('wrangler', [
            '--config',
            'workers/api/wrangler.toml',
            'secret',
            'put',
            secret.name
          ], {
            cwd,
            input: `${secret.value}\n`
          });
          updates.push(`${secret.name} updated`);
        }

        if (updates.every((entry) => entry.includes('skipped'))) {
          task.skip?.('Worker secrets not configured; nothing to sync');
          return;
        }

        task.output = updates.join('\n');
      }
    },
    {
      title: dryRun ? 'Skip deploy (dry run)' : 'Deploy worker',
      enabled: () => !checkOnly,
      task: async (ctx, task) => {
        if (dryRun) {
          ctx.deployResult = { command: 'pnpm --filter @justevery/worker run deploy', dryRun: true };
          task.skip?.('Dry run requested; skipping deploy');
          return;
        }

        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }

        guardCloudflareCredentials(ctx.envResult.env);
        await execa('pnpm', ['--filter', '@justevery/worker', 'run', 'deploy'], {
          cwd,
          stdio: 'inherit'
        });
        ctx.deployResult = { command: 'pnpm --filter @justevery/worker run deploy', dryRun: false };
      }
    },
    {
      title: 'Deployment summary',
      task: (ctx, task) => {
        if (!ctx.envResult) {
          throw new Error('Environment not loaded');
        }
        const env = ctx.envResult.env;
        const appUrl = env.APP_URL ?? deriveAppUrl(env);
        const workerOrigin = env.WORKER_ORIGIN ?? deriveWorkerOrigin(env, appUrl);
        task.output = [
          `App URL: ${appUrl ?? 'n/a'}`,
          `Worker URL: ${workerOrigin ?? 'n/a'}`,
          'Next steps: verify the deployment and run any smoke tests.'
        ].join('\n');
      }
    }
    ],
    {
      ctx: {},
      rendererOptions: {
        collapseSubtasks: false
      }
    }
  );
}

function createCommandEnv(env: BootstrapEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value == null) {
      continue;
    }
    next[key] = String(value);
  }
  return next;
}

function deriveR2BucketName(env: BootstrapEnv): string {
  const desired = env.CLOUDFLARE_R2_BUCKET?.trim();
  if (desired) {
    return slugifyBucketName(desired);
  }
  return slugifyBucketName(`${env.PROJECT_ID}-assets`);
}

function slugifyBucketName(input: string): string {
  let value = input.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  value = value.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (value.length === 0) {
    value = 'assets';
  }
  if (!/^[a-z0-9]/.test(value)) {
    value = `a${value}`;
  }
  if (!/[a-z0-9]$/.test(value)) {
    value = `${value}z`;
  }
  if (value.length < 3) {
    value = `${value}assets`.slice(0, 3);
  }
  if (value.length > 63) {
    value = value.slice(0, 63).replace(/-+$/g, '');
    if (value.length < 3) {
      value = value.padEnd(3, 'a');
    }
  }
  value = value.replace(/(\d{3})(\d+)$/, (_match, prefix: string) => prefix);
  return value;
}

export const __deployInternals = {
  slugifyBucketName,
  deriveR2BucketName
};

function shouldSkipWranglerCommands(env?: BootstrapEnv): boolean {
  return shouldSkipExpensiveCommand(env, 'BOOTSTRAP_FORCE_WRANGLER');
}

function shouldSkipExpoBuild(env?: BootstrapEnv): boolean {
  return shouldSkipExpensiveCommand(env, 'BOOTSTRAP_FORCE_EXPO_BUILD');
}

function shouldSkipExpensiveCommand(env: BootstrapEnv | undefined, forceFlag?: string): boolean {
  if (forceFlag && isTruthyEnvVar(process.env[forceFlag])) {
    return false;
  }
  if (isTestRuntime()) {
    return true;
  }
  if (!env) {
    return true;
  }
  if (
    looksLikePlaceholderAccountId(env.CLOUDFLARE_ACCOUNT_ID) ||
    looksLikePlaceholderApiToken(env.CLOUDFLARE_API_TOKEN)
  ) {
    return true;
  }
  return false;
}

function isTruthyEnvVar(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

function isTestRuntime(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

function guardCloudflareCredentials(env: BootstrapEnv): void {
  const placeholders: string[] = [];

  if (looksLikePlaceholderApiToken(env.CLOUDFLARE_API_TOKEN)) {
    placeholders.push('CLOUDFLARE_API_TOKEN');
  }

  if (looksLikePlaceholderAccountId(env.CLOUDFLARE_ACCOUNT_ID)) {
    placeholders.push('CLOUDFLARE_ACCOUNT_ID');
  }

  if (placeholders.length > 0) {
    throw new Error(
      `Replace placeholder Cloudflare credentials: ${placeholders.join(', ')}. ` +
        'See docs/SECRETS_CLOUDFLARE.md for setup instructions.'
    );
  }
}

const GENERIC_PLACEHOLDER_VALUES = new Set([
  'token',
  'api token',
  'api-token',
  'api_token',
  'account id',
  'account-id',
  'account_id',
  'cf account',
  'cf-account',
  'cf_account',
  'demo',
  'example',
  'placeholder',
  'changeme',
  'change-me',
  'change_me',
  'test'
]);

function looksLikePlaceholderAccountId(value: string): boolean {
  const trimmed = value.trim();
  if (isGenericPlaceholder(trimmed)) {
    return true;
  }

  return !/^[a-f0-9]{32}$/i.test(trimmed);
}

function looksLikePlaceholderApiToken(value: string): boolean {
  const trimmed = value.trim();
  if (isGenericPlaceholder(trimmed)) {
    return true;
  }

  if (trimmed.length < 30) {
    return true;
  }

  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    return true;
  }

  return false;
}

function isGenericPlaceholder(raw: string): boolean {
  if (!raw) {
    return true;
  }

  const lowered = raw.toLowerCase();
  if (GENERIC_PLACEHOLDER_VALUES.has(lowered)) {
    return true;
  }

  if (/^<.*>$/.test(raw)) {
    return true;
  }

  if (
    lowered.startsWith('your ') ||
    lowered.startsWith('your-') ||
    lowered.startsWith('your_')
  ) {
    return true;
  }

  if (lowered.includes(' your ') || lowered.includes('example') || lowered.includes('placeholder')) {
    return true;
  }

  return false;
}

export function createSmokeTasks(options: SmokeOptions = {}): Listr<SmokeContext> {
  const cwd = resolveCwd(options.cwd);

  return new Listr<SmokeContext>(
    [
      {
        title: 'Load environment',
        task: (ctx: SmokeContext, task: ListrTaskWrapper<SmokeContext, any, any>) => {
          ctx.envResult = loadBootstrapEnvironment({ cwd });
          task.output = ctx.envResult.report.summary;
        }
      },
      {
        title: 'Run smoke checks',
        task: async (ctx, task) => {
          if (!ctx.envResult) {
            throw new Error('Environment not loaded');
          }

          const env = ctx.envResult.env;
          const baseCandidate = options.base ?? env.PROJECT_DOMAIN ?? env.APP_URL ?? env.EXPO_PUBLIC_WORKER_ORIGIN;
          const baseUrl = normaliseBase(baseCandidate);
          if (!baseUrl) {
            throw new Error('Base URL required (set PROJECT_DOMAIN, APP_URL, or use --base).');
          }

          const routes = options.routes;
          const mode = options.mode ?? 'full';
          const projectId = options.projectId ?? env.PROJECT_ID ?? null;
          const result = await runSmoke({
            baseUrl,
            routes,
            bearerToken: options.token ?? null,
            outputRoot: options.outputDir,
            stamp: options.stamp,
            mode,
            skipWrangler: options.skipWrangler,
            attempts: options.attempts,
            delayMs: options.delayMs,
            headless: options.headless ?? true,
            projectId,
            d1Name: options.d1Name ?? env.D1_DATABASE_NAME ?? null,
            r2Bucket: options.r2Bucket ?? env.CLOUDFLARE_R2_BUCKET ?? null
          });

          ctx.smokeResult = result;
          task.output = result.checks.ok
            ? `Checks passed (${result.checks.checks.length} endpoints)`
            : 'Smoke checks reported failures';

          if (!result.checks.ok) {
            throw new Error('Smoke checks failed');
          }
        }
      }
    ],
    {
      ctx: {},
      rendererOptions: {
        collapseSubtasks: false
      }
    }
  );
}

function resolveCwd(explicit?: string): string {
  if (explicit) {
    return explicit;
  }
  const start = process.env.INIT_CWD ?? process.cwd();
  return findWorkspaceRoot(start);
}

function findWorkspaceRoot(start: string): string {
  let current = start;
  while (true) {
    if (
      existsSync(resolve(current, 'pnpm-workspace.yaml')) ||
      existsSync(resolve(current, '.git'))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

function normaliseBase(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return raw;
  }
}
