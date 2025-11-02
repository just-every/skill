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
  ['STYTCH_PROJECT_ALIAS', 'STYTCH_ORGANIZATION_SLUG'],
  ['STYTCH_PROJECT_DOMAIN', 'STYTCH_ORGANIZATION_SLUG'],
]);

const envMap = {};
for (const line of rawEnv.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const rawKey = trimmed.slice(0, idx).trim();
  const key = aliasMap.get(rawKey) || rawKey;
  const value = trimmed.slice(idx + 1).trim();
  if (!envMap[key]) {
    envMap[key] = value;
  }
}

const CF_TOKEN = envMap.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = envMap.CLOUDFLARE_ACCOUNT_ID;

if (!CF_TOKEN || !CF_ACCOUNT) {
  console.error('CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID missing from env file.');
  process.exit(1);
}

const workerDir = resolve(process.cwd(), 'workers/api');
const wranglerConfig = resolve(workerDir, 'wrangler.toml');

const result = spawnSync(
  'npx',
  ['--yes', 'wrangler@4', 'deploy', '--config', wranglerConfig],
  {
    cwd: workerDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: CF_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT,
    },
  },
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log('Worker deployment complete.');
