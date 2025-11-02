#!/usr/bin/env node

const { readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = resolve(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');
const DATABASE_NAME = process.env.D1_DATABASE || process.env.CLOUDFLARE_D1_NAME || 'placeholder_db';

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migrations found.');
    return;
  }

  for (const file of files) {
    const filePath = join(MIGRATIONS_DIR, file);
    console.log(`→ Applying migration ${file}`);
    await execWrangler(['d1', 'execute', DATABASE_NAME, '--file', filePath, ...process.argv.slice(2)]);
  }

  console.log('\n✅ All migrations applied');
}

function execWrangler(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('wrangler', args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', (error) => rejectPromise(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`wrangler ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

main().catch((error) => {
  console.error('Migration script failed:', error);
  process.exit(1);
});
