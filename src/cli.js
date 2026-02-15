#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

import { installSkills, removeSkills, defaultHomeDir } from './install.js';
import { addSkillToRegistry, hasSkillDir, loadKits, loadRegistry } from './registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const flags = {};
  const command = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token === '-h' || token === '--help') {
      flags.help = true;
      continue;
    }
    if (token.startsWith('--no-')) {
      const name = token.slice(5);
      if (name) flags[name] = false;
      continue;
    }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      const name = (eq === -1 ? token.slice(2) : token.slice(2, eq)).trim();
      if (!name) continue;
      if (eq !== -1) {
        flags[name] = token.slice(eq + 1);
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags[name] = next;
        i += 1;
      } else {
        flags[name] = true;
      }
      continue;
    }
    command.push(token);
  }
  return { command, flags };
}

function printHelp() {
  console.error('Usage:');
  console.error('  npx -y @just-every/skill@latest [command] [options]');
  console.error('  every-skill [command] [options]');
  console.error('');
  console.error('Commands:');
  console.error('  install (default)       Install skills from a kit or explicit list');
  console.error('  remove                  Remove skills');
  console.error('  list                    List available skills and kits');
  console.error('  create                  Create a new skill scaffold');
  console.error('');
  console.error('Options:');
  console.error('  --kit <name>            Skill kit to install (default: starter)');
  console.error('  --kit none              Skip kits');
  console.error('  --skills a,b,c          Explicit skill names (added to kit unless kit=none)');
  console.error('  --client <auto|all|code|codex|claude-desktop|claude-code|cursor|gemini|qwen>');
  console.error('  --yes                   Non-interactive mode');
  console.error('  --dry-run               Print changes without writing');
  console.error('  --force                 Overwrite existing skill files');
  console.error('  --skip-auth             Forward to Every Design installer');
  console.error('  --no-path               Forward to Every Design installer');
  console.error('  --launcher <npx|local>  Forward to Every Design installer');
  console.error('  --no-every-design       Skip running the Every Design installer');
  console.error('  --no-design             Alias for --no-every-design');
  console.error('  --version               Print version');
  console.error('  --help, -h              Show help');
}

function parseCsv(value) {
  if (!value || value === true) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

async function promptConfirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(message)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function cmdList() {
  const { data: registry } = await loadRegistry(ROOT_DIR);
  const { data: kits } = await loadKits(ROOT_DIR);
  console.log('Skills:');
  for (const skill of registry.skills) {
    console.log(`- ${skill.name}: ${skill.description}`);
  }
  console.log('');
  console.log('Kits:');
  for (const [name, skills] of Object.entries(kits.kits)) {
    console.log(`- ${name}: ${skills.join(', ')}`);
  }
}

async function cmdCreate(flags, args) {
  const name = args[0];
  if (!name) throw new Error('Skill name is required.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error('Skill name must be kebab-case (letters, numbers, hyphens).');
  }
  if (hasSkillDir(ROOT_DIR, name)) {
    throw new Error(`Skill already exists at skills/${name}`);
  }

  let description = flags.description;
  if (!description) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      description = (await rl.question('Description: ')).trim();
    } finally {
      rl.close();
    }
  }
  if (!description) throw new Error('Description is required.');

  const templatePath = path.join(ROOT_DIR, 'templates', 'skill', 'SKILL.md');
  const raw = await readFile(templatePath, 'utf8');
  const title = name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const contents = raw
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{description\}\}/g, description)
    .replace(/\{\{title\}\}/g, title);

  const skillDir = path.join(ROOT_DIR, 'skills', name);
  const skillPath = path.join(skillDir, 'SKILL.md');
  await fsMkdir(skillDir);
  await writeText(skillPath, contents);

  await addSkillToRegistry({
    rootDir: ROOT_DIR,
    name,
    description,
    skillPath: `skills/${name}/SKILL.md`,
  });

  console.log(`Created skills/${name}/SKILL.md and updated registry.`);
}

async function cmdInstall(flags) {
  const kit = flags.kit || 'starter';
  const skills = parseCsv(flags.skills);
  const client = flags.client || 'auto';
  const yes = Boolean(flags.yes);
  const dryRun = Boolean(flags['dry-run']);
  const force = Boolean(flags.force);
  const noEveryDesign = flags['every-design'] === false || flags.design === false || flags['no-every-design'] === true;
  const skipAuth = Boolean(flags['skip-auth']) || flags.auth === false;
  const noPath = flags.path === false || Boolean(flags['no-path']);
  const launcher = typeof flags.launcher === 'string' ? flags.launcher : undefined;

  if (!yes) {
    const proceed = await promptConfirm(`Install kit=${kit} skills=${skills.join(',') || '(none)'} client=${client}? [y/N] `);
    if (!proceed) return;
  }

  const result = await installSkills({
    rootDir: ROOT_DIR,
    kit,
    skills,
    client,
    yes,
    dryRun,
    force,
    skipAuth,
    noPath,
    launcher,
    noEveryDesign,
    homeDir: defaultHomeDir(),
  });

  printResult('Install', result);
}

async function cmdRemove(flags) {
  const kit = flags.kit || 'starter';
  const skills = parseCsv(flags.skills);
  const client = flags.client || 'auto';
  const yes = Boolean(flags.yes);
  const dryRun = Boolean(flags['dry-run']);
  const noEveryDesign = flags['every-design'] === false || flags.design === false || flags['no-every-design'] === true;
  const skipAuth = Boolean(flags['skip-auth']) || flags.auth === false;
  const noPath = flags.path === false || Boolean(flags['no-path']);
  const launcher = typeof flags.launcher === 'string' ? flags.launcher : undefined;

  if (!yes) {
    const proceed = await promptConfirm(`Remove kit=${kit} skills=${skills.join(',') || '(none)'} client=${client}? [y/N] `);
    if (!proceed) return;
  }

  const result = await removeSkills({
    rootDir: ROOT_DIR,
    kit,
    skills,
    client,
    yes,
    dryRun,
    skipAuth,
    noPath,
    launcher,
    noEveryDesign,
    homeDir: defaultHomeDir(),
  });

  printResult('Remove', result);
}

function printResult(label, result) {
  console.log(`${label} complete.`);
  if (result.selectedSkills?.length) {
    console.log(`Skills: ${result.selectedSkills.map((s) => s.name).join(', ')}`);
  }
  if (result.targetClients?.length) {
    console.log(`Clients: ${result.targetClients.join(', ')}`);
  }
  if (result.changed?.length) {
    console.log('Changed:');
    for (const item of result.changed) console.log(`- ${item}`);
  }
  if (result.skipped?.length) {
    console.log('Skipped:');
    for (const item of result.skipped) console.log(`- ${item}`);
  }
  if (result.notes?.length) {
    console.log('Notes:');
    for (const note of result.notes) console.log(`- ${note}`);
  }
}

async function fsMkdir(dirPath) {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

async function writeText(filePath, contents) {
  await writeFile(filePath, contents, 'utf8');
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }
  if (flags.version) {
    const pkg = JSON.parse(await readFile(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    console.log(pkg.version || '0.0.0');
    return;
  }

  const cmd = command[0] || 'install';
  if (cmd === 'list') {
    await cmdList();
    return;
  }
  if (cmd === 'create') {
    await cmdCreate(flags, command.slice(1));
    return;
  }
  if (cmd === 'install') {
    await cmdInstall(flags);
    return;
  }
  if (cmd === 'remove') {
    await cmdRemove(flags);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exitCode = 1;
});
