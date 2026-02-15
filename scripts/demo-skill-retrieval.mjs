#!/usr/bin/env node

function readArg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

async function main() {
  const baseUrl = readArg('--base-url', 'http://127.0.0.1:9788');
  const task = readArg('--task', 'Harden our GitHub Actions workflow, pin actions, and secure secrets.');
  const agent = readArg('--agent', 'codex');
  const expected = readArg('--expected', 'ci-security-hardening');

  const url = new URL('/api/skills/recommend', baseUrl);
  url.searchParams.set('task', task);
  url.searchParams.set('agent', agent);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const slug = payload?.recommendation?.slug;
  const name = payload?.recommendation?.name;
  const score = payload?.recommendation?.finalScore;

  console.log('[demo] query:', task);
  console.log('[demo] recommended skill:', slug, `(${name})`, 'score=', score);

  if (expected && slug !== expected) {
    throw new Error(`expected ${expected}, got ${slug ?? 'null'}`);
  }

  console.log('[demo] retrieval success');
}

main().catch((error) => {
  console.error('[demo] failed', error.message || error);
  process.exit(1);
});

