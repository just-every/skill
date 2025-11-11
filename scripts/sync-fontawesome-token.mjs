#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const cwd = process.env.FONT_AWESOME_SYNC_CWD
  ? resolve(process.env.FONT_AWESOME_SYNC_CWD)
  : process.cwd();
const token = process.env.FONT_AWESOME_PACKAGE_TOKEN?.trim() ?? '';
const npmrcPath = resolve(cwd, '.npmrc');

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
