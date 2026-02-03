import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export async function loadRegistry(rootDir) {
  const registryPath = path.join(rootDir, 'skills', 'registry.json');
  const raw = await readFile(registryPath, 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.skills)) {
    throw new Error('Invalid skills/registry.json');
  }
  return { data, registryPath };
}

export async function loadKits(rootDir) {
  const kitsPath = path.join(rootDir, 'skills', 'kits.json');
  const raw = await readFile(kitsPath, 'utf8');
  const data = JSON.parse(raw);
  if (!data || typeof data.kits !== 'object') {
    throw new Error('Invalid skills/kits.json');
  }
  return { data, kitsPath };
}

export function resolveSkills({ registry, kits, kitName, skillNames }) {
  const names = new Set();
  if (kitName && kitName !== 'none') {
    const kit = kits.kits[kitName];
    if (!kit) throw new Error(`Unknown kit: ${kitName}`);
    for (const name of kit) names.add(name);
  }
  if (skillNames && skillNames.length) {
    for (const name of skillNames) names.add(name);
  }
  const list = [];
  for (const name of names) {
    const entry = registry.skills.find((s) => s.name === name);
    if (!entry) throw new Error(`Unknown skill: ${name}`);
    if (!entry.path && !entry.installer) {
      throw new Error(`Skill ${name} is missing both path and installer.`);
    }
    list.push(entry);
  }
  return list;
}

export async function addSkillToRegistry({ rootDir, name, description, skillPath }) {
  const { data, registryPath } = await loadRegistry(rootDir);
  if (data.skills.some((s) => s.name === name)) {
    throw new Error(`Skill already exists in registry: ${name}`);
  }
  data.skills.push({ name, description, path: skillPath });
  data.skills.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(registryPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function hasSkillDir(rootDir, name) {
  const dirPath = path.join(rootDir, 'skills', name);
  return existsSync(dirPath);
}
