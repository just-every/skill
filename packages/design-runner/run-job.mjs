import fs from 'node:fs/promises';
import path from 'node:path';
import { DesignEngine } from '@just-every/code-design';

const RUN_ID = process.env.RUN_ID;
const PROMPT = process.env.PROMPT || '';
const CONFIG_JSON = process.env.CONFIG_JSON || '{}';
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:9788';
const RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN || process.env.RUNNER_AUTH_SECRET || '';
const OUTPUT_ROOT = process.env.CODE_DESIGN_OUTPUT_DIR || path.join(process.cwd(), '.output');

if (!RUN_ID) {
  console.error('RUN_ID is required');
  process.exit(1);
}

if (!RUNNER_AUTH_TOKEN) {
  console.error('RUNNER_AUTH_TOKEN or RUNNER_AUTH_SECRET is required');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRetryDelayMs = (attempt) => {
  const base = 500;
  const max = 10_000;
  const exp = Math.min(max, base * Math.pow(2, attempt - 1));
  const jitter = 0.2 + Math.random() * 0.3;
  return Math.round(exp * jitter);
};

const isRetryableStatus = (status) => {
  if (status === 408) return true;
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
};

const apiFetch = async (pathSuffix, options) => {
  const url = `${API_BASE_URL}${pathSuffix}`;
  const maxAttempts = 5;
  const timeoutMs = 30_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${RUNNER_AUTH_TOKEN}`,
          ...(options?.headers || {}),
        },
        signal: controller.signal,
      });

      if (response.ok) {
        return response;
      }

      const text = await response.text().catch(() => '');

      if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
        throw new Error(`Runner API error ${response.status}: ${text}`);
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }

    await sleep(getRetryDelayMs(attempt));
  }

  throw new Error(`Runner API request failed after ${maxAttempts} attempts: ${url}`);
};

const postStatus = async (payload) => {
  await apiFetch(`/api/runner/runs/${RUN_ID}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

const postEvent = async (eventType, message, metadata) => {
  await apiFetch(`/api/runner/runs/${RUN_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType, message, metadata }),
  });
};

const postEventBatch = async (events) => {
  if (!events.length) return;
  const chunkSize = 25;
  for (let i = 0; i < events.length; i += chunkSize) {
    const chunk = events.slice(i, i + chunkSize);
    await apiFetch(`/api/runner/runs/${RUN_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: chunk }),
    });
  }
};

const uploadArtifact = async ({ filePath, artifactType, metadata }) => {
  const fileBuffer = await fs.readFile(filePath);
  const filename = path.basename(filePath);
  const contentType = guessContentType(filename);
  const form = new FormData();
  form.append('artifactType', artifactType);
  if (metadata) {
    form.append('metadata', JSON.stringify(metadata));
  }
  const blob = new Blob([fileBuffer], { type: contentType });
  form.append('file', blob, filename);
  await apiFetch(`/api/runner/runs/${RUN_ID}/artifacts`, {
    method: 'POST',
    body: form,
    // Important: do not set Content-Type for FormData; fetch will add boundary.
    headers: {},
  });
};

const guessContentType = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'json') return 'application/json';
  if (ext === 'html') return 'text/html';
  return 'application/octet-stream';
};

const computeProgress = (state) => {
  if (!state || !state.phases) return null;
  const phases = ['init', 'creativeBrief', 'ideation', 'image', 'finalize'];
  let completed = 0;
  for (const phase of phases) {
    const info = state.phases[phase];
    if (!info) continue;
    if (info.status === 'completed' || info.status === 'skipped') {
      completed += 1;
    }
  }
  return Math.min(1, completed / phases.length);
};

const tailEvents = async (eventsPath, signal, onEvents) => {
  let offset = 0;
  while (!signal.stop) {
    try {
      const stat = await fs.stat(eventsPath);
      if (stat.size < offset) {
        offset = 0;
      }
      if (stat.size > offset) {
        const handle = await fs.open(eventsPath, 'r');
        const buffer = Buffer.alloc(stat.size - offset);
        await handle.read(buffer, 0, buffer.length, offset);
        await handle.close();

        const lastNewlineIndex = buffer.lastIndexOf('\n');
        if (lastNewlineIndex !== -1) {
          const processed = buffer.subarray(0, lastNewlineIndex + 1);
          const nextOffset = offset + processed.length;

          const lines = processed.toString('utf-8').split('\n').filter(Boolean);
          const events = lines.map((line) => {
            try {
              const parsed = JSON.parse(line);
              return {
                eventType: parsed.type || parsed.eventType || 'event',
                message: parsed.message || parsed.detail || null,
                metadata: parsed,
              };
            } catch {
              return null;
            }
          }).filter(Boolean);
          if (events.length) {
            await onEvents(events);
          }

          offset = nextOffset;
        }
      }
    } catch {
      // ignore
    }
    await sleep(1500);
  }
};

