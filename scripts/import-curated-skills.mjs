#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'every-skill-import-script',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function main() {
  const indexUrl = 'https://api.github.com/repos/openai/skills/contents/skills/.curated';
  const entries = await fetchJson(indexUrl);
  const curated = Array.isArray(entries)
    ? entries.filter((entry) => entry.type === 'dir').map((entry) => ({
      name: entry.name,
      path: entry.path,
      htmlUrl: entry.html_url,
    }))
    : [];

  const sampled = [];
  for (const entry of curated.slice(0, 8)) {
    const skillUrl = `https://raw.githubusercontent.com/openai/skills/main/${entry.path}/SKILL.md`;
    try {
      const response = await fetch(skillUrl, {
        headers: { 'User-Agent': 'every-skill-import-script' },
      });
      if (!response.ok) continue;
      const markdown = await response.text();
      sampled.push({
        ...entry,
        skillUrl,
        preview: markdown.split(/\r?\n/).slice(0, 12).join('\n'),
      });
    } catch {
      // ignore sample failures; retain index at least
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'openai/skills',
    indexUrl,
    totalCuratedSkills: curated.length,
    curated,
    sampled,
  };

  const outDir = path.join(repoRoot, 'benchmarks', 'imports');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'openai-curated-skills.json');
  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[import] wrote ${payload.totalCuratedSkills} curated entries to ${outPath}`);
}

main().catch((error) => {
  console.error('[import] failed', error);
  process.exit(1);
});

