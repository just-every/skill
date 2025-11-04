#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function loadEnvFiles() {
  const envSources = ['.env', '.env.local.generated'];
  const values = {};

  for (const file of envSources) {
    try {
      const content = await fs.readFile(file, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
        const [key, ...rest] = line.split('=');
        const value = rest.join('=').trim().replace(/^"|"$/g, '');
        if (value && !(key in values)) {
          values[key.trim()] = value;
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

async function fetchWithRetry(url, options = {}, attempts = 3, delayMs = 500) {
  const result = {
    url,
    method: options.method || 'GET',
    attempts: 0,
  };

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result.attempts = attempt;
    try {
      const response = await fetch(url, options);
      result.status = response.status;
      result.ok = response.ok;
      result.headers = Object.fromEntries(response.headers.entries());
      result.bodySnippet = await response.text().then((text) => text.slice(0, 256));
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

async function main() {
  const envValues = await loadEnvFiles();
  const landingUrl = process.env.LANDING_URL || envValues.LANDING_URL;
  const projectId = process.env.PROJECT_ID || envValues.PROJECT_ID;
  const logtoToken = process.env.LOGTO_TOKEN || envValues.LOGTO_TOKEN;

  if (!landingUrl) {
    console.error('LANDING_URL is required for smoke checks.');
    process.exitCode = 1;
    return;
  }

  const base = landingUrl.replace(/\/$/, '');
  const endpoints = [
    { name: 'landing', path: '/', expected: 200 },
    { name: 'session-unauthenticated', path: '/api/session', expected: 401 },
    { name: 'payments', path: '/payments', expected: 200 },
  ];

  if (logtoToken) {
    endpoints.push({
      name: 'session-authenticated',
      path: '/api/session',
      expected: 200,
      headers: { Authorization: `Bearer ${logtoToken}` },
    });
  }

  const checks = [];
  for (const endpoint of endpoints) {
    const url = `${base}${endpoint.path}`;
    const result = await fetchWithRetry(url, {
      headers: endpoint.headers,
    });
    result.name = endpoint.name;
    result.expected = endpoint.expected;
    result.passed = typeof result.status === 'number' && result.status === endpoint.expected;
    checks.push(result);
  }

  const dbName = envValues.D1_DATABASE_NAME || (projectId ? `${projectId}-d1` : undefined);
  let d1Result = {
    ok: false,
    message: 'Database name unavailable',
  };

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
        rows,
        database: dbName,
        message: demoRow
          ? `Found project row for ${projectId}`
          : 'Projects table returned results but missing expected row',
      };
    } catch (error) {
      d1Result = { ok: false, database: dbName, message: error.message };
    }
  }

  let secretsResult = { ok: false, message: 'Unable to read secrets' };
  try {
    const stdout = await runWrangler(['secret', 'list']);
    const secrets = JSON.parse(stdout);
    const hasWebhookSecret = secrets.some((secret) => secret.name === 'STRIPE_WEBHOOK_SECRET');
    secretsResult = {
      ok: hasWebhookSecret,
      names: secrets.map((secret) => secret.name).sort(),
      message: hasWebhookSecret ? 'STRIPE_WEBHOOK_SECRET present' : 'Missing STRIPE_WEBHOOK_SECRET',
    };
  } catch (error) {
    secretsResult = { ok: false, message: error.message };
  }

  const timestamp = formatTimestamp();
  const outputDir = path.join('test-results', 'smoke');
  await ensureDir(outputDir);

  const report = {
    generatedAt: new Date().toISOString(),
    landingUrl,
    projectId,
    checks,
    d1: d1Result,
    workerSecrets: secretsResult,
  };

  const jsonPath = path.join(outputDir, `report-${timestamp}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

  const markdownLines = [
    `# Smoke Report (${report.generatedAt})`,
    '',
    `- Base URL: ${landingUrl}`,
    `- Project ID: ${projectId || 'unknown'}`,
    '',
    '## HTTP Checks',
    '',
  ];

  for (const check of checks) {
    const statusText = check.status ? `${check.status}` : 'error';
    markdownLines.push(
      `- ${check.name}: expected ${check.expected}, got ${statusText} — ${check.passed ? '✅' : '❌'}`
    );
  }

  markdownLines.push('', '## D1 Remote Projects Table', '');
  markdownLines.push(
    `- ${d1Result.database || 'unknown DB'}: ${d1Result.ok ? '✅' : '❌'} ${d1Result.message}`
  );

  markdownLines.push('', '## Worker Secrets', '');
  markdownLines.push(
    `- STRIPE_WEBHOOK_SECRET present: ${secretsResult.ok ? '✅' : '❌'} (${secretsResult.message})`
  );

  const markdownPath = path.join(outputDir, `report-${timestamp}.md`);
  await fs.writeFile(markdownPath, markdownLines.join('\n'));

  await fs.writeFile(
    path.join('test-results', 'verification-report.md'),
    markdownLines.join('\n')
  );

  await fs.writeFile(
    path.join('test-results', 'verification-report.json'),
    JSON.stringify(report, null, 2)
  );

  const overallOk =
    checks.every((check) => check.passed) && d1Result.ok && secretsResult.ok;

  console.log(`Smoke report saved to ${markdownPath}`);
  if (!overallOk) {
    console.error('One or more checks failed. See report for details.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
