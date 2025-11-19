#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const envFiles = [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.ci'),
  path.join(repoRoot, '.env.generated'),
  path.join(os.homedir(), '.env'),
].filter(Boolean);

const fileEnv = Object.create(null);

for (const file of envFiles) {
  if (!fs.existsSync(file)) continue;
  const contents = fs.readFileSync(file, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    if (line.startsWith('export ')) {
      line = line.slice('export '.length).trim();
    }
    const hashIndex = line.indexOf(' #');
    if (hashIndex !== -1) {
      line = line.slice(0, hashIndex).trim();
    }
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
    if (key) {
      fileEnv[key.trim()] = value;
    }
  }
}

const env = { ...fileEnv, ...process.env };

const PLACEHOLDER_REGEX = /(placeholder|dummy|example)/i;

const requiredChecks = [
  {
    name: 'CLOUDFLARE_ACCOUNT_ID',
    validate: (value) => /^[a-f0-9]{32}$/i.test(value),
    help: '32 hex characters (Cloudflare account id)',
  },
  {
    name: 'CLOUDFLARE_API_TOKEN',
    validate: (value) => value.length >= 30 && !PLACEHOLDER_REGEX.test(value),
    help: 'API token with at least 30 characters',
  },
  {
    name: 'STRIPE_SECRET_KEY',
    validate: (value) => /^sk_(live|test)_/i.test(value) && !PLACEHOLDER_REGEX.test(value),
    help: 'Stripe secret key beginning with sk_live_ or sk_test_',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    validate: (value) => value.startsWith('whsec') && value.length >= 12 && !PLACEHOLDER_REGEX.test(value),
    help: 'Stripe webhook secret beginning with whsec_',
  },
  {
    name: 'BETTER_AUTH_URL',
    validate: (value) => value.startsWith('https://'),
    help: 'URL must start with https://',
  },
  {
    name: 'LOGIN_ORIGIN',
    validate: (value) => value.startsWith('https://'),
    help: 'URL must start with https://',
  },
  {
    name: 'SESSION_COOKIE_DOMAIN',
    validate: (value) => value.startsWith('.') && value.length > 2,
    help: 'Domain should start with a dot (e.g., .justevery.com)',
  },
  {
    name: 'PROJECT_DOMAIN',
    validate: (value) => value.startsWith('https://'),
    help: 'Public project domain (https://...) is required for smoke checks',
  },
  {
    name: 'STRIPE_PRODUCTS',
    validate: (value) => value.trim().length > 0 && !PLACEHOLDER_REGEX.test(value),
    help: 'At least one Stripe product definition must be present',
  },
  {
    name: 'EXPO_PUBLIC_WORKER_ORIGIN',
    validate: (value) => value.startsWith('https://'),
    help: 'Expo client must know the deployed worker origin',
  },
];

const issues = [];

for (const check of requiredChecks) {
  const value = env[check.name];
  if (!value) {
    issues.push(`${check.name} is missing (${check.help})`);
    continue;
  }
  if (!check.validate(String(value))) {
    issues.push(`${check.name} is invalid (${check.help})`);
  }
}

const hasBillingToken = Boolean(env.BILLING_CHECKOUT_TOKEN && env.BILLING_CHECKOUT_TOKEN.trim());
const hasProvisionerTriplet = Boolean(
  env.LOGIN_PROVISIONER_CLIENT_ID &&
  env.LOGIN_PROVISIONER_CLIENT_SECRET &&
  env.LOGIN_PROVISIONER_OWNER_USER_ID
);

if (!hasBillingToken && !hasProvisionerTriplet) {
  issues.push('Provide BILLING_CHECKOUT_TOKEN or the LOGIN_PROVISIONER_* credentials');
}

const productsValue = env.STRIPE_PRODUCTS || '';
if (productsValue && productsValue.trim().startsWith('[')) {
  try {
    const parsed = JSON.parse(productsValue);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      issues.push('STRIPE_PRODUCTS JSON must contain at least one product entry');
    }
  } catch (error) {
    issues.push(`STRIPE_PRODUCTS JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (issues.length > 0) {
  console.error('✗ Deployment environment audit failed:\n');
  for (const issue of issues) {
    console.error(`  • ${issue}`);
  }
  process.exit(1);
}

console.log('✓ Deployment environment audit passed');
console.log(`Checked ${requiredChecks.length + 1} critical requirements`);
