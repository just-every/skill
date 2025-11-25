#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const projectRoot = path.resolve(scriptDir, '..');
const envGeneratedPath = path.join(projectRoot, '.env.generated');
const envLocalPath = path.join(projectRoot, '.env.local');
const devVarsPath = path.join(projectRoot, 'workers/api/.dev.vars');

if (!fs.existsSync(envGeneratedPath)) {
  console.error('[dev-local] Missing .env.generated. Run `pnpm bootstrap:env` first.');
  process.exit(1);
}

const generated = readEnvFile(envGeneratedPath);
const overrides = buildOverrides(generated.map);

const envLocalExisting = readEnvFile(envLocalPath);
const mergedEnv = mergeEntries(generated, envLocalExisting, overrides.env);
writeEnvFile(envLocalPath, envHeader(), mergedEnv);

const devVarsExisting = readEnvFile(devVarsPath);
const mergedDevVars = mergeEntries(devVarsExisting, null, overrides.worker);
writeEnvFile(devVarsPath, devVarsHeader(), mergedDevVars);

console.log(
  `[dev-local] wrote ${relativePath(envLocalPath)} + ${relativePath(devVarsPath)} for ${overrides.summary.workerOrigin}`
);

function readEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { order: [], map: {} };
  }
  const contents = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const lines = contents.split('\n');
  const order = [];
  const map = {};
  for (const line of lines) {
    if (!line) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const rawValue = line.slice(eq + 1).trim();
    if (!Object.prototype.hasOwnProperty.call(map, key)) {
      order.push(key);
    }
    map[key] = unquote(rawValue);
  }
  return { order, map };
}

function mergeEntries(base, extra, overrides) {
  const order = [...(base?.order ?? [])];
  const map = { ...(base?.map ?? {}) };

  if (extra) {
    for (const key of extra.order) {
      if (!order.includes(key)) {
        order.push(key);
      }
      if (!Object.prototype.hasOwnProperty.call(overrides, key)) {
        map[key] = extra.map[key];
      }
    }
  }

  for (const key of Object.keys(overrides)) {
    if (!order.includes(key)) {
      order.push(key);
    }
    map[key] = overrides[key];
  }

  return { order, map };
}

function writeEnvFile(filePath, header, entries) {
  const lines = [];
  if (header) {
    lines.push(header.trimEnd());
    lines.push('');
  }
  for (const key of entries.order) {
    if (!key) continue;
    const value = entries.map[key];
    if (typeof value === 'undefined') {
      continue;
    }
    lines.push(`${key}=${escapeValue(value)}`);
  }
  const output = `${lines.join('\n')}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, output, 'utf8');
}

function buildOverrides(baseEnv) {
  const workerOrigin = normaliseOrigin(
    process.env.LOCAL_WORKER_ORIGIN ?? 'http://127.0.0.1:9788',
    'http://127.0.0.1:9788'
  );

  const loginOrigin = normaliseOrigin(
    process.env.LOCAL_LOGIN_ORIGIN ?? 'http://127.0.0.1:9787',
    'http://127.0.0.1:9787'
  );

  const betterAuthUrl = normaliseUrl(
    process.env.LOCAL_BETTER_AUTH_URL ?? `${trimTrailingSlash(loginOrigin)}/api/auth`,
    `${trimTrailingSlash(loginOrigin)}/api/auth`
  );

  const sessionEndpoint = normaliseUrl(
    process.env.LOCAL_SESSION_ENDPOINT ?? `${trimTrailingSlash(betterAuthUrl)}/session`,
    `${trimTrailingSlash(betterAuthUrl)}/session`
  );

  const appUrl = normaliseUrl(
    process.env.LOCAL_APP_URL ?? baseEnv.APP_URL,
    'http://127.0.0.1:19006'
  );

  const appBaseUrl = deriveBasePath(appUrl);
  const cookieDomain = deriveCookieDomain(process.env.LOCAL_COOKIE_DOMAIN, workerOrigin);

  const envOverrides = {
    LOGIN_ORIGIN: loginOrigin,
    BETTER_AUTH_URL: betterAuthUrl,
    SESSION_COOKIE_DOMAIN: cookieDomain,
    SESSION_ENDPOINT: sessionEndpoint,
    PROJECT_DOMAIN: workerOrigin,
    WORKER_ORIGIN: workerOrigin,
    APP_URL: appUrl,
    APP_BASE_URL: appBaseUrl,
    EXPO_PUBLIC_LOGIN_ORIGIN: loginOrigin,
    EXPO_PUBLIC_BETTER_AUTH_URL: betterAuthUrl,
    EXPO_PUBLIC_SESSION_ENDPOINT: sessionEndpoint,
    EXPO_PUBLIC_WORKER_ORIGIN: workerOrigin,
    EXPO_PUBLIC_WORKER_ORIGIN_LOCAL: workerOrigin,
  };

  const workerOverrides = {
    LOGIN_ORIGIN: loginOrigin,
    BETTER_AUTH_URL: betterAuthUrl,
    SESSION_COOKIE_DOMAIN: cookieDomain,
    SESSION_ENDPOINT: sessionEndpoint,
    PROJECT_DOMAIN: workerOrigin,
    APP_URL: appUrl,
    APP_BASE_URL: appBaseUrl,
    EXPO_PUBLIC_WORKER_ORIGIN: workerOrigin,
  };

  return {
    env: envOverrides,
    worker: workerOverrides,
    summary: {
      workerOrigin,
      loginOrigin,
    },
  };
}

function normaliseOrigin(value, fallback) {
  const candidate = (value ?? '').trim();
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallback;
  }
}

function normaliseUrl(value, fallback) {
  const candidate = (value ?? '').trim();
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    url.hash = '';
    url.search = '';
    if (url.pathname === '/' || url.pathname === '') {
      return `${url.protocol}//${url.host}`;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

function deriveBasePath(urlString) {
  try {
    const url = new URL(urlString);
    const stripped = url.pathname.replace(/\/+$/, '');
    return stripped || '/';
  } catch {
    return '/';
  }
}

function deriveCookieDomain(explicit, workerOrigin) {
  const candidate = (explicit ?? '').trim();
  if (candidate) {
    return candidate;
  }
  try {
    const url = new URL(workerOrigin);
    return url.hostname || 'localhost';
  } catch {
    return 'localhost';
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function unquote(value) {
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function escapeValue(value) {
  if (value === '') return '';
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  return JSON.stringify(value);
}

function envHeader() {
  return '# Local overrides generated via `npm run dev:local`\n# Do not edit by hand.';
}

function devVarsHeader() {
  return '# Local wrangler overrides generated via `npm run dev:local`\n# Do not edit by hand.';
}

function relativePath(filePath) {
  return path.relative(projectRoot, filePath) || path.basename(filePath);
}
