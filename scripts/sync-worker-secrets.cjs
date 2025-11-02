#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const envFile = process.env.JUSTEVERY_SECRET_FILE || `${process.env.HOME || ''}/.env`;
if (!envFile) {
  console.error('Unable to determine path to $HOME/.env. Set JUSTEVERY_SECRET_FILE to override.');
  process.exit(1);
}

let rawEnv;
try {
  rawEnv = readFileSync(envFile, 'utf8');
} catch (error) {
  console.error(`Failed to read env file at ${envFile}:`, error.message);
  process.exit(1);
}

const aliasMap = new Map([
  ['STYTCH_PROJECT_SECRET', 'STYTCH_SECRET'],
  ['STYTCH_PROJECT_PUBLIC_TOKEN', 'STYTCH_PUBLIC_TOKEN'],
  ['STYTCH_PROJECT_ALIAS', 'STYTCH_ORGANIZATION_SLUG'],
  ['STRIPE_LIVE_SECRET_KEY', 'STRIPE_SECRET_KEY'],
  ['STRIPE_TEST_SECRET_KEY', 'STRIPE_SECRET_KEY'],
]);

const envMap = {};
for (const line of rawEnv.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex === -1) continue;
  const rawKey = trimmed.slice(0, eqIndex).trim();
  const key = aliasMap.get(rawKey) || rawKey;
  const value = trimmed.slice(eqIndex + 1).trim();
  if (key === 'STYTCH_ORGANIZATION_SLUG' && (value.includes('://') || value.includes('.'))) {
    continue;
  }
  if (!envMap[key]) {
    envMap[key] = value;
  }
}

const args = process.argv.slice(2);
const syncAll = args.includes('--all');

const DEFAULT_SECRET_KEYS = [
  'STYTCH_SSO_CONNECTION_ID',
  'STYTCH_ORGANIZATION_SLUG',
  'STYTCH_PROJECT_ID',
  'STYTCH_SECRET',
  'STYTCH_PUBLIC_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

const workerDir = resolve(process.cwd(), 'workers/api');
const wranglerConfig = resolve(workerDir, 'wrangler.toml');

const secretPattern = /(secret|token|key|password)/i;

let configVars = new Set();
try {
  const configText = readFileSync(wranglerConfig, 'utf8');
  const matches = configText.match(/^[ \t]*([A-Z0-9_]+)\s*=/gm) || [];
  for (const line of matches) {
    const key = line.replace(/[ \t=]/g, '');
    if (key) configVars.add(key);
  }
} catch (error) {
  console.warn('Warning: unable to parse wrangler.toml vars', error.message);
}

const SECRET_KEYS = syncAll
  ? Object.keys(envMap).filter((key) => secretPattern.test(key) && !key.startsWith('CLOUDFLARE_'))
  : DEFAULT_SECRET_KEYS;

const CF_TOKEN = envMap.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = envMap.CLOUDFLARE_ACCOUNT_ID;

if (!CF_TOKEN || !CF_ACCOUNT) {
  console.error('CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID missing from env file.');
  process.exit(1);
}


const pending = Array.from(new Set(SECRET_KEYS))
  .filter((key) => envMap[key])
  .filter((key) => !configVars.has(key));
if (pending.length === 0) {
  console.log('No matching secrets found in env file. Nothing to sync.');
  process.exit(0);
}

if (syncAll) {
  console.log(`--all enabled; syncing ${pending.length} secrets.`);
}

for (const key of pending) {
  const value = envMap[key];
  console.log(`Syncing ${key} to Worker secrets...`);
  const result = spawnSync(
    'npx',
    ['--yes', 'wrangler@4', 'secret', 'put', key, '--config', wranglerConfig],
    {
      cwd: workerDir,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: CF_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT,
      },
      input: `${value}\n`,
    },
  );
  if (result.status !== 0) {
    console.error(`wrangler secret put ${key} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

console.log('Secret sync complete.');
