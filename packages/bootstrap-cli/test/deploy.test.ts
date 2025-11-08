import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BootstrapEnv } from '../src/env.js';
import { renderTemplate, renderWranglerConfig } from '../src/deploy/render.js';
import { runDeploy } from '../src/index.js';
import { __cloudflareInternals } from '../src/providers/cloudflare.js';
import * as logtoProvider from '../src/providers/logto.js';

vi.mock('execa', () => {
  return {
    execa: vi.fn(async () => ({ stdout: '' }))
  };
});

const { execa } = await import('execa');
const execaMock = vi.mocked(execa);

const SAMPLE_ENV: BootstrapEnv = {
  PROJECT_ID: 'demo',
  PROJECT_DOMAIN: 'https://demo.example',
  APP_URL: 'https://demo.example/app',
  APP_BASE_URL: '/app',
  WORKER_ORIGIN: 'https://worker.demo.example',
  CLOUDFLARE_ACCOUNT_ID: '1234567890abcdef1234567890abcdef',
  CLOUDFLARE_API_TOKEN: 'v1.0-1234567890abcdef1234567890abcd',
  CLOUDFLARE_ZONE_ID: 'zone-123',
  CLOUDFLARE_D1_NAME: 'demo-d1',
  CLOUDFLARE_R2_BUCKET: 'demo-assets',
  LOGTO_ENDPOINT: 'https://auth.demo.example',
  LOGTO_API_RESOURCE: 'https://api.demo.example',
  LOGTO_APPLICATION_ID: 'logto-app',
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PRODUCTS: '[{"name":"Pro","amount":1000,"currency":"usd"}]'
};

const TEMPLATE = `name = "{{PROJECT_ID}}-worker"
[vars]
LOGTO_ENDPOINT = "{{LOGTO_ENDPOINT}}"
STRIPE_PRODUCTS = "{{STRIPE_PRODUCTS}}"
[d1_databases]
[[d1_databases.bindings]]
database_name = "{{D1_DATABASE_NAME}}"
database_id = "{{D1_DATABASE_ID}}"
`;

const ENV_KEYS = [
  'PROJECT_ID',
  'PROJECT_DOMAIN',
  'APP_URL',
  'APP_BASE_URL',
  'WORKER_ORIGIN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
  'CLOUDFLARE_D1_NAME',
  'CLOUDFLARE_R2_BUCKET',
  'LOGTO_ENDPOINT',
  'LOGTO_API_RESOURCE',
  'LOGTO_APPLICATION_ID',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRODUCTS'
] as const;

const activeEnvRestorers: Array<() => void> = [];

beforeEach(() => {
  vi.spyOn(logtoProvider, 'provisionLogto').mockResolvedValue({
    applicationId: 'logto-app-generated',
    applicationSecret: 'logto-secret-generated',
    apiResourceId: 'logto-resource-generated'
  });
});

function forceExpensiveCommands(): void {
  const previousWrangler = process.env.BOOTSTRAP_FORCE_WRANGLER;
  const previousExpo = process.env.BOOTSTRAP_FORCE_EXPO_BUILD;
  process.env.BOOTSTRAP_FORCE_WRANGLER = '1';
  process.env.BOOTSTRAP_FORCE_EXPO_BUILD = '1';
  activeEnvRestorers.push(() => {
    if (previousWrangler == null) {
      delete process.env.BOOTSTRAP_FORCE_WRANGLER;
    } else {
      process.env.BOOTSTRAP_FORCE_WRANGLER = previousWrangler;
    }
    if (previousExpo == null) {
      delete process.env.BOOTSTRAP_FORCE_EXPO_BUILD;
    } else {
      process.env.BOOTSTRAP_FORCE_EXPO_BUILD = previousExpo;
    }
  });
}

