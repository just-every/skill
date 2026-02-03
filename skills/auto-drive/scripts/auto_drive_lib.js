import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

const DEFAULT_CLI_TIMEOUT_MS = 180000;

export function resolveAutoDriveHome() {
  if (process.env.AUTO_DRIVE_HOME && process.env.AUTO_DRIVE_HOME.trim()) {
    return process.env.AUTO_DRIVE_HOME.trim();
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  const home = process.env.HOME || os.homedir();
  if (xdg && xdg.trim()) {
    return path.join(xdg.trim(), ".auto-drive");
  }
  return path.join(home, ".auto-drive");
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function writeJson(filePath, data) {
  const text = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, text);
}

export function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  const items = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch (err) {
      continue;
    }
  }
  return items;
}

export function writeJsonl(filePath, items) {
  const lines = items.map((item) => JSON.stringify(item));
  fs.writeFileSync(filePath, lines.join("\n") + (lines.length ? "\n" : ""));
}

export function appendJsonl(filePath, item) {
  const line = JSON.stringify(item);
  fs.appendFileSync(filePath, line + "\n");
}

export function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function parseJsonFromText(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const extracted = extractFirstJsonObject(trimmed);
    if (!extracted) {
      return null;
    }
    try {
      return JSON.parse(extracted);
    } catch (err2) {
      return null;
    }
  }
}

export function loadPromptTemplates(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  const templates = {};
  let current = null;
  let buffer = [];
  for (const line of lines) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      if (current) {
        templates[current] = buffer.join("\n").trim();
      }
      current = heading[1].trim();
      buffer = [];
      continue;
    }
    if (current) {
      buffer.push(line);
    }
  }
  if (current) {
    templates[current] = buffer.join("\n").trim();
  }
  return templates;
}

export function formatHistory(messages, limit) {
  const slice = limit > 0 ? messages.slice(-limit) : messages.slice();
  return slice
    .map((item) => {
      const role = item.role || "unknown";
      const content = typeof item.content === "string" ? item.content : JSON.stringify(item.content);
      return `[${role}] ${content}`;
    })
    .join("\n");
}

export function pickEnvValue(name, fallback) {
  if (process.env[name] && process.env[name].trim()) {
    return process.env[name].trim();
  }
  return fallback;
}

function isUnknownOptionError(stderr) {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("unknown option") ||
    lower.includes("unrecognized option") ||
    lower.includes("unknown argument") ||
    lower.includes("unexpected argument") ||
    lower.includes("invalid option")
  );
}

async function runCommand(command, args, options) {
  const cwd = options && options.cwd ? options.cwd : process.cwd();
  const env = options && options.env ? options.env : process.env;
  const input = options && options.input ? options.input : null;
  const timeoutMs = options && options.timeoutMs ? options.timeoutMs : null;

  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    let finished = false;
    let timeoutTimer = null;
    let killTimer = null;

    const finish = (code) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      if (killTimer) {
        clearTimeout(killTimer);
      }
      resolve({ code, stdout, stderr });
    };

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on("error", () => finish(1));
    child.on("close", (code) => finish(code));

    if (input && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }

    if (timeoutMs) {
      timeoutTimer = setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch (err) {
          // ignore
        }
        killTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch (err) {
            // ignore
          }
        }, 5000);
        stderr += "\n[auto-drive] command timed out";
        finish(124);
      }, timeoutMs);
    }
  });
}

