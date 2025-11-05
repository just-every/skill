#!/usr/bin/env node

const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_OUTPUT_DIR = path.join('test-results', 'smoke');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (!entry.startsWith('--')) continue;
    const [flag, raw] = entry.split('=');
    const key = flag.slice(2);
    if (raw !== undefined) {
      args[key] = raw;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function formatTimestamp(date = new Date()) {
  const pad = (num) => String(num).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function resolveBase(baseArg) {
  try {
    const parsed = new URL(baseArg);
    return parsed.toString();
  } catch (error) {
    throw new Error(`Invalid base URL: ${baseArg}`);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));

  const baseArg = argv.base || process.env.E2E_BASE_URL || process.env.PROJECT_DOMAIN;
  if (!baseArg) {
    throw new Error('Provide --base or set PROJECT_DOMAIN/E2E_BASE_URL for the smoke suite.');
  }
  const baseUrl = resolveBase(baseArg);

  const outDir = path.resolve(argv.out || DEFAULT_OUTPUT_DIR);
  const stamp = argv.stamp || formatTimestamp();
  const mode = argv.mode || process.env.SMOKE_MODE || 'full';

  const sharedArgs = ['--base', baseUrl, '--out', outDir, '--stamp', stamp];
  if (argv.routes) sharedArgs.push('--routes', argv.routes);
  if (argv.token) sharedArgs.push('--token', argv.token);
  if (argv['skip-wrangler']) sharedArgs.push('--skip-wrangler');
  if (argv.attempts) sharedArgs.push('--attempts', argv.attempts);
  if (argv.delay) sharedArgs.push('--delay', argv.delay);
  if (argv['project-id']) sharedArgs.push('--project-id', argv['project-id']);
  if (argv['d1-name']) sharedArgs.push('--d1-name', argv['d1-name']);
  if (mode) sharedArgs.push('--mode', mode);

  const checkArgs = [...sharedArgs];
  const screenArgs = [...sharedArgs];
  if (argv.headless) screenArgs.push('--headless', argv.headless);

  await run('node', ['scripts/smoke-check.cjs', ...checkArgs]);
  await run('node', ['scripts/smoke-screens.cjs', ...screenArgs]);

  console.log(`Smoke suite completed. Artifacts in ${path.join(outDir, stamp)}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