const pollProgress = async (statePath, signal, onProgress) => {
  while (!signal.stop) {
    try {
      const raw = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(raw);
      const progress = computeProgress(state);
      if (progress !== null) {
        await onProgress(progress, state);
      }
    } catch {
      // ignore
    }
    await sleep(3000);
  }
};

const main = async () => {
  let config;
  try {
    config = JSON.parse(CONFIG_JSON);
  } catch {
    config = {};
  }

  const variants = Math.max(1, Math.min(Number(config.variants || 3), 6));
  const style = typeof config.style === 'string' && config.style.trim() ? `\nStyle: ${config.style.trim()}` : '';
  const prompt = `${PROMPT}${style}`.trim();

  await postStatus({ status: 'running', progress: 0 });

  const outputRoot = OUTPUT_ROOT;
  const engine = new DesignEngine(outputRoot, { useRealProviders: true });

  const eventsPath = path.join(outputRoot, RUN_ID, 'events.jsonl');
  const statePath = path.join(outputRoot, RUN_ID, 'state.json');

  let lastProgress = -1;
  const stopSignal = { stop: false };

  let progressTask = null;
  let eventTask = null;

  let shutdownStarted = false;
  const shutdown = async (status) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    stopSignal.stop = true;
    await Promise.allSettled([progressTask, eventTask].filter(Boolean));
    await Promise.allSettled([
      postStatus({ status, progress: 1 }),
      postEvent('runner_cancelled', 'Runner job cancelled', { status }),
    ]);
  };

  const onSigterm = () => {
    shutdown('cancelled').finally(() => process.exit(1));
  };
  const onSigint = () => {
    shutdown('cancelled').finally(() => process.exit(1));
  };
  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);

  progressTask = pollProgress(statePath, stopSignal, async (progress) => {
    if (progress === null) return;
    if (Math.abs(progress - lastProgress) < 0.01) return;
    lastProgress = progress;
    await postStatus({ status: 'running', progress });
  });

  eventTask = tailEvents(eventsPath, stopSignal, async (events) => {
    await postEventBatch(events);
  });

  let result;
  try {
    result = await engine.execute({
      runId: RUN_ID,
      prompt,
      output: {
        kind: 'image',
        count: variants,
        format: 'png',
      },
      imageLoop: {
        maxRounds: 1,
        minScore: 0,
        draftsPerRound: variants,
      },
      creativeBrief: { enabled: false },
      ideation: { enabled: false },
    });
  } catch (error) {
    stopSignal.stop = true;
    await Promise.allSettled([progressTask, eventTask]);
    await Promise.allSettled([
      postStatus({ status: 'failed', error: error instanceof Error ? error.message : 'Run failed' }),
      postEvent('run_failed', 'Design run failed', { error: error instanceof Error ? error.message : error }),
    ]);
    throw error;
  } finally {
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
  }

  stopSignal.stop = true;
  await Promise.allSettled([progressTask, eventTask]);

  await postStatus({ status: 'completed', progress: 1 });

  const outputDir = result.outputDir;
  const artifactsDir = path.join(outputDir, 'artifacts');
  const stateRaw = await fs.readFile(path.join(outputDir, 'state.json'), 'utf-8');
  const state = JSON.parse(stateRaw);

  if (state?.artifacts?.targetImage) {
    await uploadArtifact({
      filePath: path.join(artifactsDir, state.artifacts.targetImage),
      artifactType: 'target-image',
      metadata: { path: state.artifacts.targetImage },
    });
  }

  if (result.output?.kind === 'image') {
    for (const image of result.output.images) {
      await uploadArtifact({
        filePath: path.join(artifactsDir, image.path),
        artifactType: 'final-image',
        metadata: { path: image.path, score: image.score },
      });
    }
  }

  await uploadArtifact({
    filePath: path.join(outputDir, 'manifest.json'),
    artifactType: 'manifest',
  });

  await uploadArtifact({
    filePath: path.join(outputDir, 'state.json'),
    artifactType: 'state',
  });

  await postEvent('artifacts_uploaded', 'Artifacts uploaded');
};

main().catch((error) => {
  console.error('Runner job failed', error);
  process.exit(1);
});
