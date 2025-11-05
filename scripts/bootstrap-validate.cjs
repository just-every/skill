#!/usr/bin/env node

/**
 * Bootstrap idempotency validator.
 *
 * Verifies that a rerun of ./bootstrap.sh did not trigger create operations
 * by scanning the saved log output and checking remote vendor state for
 * duplicate resources (Stripe products/webhooks and Cloudflare D1/R2/routes).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const creationPatterns = [
  { regex: /Creating new D1 database/i, resource: 'cloudflare_d1' },
  { regex: /Creating new R2 bucket/i, resource: 'cloudflare_r2' },
  { regex: /Creating new Stripe product/i, resource: 'stripe_product' },
  { regex: /No existing webhook endpoint found/i, resource: 'stripe_webhook' },
  { regex: /Created Stripe webhook endpoint/i, resource: 'stripe_webhook' },
  { regex: /No matching price found/i, resource: 'stripe_price' },
];

const CHECK_STATUS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIP: 'SKIP',
};

const projectRoot = process.cwd();
const testResultsRoot = path.join(projectRoot, 'test-results');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { runDir: null, logPath: null };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--run' || arg === '--dir') {
      options.runDir = args[++i];
    } else if (arg === '--log') {
      options.logPath = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.warn(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log('Usage: node scripts/bootstrap-validate.cjs [--run test-results/bootstrap-<stamp>] [--log /path/to/log]');
  console.log('Environment prerequisites: PROJECT_ID, STRIPE_SECRET_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function findLatestRunDir() {
  if (!fs.existsSync(testResultsRoot)) {
    return null;
  }
  const entries = fs.readdirSync(testResultsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('bootstrap-'))
    .map((entry) => entry.name)
    .sort();
  if (entries.length === 0) {
    return null;
  }
  return path.join(testResultsRoot, entries[entries.length - 1]);
}

function detectLogPath(runDir, explicitLog) {
  if (explicitLog) {
    return explicitLog;
  }
  if (!runDir || !fs.existsSync(runDir)) {
    return null;
  }
  const candidates = fs.readdirSync(runDir)
    .filter((name) => name.endsWith('.log'))
    .map((name) => path.join(runDir, name));
  if (candidates.length === 1) {
    return candidates[0];
  }
  const bootstrapLog = path.join(runDir, 'bootstrap.log');
  if (fs.existsSync(bootstrapLog)) {
    return bootstrapLog;
  }
  return candidates[0] || null;
}

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) {
      continue;
    }
    const [key, ...rest] = line.split('=');
    env[key.trim()] = rest.join('=').trim();
  }
  return env;
}

function parseStripeProductsConfig(value) {
  if (!value || typeof value !== 'string') {
    return [];
  }
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, rest] = entry.split(':');
      if (!rest) {
        return { name };
      }
      const [amountStr, currency, interval] = rest.split(',');
      return {
        name: name.trim(),
        amount: Number(amountStr),
        currency: currency ? currency.trim().toLowerCase() : undefined,
        interval: interval ? interval.trim().toLowerCase() : undefined,
      };
    })
    .filter((item) => item.name);
}

function parseLogForCreates(logPath) {
  if (!logPath || !fs.existsSync(logPath)) {
    return { createEvents: [], info: 'log_missing' };
  }
  const createEvents = [];
  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    creationPatterns.forEach((pattern) => {
      if (pattern.regex.test(line)) {
        createEvents.push({
          resource: pattern.resource,
          line: index + 1,
          message: line.trim(),
        });
      }
    });
  });
  return { createEvents };
}

function runWrangler(args) {
  const result = spawnSync('wrangler', args, {
    encoding: 'utf8',
    cwd: projectRoot,
  });
  if (result.error) {
    throw result.error;
  }
  return { code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function parseR2ListOutput(stdout) {
  const names = new Set();
  stdout.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed.includes('│')) {
      const parts = trimmed.split('│').map((part) => part.trim()).filter(Boolean);
      if (parts[0] && parts[0] !== 'name' && parts[0] !== 'Name') {
        names.add(parts[0]);
      }
      return;
    }
    if (trimmed.startsWith('name:')) {
      const value = trimmed.slice('name:'.length).trim();
      if (value) {
        names.add(value);
      }
    }
  });
  return Array.from(names);
}

function parseWranglerTomlRoutes() {
  const tomlPath = path.join(projectRoot, 'workers', 'api', 'wrangler.toml');
  if (!fs.existsSync(tomlPath)) {
    return { scriptName: null, patterns: [] };
  }
  const content = fs.readFileSync(tomlPath, 'utf8');
  const scriptMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
  const scriptName = scriptMatch ? scriptMatch[1] : null;
  const routePatternRegex = /^pattern\s*=\s*"([^"]+)"/gm;
  const patterns = [];
  let match;
  while ((match = routePatternRegex.exec(content))) {
    patterns.push(match[1]);
  }
  return { scriptName, patterns };
}

async function fetchStripe(url, stripeKey) {
  const response = await fetch(`https://api.stripe.com${url}`, {
    headers: {
      Authorization: `Bearer ${stripeKey}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Stripe API ${url} failed: ${response.status} ${body}`);
  }
  return response.json();
}

async function fetchCloudflare(url, token) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloudflare API ${url} failed: ${response.status} ${body}`);
  }
  const json = await response.json();
  if (!json.success) {
    throw new Error(`Cloudflare API ${url} returned errors: ${JSON.stringify(json.errors)}`);
  }
  return json.result;
}

function computeReportPaths(targetDir) {
  const jsonPath = path.join(targetDir, 'validation.json');
  const textPath = path.join(targetDir, 'validation.txt');
  return { jsonPath, textPath };
}

async function checkStripeResources({ env, generatedEnv, expectedPlans, checks, landingUrl }) {
  const stripeKey = env.STRIPE_SECRET_KEY || env.STRIPE_TEST_SECRET_KEY || env.STRIPE_LIVE_SECRET_KEY;
  const projectId = env.PROJECT_ID || generatedEnv.PROJECT_ID;
  if (!stripeKey) {
    checks.push({
      component: 'Stripe API',
      status: CHECK_STATUS.SKIP,
      message: 'Stripe secret key not available; skipping Stripe checks.',
    });
    return;
  }
  if (!projectId) {
    checks.push({
      component: 'Stripe Products',
      status: CHECK_STATUS.SKIP,
      message: 'PROJECT_ID not set; skipping Stripe validation.',
    });
    return;
  }

  const productsResponse = await fetchStripe(`/v1/products/search?query=metadata['project_id']:'${projectId}'`, stripeKey);
  const products = productsResponse.data || [];
  const activeProducts = products.filter((product) => product.active !== false);

  const nameCounts = activeProducts.reduce((acc, product) => {
    const key = product.name || product.id;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const duplicateNames = Object.entries(nameCounts).filter(([, count]) => count > 1);
  if (duplicateNames.length > 0) {
    checks.push({
      component: 'Stripe Products',
      status: CHECK_STATUS.FAIL,
      message: `Duplicate Stripe products detected for project ${projectId}: ${duplicateNames.map(([name, count]) => `${name} (x${count})`).join(', ')}`,
    });
  } else {
    checks.push({
      component: 'Stripe Products',
      status: CHECK_STATUS.PASS,
      message: `Found ${products.length} Stripe product(s) tagged with project_id=${projectId}.`,
    });
  }

  // Validate expected plans
  for (const plan of expectedPlans) {
    const product = activeProducts.find((p) => (p.name || '').toLowerCase() === plan.name.toLowerCase());
    if (!product) {
      checks.push({
        component: `Stripe Plan: ${plan.name}`,
        status: CHECK_STATUS.FAIL,
        message: 'Expected product not found for plan.',
      });
      continue;
    }

    if (plan.amount && plan.currency && plan.interval) {
      const pricesResp = await fetchStripe(`/v1/prices?product=${product.id}&limit=100`, stripeKey);
      const matchingPrices = (pricesResp.data || []).filter((price) => (
        price.unit_amount === plan.amount &&
        price.currency === plan.currency &&
        price.recurring && price.recurring.interval === plan.interval &&
        price.active
      ));
      if (matchingPrices.length === 0) {
        checks.push({
          component: `Stripe Plan: ${plan.name}`,
          status: CHECK_STATUS.FAIL,
          message: 'No active price matches configured amount/currency/interval.',
        });
      } else if (matchingPrices.length > 1) {
        checks.push({
          component: `Stripe Plan: ${plan.name}`,
          status: CHECK_STATUS.WARN,
          message: `Multiple active prices (${matchingPrices.length}) match configured plan; consider pruning duplicates.`,
        });
      } else {
        checks.push({
          component: `Stripe Plan: ${plan.name}`,
          status: CHECK_STATUS.PASS,
          message: `Price ${matchingPrices[0].id} matches configured plan.`,
        });
      }
    }
  }

  const webhookTarget = landingUrl ? `${landingUrl.replace(/\/$/, '')}/webhook/stripe` : null;
  if (!webhookTarget) {
    checks.push({
      component: 'Stripe Webhook',
      status: CHECK_STATUS.SKIP,
      message: 'PROJECT_DOMAIN not set; skipping webhook validation.',
    });
  } else {
    const webhookResponse = await fetchStripe('/v1/webhook_endpoints?limit=100', stripeKey);
    const matches = (webhookResponse.data || []).filter((endpoint) => endpoint.url === webhookTarget);
    if (matches.length === 0) {
      checks.push({
        component: 'Stripe Webhook',
        status: CHECK_STATUS.FAIL,
        message: `No webhook endpoint found for ${webhookTarget}.`,
      });
    } else if (matches.length > 1) {
      checks.push({
        component: 'Stripe Webhook',
        status: CHECK_STATUS.FAIL,
        message: `Multiple webhook endpoints (${matches.length}) found for ${webhookTarget}.`,
      });
    } else {
      checks.push({
        component: 'Stripe Webhook',
        status: CHECK_STATUS.PASS,
        message: `Webhook endpoint ${matches[0].id} registered for ${webhookTarget}.`,
      });
    }
  }
}

function checkD1Database({ env, generatedEnv, checks }) {
  const projectId = env.PROJECT_ID || generatedEnv.PROJECT_ID;
  if (!projectId) {
    checks.push({
      component: 'Cloudflare D1',
      status: CHECK_STATUS.SKIP,
      message: 'PROJECT_ID not set; skipping D1 validation.',
    });
    return;
  }
  const expectedName = env.CLOUDFLARE_D1_NAME || generatedEnv.D1_DATABASE_NAME || `${projectId}-d1`;
  try {
    const result = runWrangler(['d1', 'list', '--json']);
    if (result.code !== 0) {
      checks.push({
        component: 'Cloudflare D1',
        status: CHECK_STATUS.WARN,
        message: `wrangler d1 list failed (${result.code}): ${result.stderr.trim()}`,
      });
      return;
    }
    const list = JSON.parse(result.stdout || '[]');
    const matches = list.filter((item) => item.name === expectedName);
    if (matches.length === 0) {
      checks.push({
        component: 'Cloudflare D1',
        status: CHECK_STATUS.FAIL,
        message: `No D1 database found matching name ${expectedName}.`,
      });
    } else if (matches.length > 1) {
      checks.push({
        component: 'Cloudflare D1',
        status: CHECK_STATUS.FAIL,
        message: `Multiple D1 databases (${matches.length}) found matching name ${expectedName}.`,
      });
    } else {
      checks.push({
        component: 'Cloudflare D1',
        status: CHECK_STATUS.PASS,
        message: `D1 database ${matches[0].uuid} (${matches[0].name}) present.`,
      });
    }
  } catch (error) {
    checks.push({
      component: 'Cloudflare D1',
      status: CHECK_STATUS.WARN,
      message: `Failed to inspect D1 databases: ${error.message}`,
    });
  }
}

function checkR2Bucket({ env, generatedEnv, checks }) {
  const projectId = env.PROJECT_ID || generatedEnv.PROJECT_ID;
  if (!projectId) {
    checks.push({
      component: 'Cloudflare R2',
      status: CHECK_STATUS.SKIP,
      message: 'PROJECT_ID not set; skipping R2 validation.',
    });
    return;
  }
  const expectedName = env.CLOUDFLARE_R2_BUCKET || generatedEnv.R2_BUCKET_NAME || `${projectId}-assets`;
  try {
    const result = runWrangler(['r2', 'bucket', 'list']);
    if (result.code !== 0) {
      checks.push({
        component: 'Cloudflare R2',
        status: CHECK_STATUS.WARN,
        message: `wrangler r2 bucket list failed (${result.code}): ${result.stderr.trim()}`,
      });
      return;
    }
    const names = parseR2ListOutput(result.stdout || '');
    const matches = names.filter((name) => name === expectedName);
    if (matches.length === 0) {
      checks.push({
        component: 'Cloudflare R2',
        status: CHECK_STATUS.FAIL,
        message: `No R2 bucket found matching name ${expectedName}.`,
      });
    } else if (matches.length > 1) {
      checks.push({
        component: 'Cloudflare R2',
        status: CHECK_STATUS.FAIL,
        message: `Multiple R2 buckets found matching name ${expectedName}.`,
      });
    } else {
      checks.push({
        component: 'Cloudflare R2',
        status: CHECK_STATUS.PASS,
        message: `R2 bucket ${expectedName} present.`,
      });
    }
  } catch (error) {
    checks.push({
      component: 'Cloudflare R2',
      status: CHECK_STATUS.WARN,
      message: `Failed to list R2 buckets: ${error.message}`,
    });
  }
}

function normalizeRoutePattern(pattern) {
  if (!pattern) {
    return pattern;
  }
  if (pattern.endsWith('/*')) {
    return pattern.slice(0, -2);
  }
  if (pattern.endsWith('/')) {
    return pattern.slice(0, -1);
  }
  return pattern;
}

async function checkCloudflareRoutes({ env, checks }) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) {
    checks.push({
      component: 'Cloudflare Routes',
      status: CHECK_STATUS.SKIP,
      message: 'CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID missing; skipping route validation.',
    });
    return;
  }
  const { scriptName, patterns } = parseWranglerTomlRoutes();
  if (!scriptName || patterns.length === 0) {
    checks.push({
      component: 'Cloudflare Routes',
      status: CHECK_STATUS.WARN,
      message: 'No [[routes]] entries found in workers/api/wrangler.toml; skipping route validation.',
    });
    return;
  }
  try {
    const routes = await fetchCloudflare(`/zones/${zoneId}/workers/routes`, token);
    const failures = [];
    const duplicates = new Set();
    const normalizedPatterns = patterns.map((pattern) => normalizeRoutePattern(pattern));
    routes.forEach((route) => {
      route.normalizedPattern = normalizeRoutePattern(route.pattern);
    });

    normalizedPatterns.forEach((expectedPattern, idx) => {
      const originalPattern = patterns[idx];
      const matches = routes.filter(
        (route) => route.normalizedPattern === expectedPattern && route.script === scriptName,
      );
      if (matches.length === 0) {
        failures.push(`Missing route pattern ${originalPattern} (normalized: ${expectedPattern}) mapped to ${scriptName}.`);
      } else if (matches.length > 1) {
        duplicates.add(originalPattern);
      }
    });

    if (duplicates.size > 0) {
      checks.push({
        component: 'Cloudflare Routes',
        status: CHECK_STATUS.FAIL,
        message: `Duplicate routes detected for patterns: ${Array.from(duplicates).join(', ')}.`,
      });
    } else if (failures.length > 0) {
      checks.push({
        component: 'Cloudflare Routes',
        status: CHECK_STATUS.FAIL,
        message: failures.join(' '),
      });
    } else {
      checks.push({
        component: 'Cloudflare Routes',
        status: CHECK_STATUS.PASS,
        message: `All ${patterns.length} routes present for script ${scriptName}.`,
      });
    }
  } catch (error) {
    checks.push({
      component: 'Cloudflare Routes',
      status: CHECK_STATUS.WARN,
      message: `Failed to fetch Cloudflare routes: ${error.message}`,
    });
  }
}

function summariseCreateEvents(createEvents, checks) {
  if (!createEvents || createEvents.length === 0) {
    checks.push({
      component: 'Bootstrap Log',
      status: CHECK_STATUS.PASS,
      message: 'No create operations detected in bootstrap log.',
    });
    return;
  }
  const details = createEvents.map((event) => `line ${event.line}: ${event.message}`).join('; ');
  checks.push({
    component: 'Bootstrap Log',
    status: CHECK_STATUS.FAIL,
    message: `Detected create operations in bootstrap log (${createEvents.length}): ${details}.`,
  });
}

async function main() {
  const options = parseArgs();
  let runDir = options.runDir ? path.resolve(projectRoot, options.runDir) : null;
  if (runDir && !fs.existsSync(runDir)) {
    console.warn(`Specified run directory does not exist: ${runDir}`);
    runDir = null;
  }
  if (!runDir) {
    runDir = findLatestRunDir();
  }
  if (!runDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    runDir = path.join(testResultsRoot, `bootstrap-${timestamp}`);
    ensureDir(runDir);
    console.warn(`No existing bootstrap run directory found. Using ${runDir} for reports.`);
  }

  const logPath = detectLogPath(runDir, options.logPath);
  if (!logPath) {
    console.warn('Bootstrap log file not found; log-based checks will be skipped.');
  }

  ensureDir(runDir);
  const generatedEnv = parseEnvFile(path.join(projectRoot, '.env.local.generated'));
  const checks = [];

  const { createEvents } = parseLogForCreates(logPath);
  if (logPath) {
    summariseCreateEvents(createEvents, checks);
  } else {
    checks.push({
      component: 'Bootstrap Log',
      status: CHECK_STATUS.WARN,
      message: 'No bootstrap log located; unable to confirm absence of create operations.',
    });
  }

  const env = { ...generatedEnv, ...process.env };
  const landingUrl = env.PROJECT_DOMAIN || generatedEnv.APP_URL || generatedEnv.PROJECT_DOMAIN;
  const stripeProductsSource = env.STRIPE_PRODUCTS || generatedEnv.STRIPE_PRODUCTS;
  const expectedPlans = parseStripeProductsConfig(stripeProductsSource);

  await checkStripeResources({ env, generatedEnv, expectedPlans, checks, landingUrl });
  checkD1Database({ env, generatedEnv, checks });
  checkR2Bucket({ env, generatedEnv, checks });
  await checkCloudflareRoutes({ env, checks });

  const anyFailures = checks.some((item) => item.status === CHECK_STATUS.FAIL);
  const anyWarnings = checks.some((item) => item.status === CHECK_STATUS.WARN);

  const summary = {
    ok: !anyFailures,
    hasWarnings: anyWarnings,
    runDirectory: path.relative(projectRoot, runDir),
    logPath: logPath ? path.relative(projectRoot, logPath) : null,
    generatedAt: new Date().toISOString(),
    checks,
  };

  const { jsonPath, textPath } = computeReportPaths(runDir);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  const textLines = [
    'Bootstrap Idempotency Validation',
    `Status: ${summary.ok ? 'PASS' : 'FAIL'}${summary.hasWarnings ? ' (with warnings)' : ''}`,
    `Run Directory: ${summary.runDirectory}`,
    logPath ? `Log: ${summary.logPath}` : 'Log: <not found>',
    '',
    'Checks:',
    ...checks.map((item) => `- [${item.status}] ${item.component}: ${item.message}`),
    '',
  ];
  fs.writeFileSync(textPath, textLines.join('\n'));

  console.log(`Validation report written to ${path.relative(projectRoot, jsonPath)} and ${path.relative(projectRoot, textPath)}`);

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Bootstrap validation failed:', error);
  process.exitCode = 1;
});
