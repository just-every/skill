#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const cwd = process.env.FONT_AWESOME_SYNC_CWD
  ? resolve(process.env.FONT_AWESOME_SYNC_CWD)
  : process.cwd();
const npmrcPath = resolve(cwd, '.npmrc');

const loadTokenFromDotEnv = () => {
  const envPath = resolve(homedir(), '.env');
  if (!existsSync(envPath)) {
    return '';
  }
  try {
    const contents = readFileSync(envPath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*FONT_AWESOME_PACKAGE_TOKEN\s*=\s*(.+)\s*$/);
      if (match) {
        return match[1].replace(/^['"]|['"]$/g, '');
      }
    }
  } catch (err) {
    console.warn(`[fontawesome] Failed to read ${envPath}:`, err);
  }
  return '';
};

let token = process.env.FONT_AWESOME_PACKAGE_TOKEN?.trim() ?? '';
if (!token) {
  token = loadTokenFromDotEnv();
  if (token) {
    console.log('[fontawesome] Loaded FONT_AWESOME_PACKAGE_TOKEN from ~/.env');
  }
}

function removeFile(path) {
  if (existsSync(path)) {
    rmSync(path);
    console.warn(
      `[fontawesome] Removed ${path} because FONT_AWESOME_PACKAGE_TOKEN is not set.`
    );
  }
}

if (!token) {
  removeFile(npmrcPath);
  process.exit(0);
}

const content = `@fortawesome:registry=https://npm.fontawesome.com/\n//npm.fontawesome.com/:_authToken=${token}\n`;
const dir = dirname(npmrcPath);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}
writeFileSync(npmrcPath, content, 'utf8');
console.log(`[fontawesome] Synced Font Awesome registry credentials to ${npmrcPath}`);
