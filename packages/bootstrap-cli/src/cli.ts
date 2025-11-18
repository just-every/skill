import { pathToFileURL } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  BootstrapEnvError,
  runApply,
  runDeploy,
  runEnvGenerate,
  runPreflight,
  runSmoke
} from './index.js';

export function createCli(): Command {
  const program = new Command()
    .name('bootstrap')
    .description('Provision justevery infrastructure components')
    .showHelpAfterError('(add --help for usage information)')
    .showSuggestionAfterError();

  program
    .command('preflight')
    .description('Validate environment configuration and preview provider plans')
    .option('--cwd <path>', 'Workspace root')
    .action(async (options: { cwd: string }) => {
      try {
        await runPreflight({ cwd: options.cwd });
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('apply')
    .description('Apply provider plans (use --dry-run to preview)')
    .option('--cwd <path>', 'Workspace root')
    .option('--dry-run', 'Preview without applying changes', false)
    .option('--deploy', 'Run deploy after apply completes', false)
    .action(async (options: { cwd: string; dryRun?: boolean; deploy?: boolean }) => {
      const argvDryRun = process.argv.includes('--dry-run');
      const argvNoDryRun = process.argv.includes('--no-dry-run');
      const dryRun = argvNoDryRun
        ? false
        : options.dryRun === undefined
          ? argvDryRun
          : options.dryRun;
      const deployFlag = options.deploy ?? process.argv.includes('--deploy');
      try {
        await runApply({ cwd: options.cwd, dryRun });
        if (deployFlag) {
          await runDeploy({
            cwd: options.cwd,
            dryRun: dryRun,
            checkOnly: dryRun
          });
        }
      } catch (error) {
        handleError(error);
      }
    });

  const envCommand = program
    .command('env')
    .description('Environment file utilities');

  envCommand
    .command('generate')
    .description('Generate .env.generated and workers/api/.dev.vars')
    .option('--cwd <path>', 'Workspace root')
    .option('--check', 'Check for differences without writing files', false)
    .action(async (options: { cwd: string; check?: boolean }) => {
      try {
        const checkFromArgv = process.argv.includes('--check');
        await runEnvGenerate({
          cwd: options.cwd,
          checkOnly: options.check ?? checkFromArgv
        });
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('env:generate')
    .description('Alias for env generate')
    .option('--cwd <path>', 'Workspace root')
    .option('--check', 'Check for differences without writing files', false)
    .action(async (options: { cwd: string; check?: boolean }) => {
      try {
        const checkFromArgv = process.argv.includes('--check');
        await runEnvGenerate({
          cwd: options.cwd,
          checkOnly: options.check ?? checkFromArgv
        });
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('deploy')
    .description('Render wrangler.toml and deploy the worker')
    .option('--cwd <path>', 'Workspace root')
    .option('--check', 'Check for differences without writing files')
    .option('--dry-run', 'Render only; skip deploy step')
    .action(async (options: { cwd: string; check?: boolean; dryRun?: boolean }) => {
      try {
        const argvCheck = process.argv.includes('--check');
        const argvDryRun = process.argv.includes('--dry-run');
        const checkOnly = options.check ?? false;
        const dryRun = options.dryRun ?? false;
        await runDeploy({
          cwd: options.cwd,
          checkOnly: checkOnly || argvCheck,
          dryRun: dryRun || argvDryRun
        });
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('smoke')
    .description('Run HTTP smoke checks and capture screenshots')
    .option('--cwd <path>', 'Workspace root')
    .option('--base <url>', 'Base URL to test')
    .option('--mode <mode>', 'full|minimal', 'full')
    .option('--token <token>', 'Bearer token for authenticated requests')
    .option('--routes <routes>', 'Comma separated list of routes to visit')
    .option('--out <dir>', 'Output directory for artefacts')
    .option('--stamp <stamp>', 'Custom stamp for artefacts')
    .option('--skip-wrangler', 'Skip Wrangler remote checks', false)
    .option('--attempts <n>', 'HTTP retry attempts', (value) => Number.parseInt(value, 10))
    .option('--delay-ms <n>', 'Backoff delay between retries', (value) => Number.parseInt(value, 10))
    .option('--project-id <id>', 'Project ID for D1 validation')
    .option('--d1-name <name>', 'Explicit D1 database name')
    .option('--r2-bucket <name>', 'Explicit R2 bucket name')
    .option('--no-headless', 'Run Playwright with UI (non-headless)')
    .action(async (options: {
      cwd: string;
      base?: string;
      mode?: string;
      token?: string;
      routes?: string;
      out?: string;
      stamp?: string;
      skipWrangler?: boolean;
      attempts?: number;
      delayMs?: number;
      projectId?: string;
      d1Name?: string;
      r2Bucket?: string;
      headless?: boolean;
    }) => {
      try {
        const mode = (options.mode ?? 'full').toLowerCase() === 'minimal' ? 'minimal' : 'full';
        const routes = options.routes ? options.routes.split(',').map((route) => route.trim()).filter(Boolean) : undefined;
        await runSmoke({
          cwd: options.cwd,
          base: options.base,
          mode,
          routes,
          token: options.token,
          outputDir: options.out,
          stamp: options.stamp,
          skipWrangler: options.skipWrangler,
          attempts: options.attempts,
          delayMs: options.delayMs,
          headless: options.headless ?? true,
          projectId: options.projectId,
          d1Name: options.d1Name,
          r2Bucket: options.r2Bucket
        });
      } catch (error) {
        handleError(error);
      }
    });

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createCli();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    handleError(error);
  }
}

function handleError(error: unknown): never {
  if (error instanceof BootstrapEnvError) {
    console.error(chalk.red(error.message));
  } else if (error instanceof Error) {
    console.error(chalk.red(error.message));
  } else {
    console.error(chalk.red(String(error)));
  }
  process.exit(1);
}

const entry = process.argv[1];
if (entry) {
  const entryUrl = pathToFileURL(entry).href;
  if (entryUrl === import.meta.url) {
    runCli();
  }
}