function createWorkspace(env: BootstrapEnv = SAMPLE_ENV): string {
  const dir = mkdtempSync(join(tmpdir(), 'bootstrap-cli-deploy-'));
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages: []\n');
  const templatePath = join(dir, 'workers/api');
  mkdirSync(templatePath, { recursive: true });
  writeFileSync(join(templatePath, 'wrangler.toml.template'), TEMPLATE, {
    encoding: 'utf8',
    flag: 'w',
    mode: 0o644
  });
  writeFileSync(join(dir, '.env'), buildEnvFile(env));
  const restoreEnv = stubEnvironment(env);
  activeEnvRestorers.push(restoreEnv);
  __cloudflareInternals.setRunWranglerDelegate(async (args) => {
    if (args[0] === 'whoami') {
      return 'user@example.com';
    }
    if (args[0] === 'd1' && args[1] === 'list') {
      return '[]';
    }
    if (args[0] === 'r2' && args[1] === 'bucket' && args[2] === 'list') {
      return '[]';
    }
    return '';
  });
  return dir;
}

function buildEnvFile(env: BootstrapEnv): string {
  return [
    `PROJECT_ID=${env.PROJECT_ID}`,
    `PROJECT_DOMAIN=${env.PROJECT_DOMAIN}`,
    `APP_URL=${env.APP_URL}`,
    `APP_BASE_URL=${env.APP_BASE_URL}`,
    `WORKER_ORIGIN=${env.WORKER_ORIGIN}`,
    `CLOUDFLARE_ACCOUNT_ID=${env.CLOUDFLARE_ACCOUNT_ID}`,
    `CLOUDFLARE_API_TOKEN=${env.CLOUDFLARE_API_TOKEN}`,
    `CLOUDFLARE_ZONE_ID=${env.CLOUDFLARE_ZONE_ID}`,
    `CLOUDFLARE_D1_NAME=${env.CLOUDFLARE_D1_NAME}`,
    `CLOUDFLARE_R2_BUCKET=${env.CLOUDFLARE_R2_BUCKET}`,
    `LOGTO_ENDPOINT=${env.LOGTO_ENDPOINT}`,
    `LOGTO_API_RESOURCE=${env.LOGTO_API_RESOURCE}`,
    `LOGTO_APPLICATION_ID=${env.LOGTO_APPLICATION_ID}`,
    `STRIPE_SECRET_KEY=${env.STRIPE_SECRET_KEY}`,
    `STRIPE_WEBHOOK_SECRET=${env.STRIPE_WEBHOOK_SECRET}`,
    `STRIPE_PRODUCTS=${env.STRIPE_PRODUCTS}`
  ].join('\n');
}

