#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const distDir = path.resolve(projectRoot, 'apps', 'web', 'dist');
const host = process.env.PLAYWRIGHT_STATIC_HOST ?? '127.0.0.1';
const port = Number(process.env.PLAYWRIGHT_STATIC_PORT ?? 4173);
const localBaseUrl = `http://${host}:${port}`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const emptySessionPayload = { session: null, user: null };

async function ensureDist() {
  try {
    const stats = await stat(distDir);
    if (!stats.isDirectory()) {
      throw new Error('dist path is not a directory');
    }
    return;
  } catch {
    await runBuild();
  }
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build', '--workspace', 'apps/web'], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    build.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`apps/web build failed (exit code ${code})`));
      }
    });
  });
}

function resolveFilePath(urlPath) {
  const safePath = path.normalize(decodeURIComponent(urlPath)).replace(/^\/+/, '');
  let candidate = path.join(distDir, safePath);
  return stat(candidate)
    .then((stats) => {
      if (stats.isDirectory()) {
        return path.join(candidate, 'index.html');
      }
      return candidate;
    })
    .catch(() => {
      if (safePath.endsWith('/') || safePath === '') {
        return path.join(distDir, safePath, 'index.html');
      }
      return path.join(distDir, 'index.html');
    });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath);
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function respondJson(res, payload, status = 200) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const readEnv = (key) => {
  const value = process.env[key];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

function buildRuntimeEnvPayload() {
  const loginOrigin = readEnv('E2E_LOGIN_ORIGIN') ?? readEnv('EXPO_PUBLIC_LOGIN_ORIGIN') ?? localBaseUrl;
  const loginBase = trimTrailingSlash(loginOrigin);
  const betterAuthBaseUrl =
    readEnv('E2E_BETTER_AUTH_URL') ??
    readEnv('EXPO_PUBLIC_BETTER_AUTH_URL') ??
    `${localBaseUrl}/api/auth`;
  const sessionEndpoint = readEnv('E2E_SESSION_ENDPOINT') ?? `${localBaseUrl}/api/auth/session`;
  const workerOrigin = readEnv('E2E_WORKER_ORIGIN') ?? readEnv('EXPO_PUBLIC_WORKER_ORIGIN') ?? 'http://127.0.0.1:9788';
  const workerOriginLocal = readEnv('E2E_WORKER_ORIGIN_LOCAL') ?? workerOrigin;

  return {
    loginOrigin: loginBase,
    betterAuthBaseUrl,
    sessionEndpoint,
    workerOrigin,
    workerOriginLocal,
    starfieldEnabled: true,
  };
}

function injectRuntimeEnv(html, payload) {
  const script = `\n<script id="justevery-runtime-env">(function(){var env=${JSON.stringify(
    payload,
  )};window.__JUSTEVERY_ENV__=env;window.dispatchEvent(new CustomEvent('justevery:env-ready',{detail:env}));})();</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}\n</head>`);
  }
  return `${script}\n${html}`;
}

function handleSessionRoute(req, res, pathname) {
  if (pathname === '/api/auth/session' || pathname === '/api/session') {
    respondJson(res, emptySessionPayload);
    return true;
  }
  if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
    respondJson(res, { ok: true, session: null });
    return true;
  }
  if (pathname === '/api/session/logout' && req.method === 'POST') {
    respondJson(res, { ok: true });
    return true;
  }
  return false;
}

async function start() {
  await ensureDist();

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', localBaseUrl);

    if (requestUrl.pathname === '/api/runtime-env') {
      respondJson(res, buildRuntimeEnvPayload());
      return;
    }

    if (handleSessionRoute(req, res, requestUrl.pathname)) {
      return;
    }

    try {
      const filePath = await resolveFilePath(requestUrl.pathname);
      const mime = getMimeType(filePath);
      res.setHeader('Content-Type', mime);
      if (mime.includes('text/html')) {
        const html = await readFile(filePath, 'utf8');
        const payload = buildRuntimeEnvPayload();
        const injected = injectRuntimeEnv(html, payload);
        res.writeHead(200, { 'Cache-Control': 'no-cache' });
        res.end(injected);
        return;
      }
      if (mime.startsWith('text/') || mime.includes('javascript') || mime.includes('json')) {
        const data = await readFile(filePath);
        res.writeHead(200, { 'Cache-Control': 'no-cache' });
        res.end(data);
        return;
      }
      res.writeHead(200, { 'Cache-Control': 'no-cache' });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Not found: ${(error && error.message) || 'unknown error'}`);
    }
  });

  server.listen(port, host, () => {
    console.log(`[static] serving ${distDir} at http://${host}:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
