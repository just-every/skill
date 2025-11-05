#!/usr/bin/env node

/**
 * Helper for listing R2 objects with Wrangler 4.45+ flag syntax.
 *
 * Usage examples:
 *   node scripts/r2-list.cjs --prefix marketing/
 *   node scripts/r2-list.cjs --bucket demo-assets --limit 20
 *   node scripts/r2-list.cjs --verify-hero
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function loadEnvFiles() {
  const envFiles = ['.env', '.env.local.generated'];
  const values = {};

  for (const file of envFiles) {
    try {
      const content = await fs.readFile(file, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
        const [rawKey, ...rest] = line.split('=');
        const key = rawKey.trim();
        if (!key) continue;
        const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
        if (value && !(key in values)) values[key] = value;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  return values;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    switch (current) {
      case '--bucket':
        args.bucket = argv[++i];
        break;
      case '--prefix':
        args.prefix = argv[++i];
        break;
      case '--limit':
        args.limit = Number.parseInt(argv[++i] || '', 10);
        break;
      case '--cursor':
        args.cursor = argv[++i];
        break;
      case '--verify-hero':
        args.verifyHero = true;
        break;
      case '--json':
        args.json = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        args._.push(current);
    }
  }
  return args;
}

function usage() {
  return `R2 helper (Wrangler 4.45+)

Usage:
  node scripts/r2-list.cjs [--bucket <name>] [--prefix <key/>] [--limit N] [--cursor C]
  node scripts/r2-list.cjs --verify-hero

Flags:
  --bucket       Override bucket name (default: R2_BUCKET_NAME or <PROJECT_ID>-assets)
  --prefix       Key prefix to list (default: marketing/)
  --limit        Max objects to fetch (1-1000)
  --cursor       Continue listing from the provided cursor
  --verify-hero  Ensure marketing/hero.png exists (non-zero exit if missing)
  --json         Emit JSON array only (suppresses summary output)
`;
}

async function runWrangler(args) {
  const { stdout } = await execFileAsync(
    'wrangler',
    ['--config', 'workers/api/wrangler.toml', ...args],
    { encoding: 'utf8' },
  );
  return stdout;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const envValues = await loadEnvFiles();
  const projectId = process.env.PROJECT_ID || envValues.PROJECT_ID;
  const defaultBucket =
    process.env.R2_BUCKET_NAME || envValues.R2_BUCKET_NAME || (projectId ? `${projectId}-assets` : undefined);

  const bucket = args.bucket || defaultBucket;
  if (!bucket) {
    console.error('R2 bucket name is required. Pass --bucket or define R2_BUCKET_NAME / PROJECT_ID.');
    process.exitCode = 1;
    return;
  }

  const prefix = args.prefix || 'marketing/';
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(1000, args.limit)) : undefined;
  const cursor = args.cursor || undefined;

  const wranglerArgs = ['r2', 'object', 'list', '--bucket', bucket, '--prefix', prefix, '--json'];
  if (limit) wranglerArgs.push('--limit', String(limit));
  if (cursor) wranglerArgs.push('--cursor', cursor);

  let objects;
  try {
    const stdout = await runWrangler(wranglerArgs);
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      objects = parsed;
    } else if (Array.isArray(parsed?.objects)) {
      objects = parsed.objects;
    } else {
      throw new Error('Unexpected Wrangler JSON response');
    }
  } catch (error) {
    console.error('Failed to list R2 objects via Wrangler:', error.message);
    process.exitCode = 1;
    return;
  }

  if (args.verifyHero) {
    const heroKey = 'marketing/hero.png';
    const found = objects.some((object) => object.key === heroKey || object.name === heroKey);
    if (!found) {
      console.error(`Hero asset missing: ${heroKey}`);
      process.exitCode = 1;
    } else {
      console.log(`Hero asset present: ${heroKey}`);
    }
    if (args.json) {
      console.log(JSON.stringify(objects, null, 2));
    }
    return;
  }

  if (args.json) {
    console.log(JSON.stringify(objects, null, 2));
    return;
  }

  if (!objects.length) {
    console.log(`No objects found in bucket ${bucket} with prefix ${prefix}`);
    return;
  }

  console.log(`Bucket: ${bucket}`);
  console.log(`Prefix: ${prefix}`);
  for (const object of objects) {
    const size = typeof object.size === 'number' ? `${object.size} B` : 'size?n/a';
    const uploaded = object.uploaded || object.uploaded_on || object.uploadedAt || 'unknown';
    console.log(`- ${object.key || object.name} (${size}, uploaded ${uploaded})`);
  }
  if (objects.at(-1)?.cursor) {
    console.log(`Next cursor: ${objects.at(-1).cursor}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

