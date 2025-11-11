import {
  createApplyTasks,
  createDeployTasks,
  createEnvGenerateTasks,
  createPreflightTasks,
  createSmokeTasks
} from './tasks.js';

export type { BootstrapEnv, LoadEnvironmentResult } from './env.js';
export { loadBootstrapEnvironment, BootstrapEnvError } from './env.js';

export interface RunOptions {
  cwd?: string;
  dryRun?: boolean;
}

export async function runPreflight(options: RunOptions = {}): Promise<void> {
  const tasks = createPreflightTasks(options);
  await tasks.run();
}

export async function runApply(options: RunOptions = {}): Promise<void> {
  const tasks = createApplyTasks(options);
  await tasks.run();
}

export async function runEnvGenerate(options: RunOptions & { checkOnly?: boolean } = {}): Promise<void> {
  const tasks = createEnvGenerateTasks({ ...options, checkOnly: options.checkOnly ?? false });
  await tasks.run();
}

export async function runDeploy(
  options: RunOptions & { checkOnly?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  const applyDryRun = Boolean(options.dryRun || options.checkOnly);
  await runApply({ cwd: options.cwd, dryRun: applyDryRun });
  const tasks = createDeployTasks({
    cwd: options.cwd,
    checkOnly: options.checkOnly ?? false,
    dryRun: options.dryRun ?? false
  });
  await tasks.run();
}

export async function runSmoke(options: RunOptions & {
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
} = {}): Promise<void> {
  const tasks = createSmokeTasks({
    cwd: options.cwd,
    base: options.base,
    mode: options.mode,
    routes: options.routes,
    token: options.token,
    outputDir: options.outputDir,
    stamp: options.stamp,
    skipWrangler: options.skipWrangler,
    attempts: options.attempts,
    delayMs: options.delayMs,
    headless: options.headless,
    projectId: options.projectId,
    d1Name: options.d1Name,
    r2Bucket: options.r2Bucket
  });
  await tasks.run();
}
