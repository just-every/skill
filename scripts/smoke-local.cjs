#!/usr/bin/env node

/**
 * Local smoke test runner
 *
 * This script:
 * 1. Installs Playwright browsers if missing
 * 2. Starts wrangler dev on port 9788
 * 3. Waits for the server to be ready
 * 4. Runs smoke tests against the local server (defaults to /,/api/session)
 * 5. Captures artifacts under test-results/smoke-local/
 * 6. Shuts down wrangler dev
 *
 * Usage:
 *   npm run smoke:local                           # Default routes: /,/api/session
 *   npm run smoke:local -- --routes /,/api/health # Custom routes
 */

const { spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');

const execFileAsync = promisify(execFile);

const WRANGLER_PORT = 9788;
const BASE_URL = `http://127.0.0.1:${WRANGLER_PORT}`;
const WRANGLER_CONFIG = 'workers/api/wrangler.toml';
const OUTPUT_DIR = 'test-results/smoke-local';
const MAX_STARTUP_WAIT = 60000; // 60 seconds
const READINESS_CHECK_INTERVAL = 1000; // 1 second

/**
 * Install Playwright browsers if needed
 */
async function ensurePlaywrightBrowsers() {
  console.log('Checking Playwright browsers...');
  try {
    await execFileAsync('npx', ['playwright', 'install', 'chromium'], {
      stdio: 'inherit',
    });
    console.log('✓ Playwright browsers ready');
  } catch (error) {
    console.warn('Warning: Failed to install Playwright browsers:', error.message);
    // Continue anyway - the smoke test might still work
  }
}

/**
 * Check if wrangler dev is ready by attempting to fetch from the base URL
 */
async function checkServerReady(baseUrl) {
  try {
    const response = await fetch(baseUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.status !== undefined; // Any response means server is up
  } catch (error) {
    return false;
  }
}

/**
 * Wait for wrangler dev to be ready
 */
async function waitForServerReady(baseUrl, maxWait = MAX_STARTUP_WAIT) {
  const startTime = Date.now();
  console.log(`Waiting for server at ${baseUrl} to be ready...`);

  while (Date.now() - startTime < maxWait) {
    if (await checkServerReady(baseUrl)) {
      console.log('✓ Server is ready');
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, READINESS_CHECK_INTERVAL));
  }

  throw new Error(`Server did not become ready within ${maxWait}ms`);
}

/**
 * Start wrangler dev process
 */
function startWranglerDev(configPath, port) {
  console.log(`Starting wrangler dev on port ${port}...`);

  const wranglerProcess = spawn(
    'wrangler',
    ['dev', '--config', configPath, '--port', String(port), '--local'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    }
  );

  // Log output for debugging
  wranglerProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (process.env.DEBUG) {
      console.log('[wrangler]', output);
    }
  });

  wranglerProcess.stderr.on('data', (data) => {
    const output = data.toString();
    if (process.env.DEBUG) {
      console.error('[wrangler error]', output);
    }
  });

  wranglerProcess.on('error', (error) => {
    console.error('Failed to start wrangler:', error);
  });

  return wranglerProcess;
}

/**
 * Run the smoke tests
 */
async function runSmokeTests(baseUrl, outputDir, customRoutes = null) {
  console.log('Running smoke tests...');

  const timestamp = formatTimestamp();
  const cwd = process.cwd();

  // Use absolute path for output directory
  const absoluteOutputDir = path.resolve(cwd, outputDir);

  // Set minimal environment variables required for smoke tests
  // These are dummy values since we're running in minimal mode against localhost
  const smokeEnv = {
    ...process.env,
    // Only set if not already present
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || 'local-dev',
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || 'local-dev-token',
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'https://login.justevery.com',
    LOGIN_ORIGIN: process.env.LOGIN_ORIGIN || 'https://login.justevery.com',
    SESSION_COOKIE_DOMAIN: process.env.SESSION_COOKIE_DOMAIN || '.local.dev',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_local',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_local',
  };

  // Default routes for minimal smoke testing (likely-to-pass routes)
  const defaultRoutes = '/,/api/session';
  const routes = customRoutes || defaultRoutes;

  const args = [
    '--filter',
    '@justevery/bootstrap-cli',
    'run',
    'smoke',
    '--cwd',
    cwd,
    '--base',
    baseUrl,
    '--mode',
    'minimal',
    '--skip-wrangler',
    '--out',
    absoluteOutputDir,
    '--stamp',
    timestamp,
    '--routes',
    routes,
  ];

  try {
    const { stdout, stderr} = await execFileAsync(
      'pnpm',
      args,
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: smokeEnv,
      }
    );

    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }

    return { success: true, timestamp, outputDir: path.join(absoluteOutputDir, timestamp) };
  } catch (error) {
    // The smoke test script exits with non-zero on failure
    console.log(error.stdout || '');
    console.error(error.stderr || '');
    return { success: false, timestamp, error: error.message, outputDir: path.join(absoluteOutputDir, timestamp) };
  }
}

/**
 * Format timestamp for directory naming
 */
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

/**
 * Gracefully shutdown wrangler process
 */
async function shutdownWrangler(wranglerProcess) {
  if (!wranglerProcess || wranglerProcess.killed) {
    return;
  }

  console.log('Shutting down wrangler dev...');

  return new Promise((resolve) => {
    wranglerProcess.on('exit', () => {
      console.log('✓ Wrangler dev stopped');
      resolve();
    });

    // Try graceful shutdown first
    wranglerProcess.kill('SIGTERM');

    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (!wranglerProcess.killed) {
        console.log('Force killing wrangler dev...');
        wranglerProcess.kill('SIGKILL');
      }
      resolve();
    }, 5000);
  });
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let customRoutes = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--routes' && i + 1 < args.length) {
      customRoutes = args[i + 1];
      break;
    }
    // Also support --routes=value format
    if (args[i].startsWith('--routes=')) {
      customRoutes = args[i].split('=')[1];
      break;
    }
  }

  return { customRoutes };
}

/**
 * Main execution
 */
async function main() {
  let wranglerProcess = null;
  let exitCode = 0;

  try {
    // Parse command line arguments
    const { customRoutes } = parseArgs();

    // Step 1: Ensure Playwright browsers are installed
    await ensurePlaywrightBrowsers();

    // Step 2: Start wrangler dev
    wranglerProcess = startWranglerDev(WRANGLER_CONFIG, WRANGLER_PORT);

    // Step 3: Wait for server to be ready
    await waitForServerReady(BASE_URL);

    // Step 4: Run smoke tests
    const result = await runSmokeTests(BASE_URL, OUTPUT_DIR, customRoutes);

    if (result.success) {
      console.log(`\n✓ Smoke tests passed!`);
      console.log(`Results saved to: ${result.outputDir}`);
    } else {
      console.error(`\n✗ Smoke tests failed!`);
      console.error(`Results saved to: ${result.outputDir}`);
      exitCode = 1;
    }

  } catch (error) {
    console.error('Error running local smoke tests:', error.message);
    exitCode = 1;
  } finally {
    // Step 5: Cleanup - shutdown wrangler
    if (wranglerProcess) {
      await shutdownWrangler(wranglerProcess);
    }
  }

  process.exit(exitCode);
}

// Handle interrupts gracefully
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down...');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');
  process.exit(143);
});

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
