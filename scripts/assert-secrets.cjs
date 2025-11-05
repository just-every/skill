#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const SECRET_NAMES = ['LOGTO_APPLICATION_ID', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
const WRANGLER_CONFIG = resolve('workers', 'api', 'wrangler.toml');

function listSecretNames() {
  const result = spawnSync(
    'wrangler',
    ['secret', 'list', '--config', WRANGLER_CONFIG],
    { encoding: 'utf8' },
  );

  if (result.error) {
    console.error(`Failed to execute wrangler: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.trim() : 'Unknown error';
    console.error(`wrangler secret list exited with status ${result.status}: ${stderr}`);
    process.exit(1);
  }

  const names = [];
  for (const line of result.stdout.split('\n')) {
    if (line.includes('│')) {
      const parts = line.split('│').map((part) => part.trim());
      const candidate = parts[1];
      if (candidate && candidate.toLowerCase() !== 'name') {
        names.push(candidate);
      }
    }
  }
  return names;
}

function main() {
  const names = new Set(listSecretNames());
  const missing = SECRET_NAMES.filter((name) => !names.has(name));

  if (missing.length > 0) {
    console.error(`Missing Worker secrets: ${missing.join(', ')}`);
    console.error('Add them via: wrangler secret put <NAME> --config workers/api/wrangler.toml');
    process.exit(1);
  }

  console.log(`Worker secrets present: ${SECRET_NAMES.join(', ')}`);
}

main();
