#!/usr/bin/env node

const { readFileSync } = require('node:fs');

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

const envMap = {};
const aliasMap = new Map([
  ['STYTCH_PROJECT_SECRET', 'STYTCH_SECRET'],
  ['STYTCH_PROJECT_PUBLIC_TOKEN', 'STYTCH_PUBLIC_TOKEN'],
  ['STYTCH_PROJECT_ALIAS', 'STYTCH_ORGANIZATION_SLUG'],
  ['STRIPE_LIVE_SECRET_KEY', 'STRIPE_SECRET_KEY'],
  ['STRIPE_TEST_SECRET_KEY', 'STRIPE_SECRET_KEY'],
]);

for (const line of rawEnv.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const rawKey = trimmed.slice(0, idx).trim();
  const key = aliasMap.get(rawKey) || rawKey;
  const value = trimmed.slice(idx + 1).trim();
  if (key === 'STYTCH_ORGANIZATION_SLUG' && (value.includes('://') || value.includes('.'))) {
    continue;
  }
  if (!envMap[key]) {
    envMap[key] = value;
  }
}

const REQUIRED_KEYS = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'STYTCH_PROJECT_ID',
  'STYTCH_SECRET',
];

const LOCATOR_KEYS = ['STYTCH_SSO_CONNECTION_ID', 'STYTCH_ORGANIZATION_SLUG'];

const OPTIONAL_KEYS = [
  'STYTCH_PUBLIC_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

let missingRequired = [];
for (const key of REQUIRED_KEYS) {
  const present = Boolean(envMap[key]);
  console.log(`${present ? '✅' : '❌'} ${key}`);
  if (!present) missingRequired.push(key);
}

const hasLocator = LOCATOR_KEYS.some((key) => {
  const present = Boolean(envMap[key]);
  console.log(`${present ? '✅' : '❌'} ${key}`);
  return present;
});

for (const key of OPTIONAL_KEYS) {
  const present = Boolean(envMap[key]);
  console.log(`${present ? '✅' : '⚠️'} ${key}`);
}

if (missingRequired.length > 0) {
  console.error(`Missing required secrets: ${missingRequired.join(', ')}`);
}

if (!hasLocator) {
  console.error('Either STYTCH_SSO_CONNECTION_ID or STYTCH_ORGANIZATION_SLUG must be present.');
}

if (missingRequired.length > 0 || !hasLocator) {
  process.exit(1);
}

console.log('All required secrets present.');