function stubEnvironment(env: BootstrapEnv): () => void {
  const previous: Array<[string, string | undefined]> = [];
  for (const key of ENV_KEYS) {
    const prior = process.env[key];
    previous.push([key, prior]);
    const value = env[key as keyof BootstrapEnv];
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  return () => {
    while (previous.length) {
      const [key, value] = previous.pop()!;
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

afterEach(() => {
  vi.resetAllMocks();
  __cloudflareInternals.resetRunWranglerDelegate();
  while (activeEnvRestorers.length) {
    const restore = activeEnvRestorers.pop();
    restore?.();
  }
});

describe('wrangler rendering', () => {
  it('replaces placeholders deterministically', () => {
    const rendered = renderTemplate(TEMPLATE, SAMPLE_ENV);
    expect(rendered).toContain('name = "demo-worker"');
    expect(rendered).toContain('LOGTO_ENDPOINT = "https://auth.demo.example"');
    expect(rendered).toContain('STRIPE_PRODUCTS = "[{\\"name\\":\\"Pro\\",\\"amount\\":1000,\\"currency\\":\\"usd\\"}]"');
    expect(rendered).toContain('database_name = "demo-d1"');
    expect(rendered).toContain('database_id = ""');
  });

  it('writes wrangler.toml and remains idempotent', async () => {
    const dir = createWorkspace();
    try {
      const first = await renderWranglerConfig({ cwd: dir, env: SAMPLE_ENV });
      expect(first.changed).toBe(true);

      const second = await renderWranglerConfig({ cwd: dir, env: SAMPLE_ENV });
      expect(second.changed).toBe(false);

      const output = readFileSync(join(dir, 'workers/api/wrangler.toml'), 'utf8');
      expect(output).toContain('demo-worker');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects differences in check mode without writing', async () => {
    const dir = createWorkspace();
    try {
      await renderWranglerConfig({ cwd: dir, env: SAMPLE_ENV });
      writeFileSync(join(dir, 'workers/api/wrangler.toml'), '# drift\n');
      const result = await renderWranglerConfig({ cwd: dir, env: SAMPLE_ENV, checkOnly: true });
      expect(result.changed).toBe(true);
      expect(result.skipped).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('deploy command', () => {
  it('renders config and skips deploy during dry run', async () => {
    const dir = createWorkspace();
    try {
      await runDeploy({ cwd: dir, dryRun: true });
      expect(execaMock).not.toHaveBeenCalled();
      const output = readFileSync(join(dir, 'workers/api/wrangler.toml'), 'utf8');
      expect(output).toContain('demo-worker');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs wrangler preflight and deploy when not in dry run', async () => {
    const dir = createWorkspace();
    try {
      forceExpensiveCommands();
      await runDeploy({ cwd: dir, dryRun: false });
      expect(execaMock).toHaveBeenNthCalledWith(
        1,
        'pnpm',
        ['--filter', '@justevery/web', 'run', 'build'],
        expect.objectContaining({ cwd: dir, stdio: 'inherit' })
      );
      expect(execaMock).toHaveBeenNthCalledWith(
        2,
        'wrangler',
        ['--version'],
        expect.objectContaining({ cwd: dir, stdout: 'ignore', stderr: 'pipe' })
      );
      expect(execaMock).toHaveBeenNthCalledWith(
        3,
        'wrangler',
        ['whoami'],
        expect.objectContaining({ cwd: dir, stdout: 'ignore', stderr: 'pipe' })
      );
      expect(execaMock).toHaveBeenNthCalledWith(
        4,
        'pnpm',
        ['--filter', '@justevery/worker', 'run', 'deploy'],
        expect.objectContaining({ cwd: dir, stdio: 'inherit' })
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails fast when wrangler CLI is missing', async () => {
    const dir = createWorkspace();
    try {
      forceExpensiveCommands();
      execaMock
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error('command not found'));
      await expect(runDeploy({ cwd: dir, dryRun: false })).rejects.toThrow('Wrangler CLI not available');
      expect(execaMock).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails fast when wrangler authentication is missing', async () => {
    const dir = createWorkspace();
    try {
      forceExpensiveCommands();
      execaMock
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({ stdout: '' } as any)
        .mockRejectedValueOnce(new Error('not authenticated'));
      await expect(runDeploy({ cwd: dir, dryRun: false })).rejects.toThrow('Wrangler authentication check failed');
      expect(execaMock).toHaveBeenCalledTimes(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails fast when Cloudflare credentials look like placeholders', async () => {
    const dir = createWorkspace({
      ...SAMPLE_ENV,
      CLOUDFLARE_ACCOUNT_ID: '<your-account-id>',
      CLOUDFLARE_API_TOKEN: 'token'
    });
    try {
      await expect(runDeploy({ cwd: dir, dryRun: false })).rejects.toThrow(
        /Replace placeholder Cloudflare credentials: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID/
      );
      expect(execaMock).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when check-only detects differences', async () => {
    const dir = createWorkspace();
    try {
      await renderWranglerConfig({ cwd: dir, env: SAMPLE_ENV });
      writeFileSync(join(dir, 'workers/api/wrangler.toml'), '# drift\n');
      await expect(runDeploy({ cwd: dir, checkOnly: true })).rejects.toThrow(
        /Differences detected/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
