#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIST_DIR = path.join(PROJECT_ROOT, 'apps', 'web', 'dist');
const DIST_DIR = path.resolve(PROJECT_ROOT, process.env.WEB_DIST_DIR || DEFAULT_DIST_DIR);
const DEFAULT_BUNDLE_DIR = path.join(DIST_DIR, '_expo', 'static', 'js', 'web');
const BUNDLE_DIR = path.resolve(PROJECT_ROOT, process.env.WEB_BUNDLE_DIR || DEFAULT_BUNDLE_DIR);

function requireDir(dir, label) {
  if (!fs.existsSync(dir)) {
    console.error(`[smoke] ${label} not found: ${dir}`);
    process.exit(1);
  }
}

function gatherBundleFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(dir, entry.name));
}

function parseBundle(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const wrapped = `'use strict';\n${source}`;
  try {
    // eslint-disable-next-line no-new-func
    new Function(wrapped);
    return true;
  } catch (error) {
    console.error(`[smoke] Failed to parse ${filePath}: ${error.message}`);
    return false;
  }
}

function main() {
  requireDir(DIST_DIR, 'Expo web dist directory');
  requireDir(BUNDLE_DIR, 'Expo web bundle directory');

  const bundles = gatherBundleFiles(BUNDLE_DIR);

  if (bundles.length === 0) {
    console.error(`[smoke] No JavaScript bundles found under ${BUNDLE_DIR}`);
    process.exit(1);
  }

  let parsedCount = 0;
  for (const bundle of bundles) {
    const success = parseBundle(bundle);
    if (!success) {
      process.exit(1);
    }
    console.log(`[smoke] Parsed ${path.relative(PROJECT_ROOT, bundle)}`);
    parsedCount += 1;
  }

  console.log(`[smoke] Client bundle smoke passed (${parsedCount} file${parsedCount === 1 ? '' : 's'})`);
}

main();
