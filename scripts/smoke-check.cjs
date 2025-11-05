#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const DEFAULT_ROUTES = ['/', '/login', '/callback', '/logout', '/app', '/payments'];
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

async function loadEnvFiles() {
  const envSources = ['.env.local.generated', '.env'];
  const values = {};

  for (const file of envSources) {
    try {
      const content = await fs.readFile(file, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
        const [key, ...rest] = line.split('=');
        const normalizedKey = key.replace(/^export\s+/i, '').trim();
        const value = rest.join('=').trim().replace(/^"|"$/g, '');
        if (normalizedKey && !(normalizedKey in values) && value) {
          values[normalizedKey] = value;
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  return values;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchWithRetry(url, options = {}, attempts = 3, delayMs = 500, captureFullBody = false) {
  const result = {
    url,
    method: options.method || 'GET',
    attempts: 0,
  };

  let lastError;
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

  result.error = lastError ? lastError.message : 'Unknown error';
  result.ok = false;
  return result;
}

async function runWrangler(args) {
  const { stdout } = await execFileAsync('wrangler', ['--config', 'workers/api/wrangler.toml', ...args], {
    encoding: 'utf8',
  });
  return stdout;
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

function passesStatus(status, mode) {
  if (typeof status !== 'number') return false;
  if (mode === '2xx') return status >= 200 && status < 300;
  if (mode === '2xx-3xx') return status >= 200 && status < 400;
  if (mode === 'optional-hero') return status === 200 || status === 404;
  if (mode === '400') return status === 400;
  if (mode === '401') return status === 401;
  return false;
}

function buildEndpoints(base, routes, token) {
  const items = [];
  const redirectable = new Set(['/login', '/logout', '/callback']);

  for (const route of routes) {
    const expectMode = redirectable.has(route) ? '2xx-3xx' : '2xx';
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    items.push({
      name: `page:${route}`,
      url: `${base}${route}`,
      expectMode,
      headers,
    });
  }

  items.push({
    name: 'api:session-unauthenticated',
    url: `${base}/api/session`,
    expectMode: '401',
  });

  items.push({
    name: 'callback:error-debug',
    url: `${base}/callback?error=debug`,
    expectMode: '2xx-3xx',
  });

  if (token) {
    items.push({
      name: 'api:session-authenticated',
      url: `${base}/api/session`,
      expectMode: '2xx',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  items.push({
    name: 'asset:hero',
    url: `${base}/marketing/hero.png`,
    expectMode: 'optional-hero',
  });

  return items;
}

function summariseChecks(checks) {
  return checks.every((check) => check.passed);
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const envValues = await loadEnvFiles();

  const modeArg = (argv.mode || process.env.SMOKE_MODE || '').toLowerCase();
  const mode = modeArg === 'minimal' ? 'minimal' : 'full';
  const skipWrangler = mode === 'minimal' || argv['skip-wrangler'] === 'true' || process.env.SMOKE_SKIP_WRANGLER === '1';

  const baseFromArgs = argv.base || process.env.E2E_BASE_URL || process.env.LANDING_URL || envValues.LANDING_URL;
  if (!baseFromArgs) {
    console.error('A base URL is required. Provide --base or set LANDING_URL/E2E_BASE_URL.');
    process.exitCode = 1;
    return;
  }

  let base;
  try {
    const normalised = new URL(baseFromArgs);
    base = `${normalised.origin}`;
  } catch (error) {
    console.error(`Invalid base URL provided: ${baseFromArgs}`);
    process.exitCode = 1;
    return;
  }

  const projectId = argv['project-id'] || process.env.PROJECT_ID || envValues.PROJECT_ID || null;
  const bearerToken = argv.token || process.env.SMOKE_BEARER_TOKEN || process.env.LOGTO_TOKEN || envValues.LOGTO_TOKEN || null;
  const routesArg = argv.routes ? argv.routes.split(',').map((route) => route.trim()).filter(Boolean) : null;
  const routes = (routesArg && routesArg.length > 0 ? routesArg : DEFAULT_ROUTES).map((route) => (route.startsWith('/') ? route : `/${route}`));

  const attempts = Number.parseInt(argv.attempts || process.env.SMOKE_ATTEMPTS || '3', 10);
  const delayMs = Number.parseInt(argv.delay || process.env.SMOKE_DELAY_MS || '500', 10);

  const endpoints = buildEndpoints(base, routes, bearerToken);
  const checks = [];
  for (const endpoint of endpoints) {
    const captureFullBody = endpoint.name === 'callback:error-debug';
    const result = await fetchWithRetry(endpoint.url, { headers: endpoint.headers }, attempts, delayMs, captureFullBody);
    result.name = endpoint.name;
    result.expected = endpoint.expectMode;
    if (endpoint.expectMode === '401') {
      result.passed = result.status === 401;
    } else if (endpoint.expectMode === '400') {
      result.passed = result.status === 400;
    } else if (endpoint.expectMode === 'optional-hero') {
      result.passed = passesStatus(result.status, endpoint.expectMode);
      result.note = result.status === 404
        ? 'Hero asset missing (optional)'
        : 'Hero asset available';
    } else {
      result.passed = passesStatus(result.status, endpoint.expectMode);
    }
    checks.push(result);
  }

  const stamp = argv.stamp || formatTimestamp();
  const outputBase = path.resolve(argv.out || DEFAULT_OUTPUT_DIR);
  const runDir = path.join(outputBase, stamp);
  await ensureDir(runDir);

  let d1Result = { ok: false, skipped: skipWrangler, message: skipWrangler ? 'Skipped (minimal mode)' : 'Database name unavailable' };
  let secretsResult = { ok: false, skipped: skipWrangler, message: skipWrangler ? 'Skipped (minimal mode)' : 'Unable to read secrets' };

  if (!skipWrangler) {
    const dbName = argv['d1-name'] || process.env.D1_DATABASE_NAME || envValues.D1_DATABASE_NAME || (projectId ? `${projectId}-d1` : undefined);
    if (dbName) {
      try {
        const stdout = await runWrangler([
          'd1',
          'execute',
          dbName,
          '--remote',
          '--command',
          'SELECT id, landing_url, app_url FROM projects LIMIT 5;',
          '--json',
        ]);
        const parsed = JSON.parse(stdout);
        const rows = Array.isArray(parsed) && parsed[0]?.results ? parsed[0].results : [];
        const demoRow = rows.find((row) => row.id === projectId);
        d1Result = {
          ok: Boolean(demoRow),
          database: dbName,
          rows,
          message: demoRow
            ? `Found project row for ${projectId}`
            : rows.length > 0
              ? 'Projects table returned results but missing expected row'
              : 'Projects table is empty',
        };
      } catch (error) {
        d1Result = { ok: false, database: dbName, message: error.message };
      }
    }

    try {
      const stdout = await runWrangler(['secret', 'list']);
      const secrets = JSON.parse(stdout);
      const names = secrets.map((secret) => secret.name).sort();
      const hasStripeSecret = names.includes('STRIPE_WEBHOOK_SECRET');
      secretsResult = {
        ok: hasStripeSecret,
        names,
        message: hasStripeSecret ? 'STRIPE_WEBHOOK_SECRET present' : 'Missing STRIPE_WEBHOOK_SECRET',
      };
    } catch (error) {
      secretsResult = { ok: false, message: error.message };
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    projectId,
    mode,
    checks,
    d1: d1Result,
    workerSecrets: secretsResult,
  };

  const reportPath = path.join(runDir, 'report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  const checksPath = path.join(runDir, 'checks.json');
  await fs.writeFile(checksPath, JSON.stringify(checks, null, 2));

  // Save individual check artefacts for endpoints that captured full body
  for (const check of checks) {
    if (check.fullBody) {
      const safeName = check.name.replace(/[:/]/g, '-');
      const artefactDir = path.join(runDir, 'artefacts');
      await ensureDir(artefactDir);

      const responseData = {
        url: check.url,
        status: check.status,
        headers: check.headers,
        body: check.fullBody,
      };

      await fs.writeFile(
        path.join(artefactDir, `${safeName}-response.json`),
        JSON.stringify(responseData, null, 2)
      );
    }
  }

  const markdown = [
    `# Smoke Report (${report.generatedAt})`,
    '',
    `- Base URL: ${report.baseUrl}`,
    `- Mode: ${mode}`,
    `- Project ID: ${projectId || 'unknown'}`,
    '',
    '## HTTP Checks',
    '',
    ...checks.map((check) => `- ${check.name}: expected ${check.expected}, got ${check.status ?? 'error'} — ${check.passed ? '✅' : '❌'}`),
    '',
    '## D1 Remote Projects Table',
    '',
    `- ${d1Result.database || 'unknown DB'}: ${d1Result.ok ? '✅' : skipWrangler ? 'skipped' : '❌'} ${d1Result.message || ''}`,
    '',
    '## Worker Secrets',
    '',
    `- STRIPE_WEBHOOK_SECRET present: ${secretsResult.ok ? '✅' : skipWrangler ? 'skipped' : '❌'} (${secretsResult.message || ''})`,
  ].join('\n');

  await fs.writeFile(path.join(runDir, 'report.md'), markdown);

  const overallOk = summariseChecks(checks) && (skipWrangler || (d1Result.ok && secretsResult.ok));

  console.log(`Smoke report saved to ${reportPath}`);
  console.log(`HTTP checks saved to ${checksPath}`);
  if (!overallOk) {
    console.error('One or more smoke checks failed. See report for details.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
