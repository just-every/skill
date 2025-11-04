#!/usr/bin/env node

const { readdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = resolve(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');

/**
 * Extract database_name from wrangler.toml to ensure migrations target
 * the same database that the Worker uses at runtime.
 */
function getDatabaseNameFromWrangler() {
  try {
    const wranglerPath = join(ROOT, 'wrangler.toml');
    const content = readFileSync(wranglerPath, 'utf-8');
    const match = content.match(/^\s*database_name\s*=\s*"([^"]+)"/m);
    if (match && match[1]) {
      return match[1];
    }
  } catch (error) {
    console.warn('Warning: Could not read database_name from wrangler.toml:', error.message);
  }
  return null;
}

const DATABASE_NAME =
  process.env.D1_DATABASE ||
  getDatabaseNameFromWrangler() ||
  process.env.CLOUDFLARE_D1_NAME ||
  'placeholder_db';

async function main() {
  const isRemote = process.argv.slice(2).includes('--remote');
  const mode = isRemote ? 'remote' : 'local';

  console.log(`→ Using database: ${DATABASE_NAME} (${mode})`);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migrations found.');
    return;
  }

  console.log(`→ Found ${files.length} migration file(s)`);

  for (const file of files) {
    const filePath = join(MIGRATIONS_DIR, file);
    console.log(`→ Applying migration ${file}`);
    await execWrangler(['d1', 'execute', DATABASE_NAME, '--file', filePath, ...process.argv.slice(2)]);
  }

  console.log('\n✅ All migrations applied successfully');

  // Verify schema was created
  console.log(`→ Verifying schema in ${mode} database...`);
  try {
    await execWrangler(['d1', 'execute', DATABASE_NAME, '--command',
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects';",
      ...process.argv.slice(2)]);
    console.log('✅ Schema verification passed');
  } catch (error) {
    console.error('❌ Schema verification failed:', error.message);
    throw error;
  }
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
