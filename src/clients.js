import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const CLIENTS = [
  'code',
  'codex',
  'claude-desktop',
  'claude-code',
  'cursor',
  'gemini',
  'qwen',
];

export function which(program) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(cmd, [program], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const out = (result.stdout || '').trim();
  if (!out) return null;
  return out.split(/\r?\n/)[0]?.trim() || null;
}

export function resolveClaudeDesktopConfigPath(homeDir) {
  if (process.platform === 'darwin') {
    return path.join(
      homeDir,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    );
  }
  const xdg = (process.env.XDG_CONFIG_HOME || '').trim();
  const base = xdg || path.join(homeDir, '.config');
  return path.join(base, 'Claude', 'claude_desktop_config.json');
}

export function detectClients(homeDir = os.homedir()) {
  const entries = [];

  const codeHome = (process.env.CODE_HOME || '').trim() || path.join(homeDir, '.code');
  const codexDir = path.join(homeDir, '.codex');
  const cursorDir = path.join(homeDir, '.cursor');
  const geminiDir = path.join(homeDir, '.gemini');
  const qwenDir = path.join(homeDir, '.qwen');

  const codeInstalled = existsSync(codeHome);
  entries.push({
    client: 'code',
    label: 'Every Code',
    installed: codeInstalled,
    supportsMcp: true,
    supportsSkill: true,
    details: codeInstalled ? [`found ${codeHome}`] : [],
  });

  const codexInstalled = existsSync(codexDir) || Boolean(which('codex'));
  entries.push({
    client: 'codex',
    label: 'OpenAI Codex',
    installed: codexInstalled,
    supportsMcp: true,
    supportsSkill: true,
    details: [
      ...(existsSync(codexDir) ? [`found ${codexDir}`] : []),
      ...(which('codex') ? ['found codex on PATH'] : []),
    ],
  });

  const claudeDesktopPath = resolveClaudeDesktopConfigPath(homeDir);
  const claudeDesktopInstalled = process.platform === 'darwin'
    ? existsSync(path.dirname(claudeDesktopPath))
    : existsSync(claudeDesktopPath);
  entries.push({
    client: 'claude-desktop',
    label: 'Claude Desktop',
    installed: claudeDesktopInstalled,
    supportsMcp: true,
    supportsSkill: false,
    details: claudeDesktopInstalled ? [`will edit ${claudeDesktopPath}`] : [],
  });

  const cursorInstalled = existsSync(cursorDir);
  entries.push({
    client: 'cursor',
    label: 'Cursor',
    installed: cursorInstalled,
    supportsMcp: true,
    supportsSkill: false,
    details: cursorInstalled ? [`found ${cursorDir}`] : [],
  });

  const geminiInstalled = existsSync(geminiDir) || Boolean(which('gemini'));
  entries.push({
    client: 'gemini',
    label: 'Gemini CLI',
    installed: geminiInstalled,
    supportsMcp: true,
    supportsSkill: false,
    details: [
      ...(existsSync(geminiDir) ? [`found ${geminiDir}`] : []),
      ...(which('gemini') ? ['found gemini on PATH'] : []),
    ],
  });

  const qwenInstalled = existsSync(qwenDir) || Boolean(which('qwen'));
  entries.push({
    client: 'qwen',
    label: 'Qwen Code',
    installed: qwenInstalled,
    supportsMcp: true,
    supportsSkill: false,
    details: [
      ...(existsSync(qwenDir) ? [`found ${qwenDir}`] : []),
      ...(which('qwen') ? ['found qwen on PATH'] : []),
    ],
  });

  const claudePath = which('claude');
  const claudeCodeInstalled = Boolean(claudePath) || existsSync(path.join(homeDir, '.claude'));
  const claudeSupportsMcp = (() => {
    if (!claudePath) return false;
    const res = spawnSync('claude', ['mcp', '--help'], { encoding: 'utf8' });
    return res.status === 0;
  })();
  const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
  const claudeSupportsSkill = claudeCodeInstalled;
  entries.push({
    client: 'claude-code',
    label: 'Claude Code (CLI)',
    installed: claudeCodeInstalled,
    supportsMcp: claudeSupportsMcp,
    supportsSkill: claudeSupportsSkill,
    details: [
      ...(claudePath ? [`found ${claudePath}`] : []),
      ...(existsSync(path.join(homeDir, '.claude')) ? [`found ${path.join(homeDir, '.claude')}`] : []),
      ...(claudeSupportsSkill ? [`will write ${claudeSkillsDir}`] : []),
      ...(claudePath && !claudeSupportsMcp ? ['claude mcp not available (will print manual instructions)'] : []),
    ],
  });

  return entries;
}

export function normalizeClientList(input) {
  if (!input) return { mode: 'auto', clients: [] };
  const raw = String(input).trim();
  if (!raw || raw === 'auto') return { mode: 'auto', clients: [] };
  if (raw === 'all') return { mode: 'all', clients: CLIENTS.slice() };
  const clients = raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  return { mode: 'explicit', clients };
}

export function resolveSkillDir(client, homeDir = os.homedir()) {
  const codeHome = (process.env.CODE_HOME || '').trim() || path.join(homeDir, '.code');
  if (client === 'code') return path.join(codeHome, 'skills');
  if (client === 'codex') return path.join(homeDir, '.codex', 'skills');
  if (client === 'claude-code') return path.join(homeDir, '.claude', 'skills');
  return null;
}

export function resolveTargetClients({ mode, clients, detections }) {
  if (mode === 'auto') {
    return detections.filter((c) => c.installed).map((c) => c.client);
  }
  if (mode === 'all') {
    return CLIENTS.slice();
  }
  return clients;
}