export async function runModelPrompt({
  prompt,
  schemaPath,
  outputSchemaMode,
  model,
  cliCommand,
  cliArgs,
  promptMode,
  promptFlag,
  schemaFlag,
  cwd,
  env,
  timeoutMs,
}) {
  const args = [];
  if (Array.isArray(cliArgs) && cliArgs.length > 0) {
    args.push(...cliArgs);
  }
  if (model) {
    const flag = pickEnvValue("AUTO_DRIVE_MODEL_FLAG", "--model");
    args.push(flag, model);
  }

  const wantSchema = Boolean(schemaPath) && outputSchemaMode !== "never";
  let attemptedSchema = false;

  const buildArgsWithSchema = () => {
    const nextArgs = args.slice();
    if (wantSchema) {
      attemptedSchema = true;
      nextArgs.push(schemaFlag, schemaPath);
    }
    if (promptMode === "flag" && promptFlag) {
      nextArgs.push(promptFlag, prompt);
    } else if (promptMode === "arg") {
      nextArgs.push(prompt);
    }
    return nextArgs;
  };

  const buildArgsNoSchema = () => {
    const nextArgs = args.slice();
    if (promptMode === "flag" && promptFlag) {
      nextArgs.push(promptFlag, prompt);
    } else if (promptMode === "arg") {
      nextArgs.push(prompt);
    }
    return nextArgs;
  };

  const promptInput = promptMode === "stdin" ? prompt : null;
  const resolvedTimeoutMs =
    timeoutMs !== undefined && timeoutMs !== null
      ? timeoutMs
      : parseNumber(pickEnvValue("AUTO_DRIVE_CLI_TIMEOUT_MS", ""), DEFAULT_CLI_TIMEOUT_MS);

  let result = await runCommand(cliCommand, buildArgsWithSchema(), {
    cwd,
    env,
    input: promptInput,
    timeoutMs: resolvedTimeoutMs,
  });

  if (
    wantSchema &&
    outputSchemaMode === "auto" &&
    attemptedSchema &&
    result.code !== 0 &&
    isUnknownOptionError(result.stderr)
  ) {
    result = await runCommand(cliCommand, buildArgsNoSchema(), {
      cwd,
      env,
      input: promptInput,
      timeoutMs: resolvedTimeoutMs,
    });
  }

  return result;
}

export function toBool(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

export function parseNumber(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    return n;
  }
  return fallback;
}

function findCodexSessionFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const results = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(full);
      }
    }
  }
  return results;
}

function parseSessionMeta(filePath) {
  try {
    const firstLine = fs.readFileSync(filePath, "utf8").split("\n")[0];
    if (!firstLine) {
      return null;
    }
    const obj = JSON.parse(firstLine);
    if (!obj || obj.type !== "session_meta") {
      return null;
    }
    const payload = obj.payload || {};
    if (!payload.id) {
      return null;
    }
    return {
      id: payload.id,
      cwd: payload.cwd,
      timestamp: payload.timestamp || obj.timestamp,
    };
  } catch (err) {
    return null;
  }
}

export function findSessionFileById(sessionId) {
  const root = path.join(os.homedir(), ".codex", "sessions");
  const files = findCodexSessionFiles(root);
  for (const file of files) {
    const meta = parseSessionMeta(file);
    if (meta && meta.id === sessionId) {
      return file;
    }
  }
  return null;
}

export function findLatestSessionForCwd(cwd) {
  const root = path.join(os.homedir(), ".codex", "sessions");
  const files = findCodexSessionFiles(root);
  let best = null;
  let bestTime = 0;
  for (const file of files) {
    const meta = parseSessionMeta(file);
    if (!meta || !meta.cwd || meta.cwd !== cwd) {
      continue;
    }
    let t = 0;
    if (meta.timestamp) {
      const parsed = Date.parse(meta.timestamp);
      if (!Number.isNaN(parsed)) {
        t = parsed;
      }
    }
    if (!t) {
      try {
        t = fs.statSync(file).mtimeMs;
      } catch (err) {
        t = 0;
      }
    }
    if (!best || t > bestTime) {
      best = { id: meta.id, file, timestamp: t };
      bestTime = t;
    }
  }
  return best;
}

export function extractMessagesFromSessionFile(filePath, sinceMs) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const messages = [];
  for (const line of lines) {
    let obj = null;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      continue;
    }
    if (!obj || obj.type !== "response_item") {
      continue;
    }
    if (sinceMs) {
      const ts = Date.parse(obj.timestamp || "");
      if (!Number.isNaN(ts) && ts < sinceMs) {
        continue;
      }
    }
    const payload = obj.payload || {};
    if (payload.type !== "message") {
      continue;
    }
    const role = payload.role;
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    const contentItems = Array.isArray(payload.content) ? payload.content : [];
    let text = "";
    for (const item of contentItems) {
      if (typeof item.text === "string") {
        text += item.text;
      } else if (typeof item.input_text === "string") {
        text += item.input_text;
      }
    }
    if (text.trim()) {
      messages.push({ role, content: text.trim() });
    }
  }
  return messages;
}
