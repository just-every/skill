import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { detectClients, normalizeClientList, resolveSkillDir, resolveTargetClients } from './clients.js';
import { loadKits, loadRegistry, resolveSkills } from './registry.js';
import { removeDir, syncDir } from './fs-utils.js';

export async function installSkills(options) {
  const rootDir = options.rootDir;
  const kitName = options.kit ?? 'starter';
  const skillNames = options.skills ?? [];
  const { data: registry } = await loadRegistry(rootDir);
  const { data: kits } = await loadKits(rootDir);
  const selectedSkills = resolveSkills({ registry, kits, kitName, skillNames });

  const detections = detectClients(options.homeDir);
  const selection = normalizeClientList(options.client);
  const targetClients = resolveTargetClients({ mode: selection.mode, clients: selection.clients, detections });

  const changed = [];
  const skipped = [];
  const notes = [];

  const externalSkills = selectedSkills.filter((s) => s.installer?.runner);
  const localSkills = selectedSkills.filter((s) => !s.installer?.runner);

  for (const client of targetClients) {
    const skillRoot = resolveSkillDir(client, options.homeDir);
    if (!skillRoot) {
      notes.push(`Skipping ${client}: does not support skills.`);
      continue;
    }
    for (const skill of localSkills) {
      if (!skill.path) {
        notes.push(`Skipping ${skill.name}: no local path configured.`);
        continue;
      }
      const srcDir = path.join(rootDir, path.dirname(skill.path));
      const destDir = path.join(skillRoot, skill.name);
      await syncDir({
        srcDir,
        destDir,
        dryRun: options.dryRun,
        force: options.force,
        changed,
        skipped,
        notes,
      });
    }
  }

  await runExternalSkillInstalls({
    skills: externalSkills,
    options,
    action: 'install',
    notes,
  });

  return { changed, skipped, notes, selectedSkills, targetClients };
}

export async function removeSkills(options) {
  const rootDir = options.rootDir;
  const kitName = options.kit ?? 'starter';
  const skillNames = options.skills ?? [];
  const { data: registry } = await loadRegistry(rootDir);
  const { data: kits } = await loadKits(rootDir);
  const selectedSkills = resolveSkills({ registry, kits, kitName, skillNames });

  const detections = detectClients(options.homeDir);
  const selection = normalizeClientList(options.client);
  const targetClients = resolveTargetClients({ mode: selection.mode, clients: selection.clients, detections });

  const changed = [];
  const skipped = [];
  const notes = [];

  const externalSkills = selectedSkills.filter((s) => s.installer?.runner);
  const localSkills = selectedSkills.filter((s) => !s.installer?.runner);

  for (const client of targetClients) {
    const skillRoot = resolveSkillDir(client, options.homeDir);
    if (!skillRoot) {
      notes.push(`Skipping ${client}: does not support skills.`);
      continue;
    }
    for (const skill of localSkills) {
      const destDir = path.join(skillRoot, skill.name);
      await removeDir(destDir, options.dryRun, changed, skipped, notes);
    }
  }

  await runExternalSkillInstalls({
    skills: externalSkills,
    options,
    action: 'remove',
    notes,
  });

  return { changed, skipped, notes, selectedSkills, targetClients };
}

function buildInstallerArgs(installer, options, action) {
  const baseArgs = action === 'remove' ? installer.removeArgs || installer.args : installer.args;
  const args = Array.isArray(baseArgs) ? [...baseArgs] : [];

  if (options.client && options.client !== 'auto') {
    args.push('--client', String(options.client));
  }
  if (options.yes) args.push('--yes');
  if (options.skipAuth) args.push('--skip-auth');
  if (options.noPath) args.push('--no-path');
  if (options.launcher) args.push('--launcher', options.launcher);
  if (options.dryRun) args.push('--dry-run');

  return args;
}

function shouldSkipExternalSkill(skill, options) {
  if (!skill) return false;
  if ((skill.name === 'every-design' || skill.name === 'every_design') && options.noEveryDesign) return true;
  return false;
}

async function runExternalSkillInstalls({ skills, options, action, notes }) {
  if (!skills.length) return;
  for (const skill of skills) {
    if (shouldSkipExternalSkill(skill, options)) {
      notes.push(`Skipping ${skill.name}: external installer disabled.`);
      continue;
    }
    const installer = skill.installer;
    if (!installer?.runner || !installer?.args) {
      notes.push(`Skipping ${skill.name}: external installer not configured.`);
      continue;
    }
    const args = buildInstallerArgs(installer, options, action);
    if (options.dryRun) {
      notes.push(`[dry-run] Would run: ${installer.runner} ${args.join(' ')}`);
      continue;
    }
    const result = spawnSync(installer.runner, args, { stdio: 'inherit' });
    if (result.error) {
      notes.push(`${skill.name} installer failed: ${result.error.message || result.error}`);
      continue;
    }
    if (typeof result.status === 'number' && result.status !== 0) {
      notes.push(`${skill.name} installer exited with status ${result.status}`);
      continue;
    }
    notes.push(`${skill.name} installer completed.`);
  }
}

export function defaultHomeDir() {
  return os.homedir();
}
