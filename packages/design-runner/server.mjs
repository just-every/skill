import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.RUNNER_PORT || 8789);
const apiKey = process.env.DAYTONA_API_KEY || process.env.RUNNER_API_KEY;
const workerBaseUrl = process.env.WORKER_BASE_URL || process.env.EXPO_PUBLIC_WORKER_ORIGIN || 'http://127.0.0.1:9788';
const runnerSecret = process.env.RUNNER_AUTH_SECRET;

if (!apiKey) {
  console.warn('DAYTONA_API_KEY is not set; /jobs will reject requests.');
}
if (!runnerSecret) {
  console.warn('RUNNER_AUTH_SECRET is not set; runner updates will be rejected by Worker.');
}

const repoRoot = path.resolve(__dirname, '../..');
const dockerfilePath = path.join(repoRoot, 'packages/design-runner/Dockerfile');

const allowPrefixes = [
  'CODE_DESIGN_',
  'OPENAI_',
  'ANTHROPIC_',
  'GEMINI_',
  'QWEN_',
  'CLAUDE_',
  'FAL_',
  'STABILITY_',
  'IDEOGRAM_',
  'TOGETHER_',
  'REPLICATE_',
  'RUNWAY_',
  'LUMA_',
  'MIDJOURNEY_',
  'BRAVE_',
  'SERP_',
  'ARK_',
  'BYTEPLUS_',
  'BYTEDANCE_',
  'CODE_AUTH_',
  'PLAYWRIGHT_',
];

const collectEnvVars = () => {
  const entries = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (allowPrefixes.some((prefix) => key.startsWith(prefix))) {
      entries.push([key, value]);
    }
  }
  return entries;
};

const buildSandboxCommand = ({ runId, prompt, config, runnerAuthToken }) => {
  const envPairs = [
    ['RUN_ID', runId],
    ['PROMPT', prompt || ''],
    ['CONFIG_JSON', JSON.stringify(config ?? {})],
    ['API_BASE_URL', workerBaseUrl],
    ['RUNNER_AUTH_SECRET', runnerSecret || ''],
    ['CODE_DESIGN_USE_REAL_PROVIDERS', '1'],
    ['CODE_DESIGN_OUTPUT_DIR', '/app/output'],
  ];

  if (runnerAuthToken) {
    envPairs.push(['RUNNER_AUTH_TOKEN', runnerAuthToken]);
  }

  for (const [key, value] of collectEnvVars()) {
    envPairs.push([key, value]);
  }

  const args = [
    'sandbox',
    'create',
    '--name',
    `design-run-${runId}`,
    '--auto-delete',
    process.env.DAYTONA_AUTO_DELETE_MINUTES || '60',
    '-f',
    dockerfilePath,
    '-c',
    repoRoot,
  ];

  if (process.env.DAYTONA_NETWORK_ALLOW_LIST) {
    args.push('--network-allow-list', process.env.DAYTONA_NETWORK_ALLOW_LIST);
  }
  if (process.env.DAYTONA_NETWORK_BLOCK_ALL === '1') {
    args.push('--network-block-all');
  }

  for (const [key, value] of envPairs) {
    args.push('-e', `${key}=${value}`);
  }

  return args;
};

const startJob = ({ runId, prompt, config, runnerAuthToken }) => {
  const args = buildSandboxCommand({ runId, prompt, config, runnerAuthToken });
  const child = spawn('daytona', args, {
    stdio: 'inherit',
  });
  child.on('error', (err) => {
    console.error('Failed to launch Daytona sandbox', err);
  });
  child.unref();
};

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('missing url');
    return;
  }

  if (req.method !== 'POST' || !req.url.startsWith('/jobs')) {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== apiKey) {
    res.writeHead(401);
    res.end('unauthorized');
    return;
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk.toString();
  });

  req.on('end', () => {
    try {
      const payload = JSON.parse(raw || '{}');
      const { runId, prompt, config } = payload;
      const runnerAuthToken = typeof payload?.runnerToken === 'string' && payload.runnerToken.trim()
        ? payload.runnerToken.trim()
        : typeof payload?.runnerAuth?.token === 'string' && payload.runnerAuth.token.trim()
          ? payload.runnerAuth.token.trim()
          : null;
      if (!runId) {
        res.writeHead(400);
        res.end('runId required');
        return;
      }
      startJob({ runId, prompt, config, runnerAuthToken });
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, runId }));
    } catch (err) {
      console.error('Runner request failed', err);
      res.writeHead(500);
      res.end('runner error');
    }
  });
});

server.listen(PORT, () => {
  console.info(`Design runner listening on ${PORT}`);
});
