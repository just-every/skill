import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import {
  resolveAutoDriveHome,
  ensureDir,
  readJsonSafe,
  writeJson,
  readJsonl,
  writeJsonl,
  appendJsonl,
  stripAnsi,
  parseJsonFromText,
  loadPromptTemplates,
  formatHistory,
  pickEnvValue,
  runModelPrompt,
  toBool,
  parseNumber,
  findSessionFileById,
  findLatestSessionForCwd,
  extractMessagesFromSessionFile,
} from "./auto_drive_lib.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONFIG = {
  maxTurns: 20,
  observerCadence: 5,
  agentsEnabled: true,
  verifyEnabled: true,
  historyTail: 14,
  nativeAgents: true,
};

function resolveSkillDir() {
  if (process.env.SKILL_DIR && process.env.SKILL_DIR.trim()) {
    return process.env.SKILL_DIR.trim();
  }
  return path.resolve(__dirname, "..");
}

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === "--goal") {
      args.goal = argv[i + 1];
      i += 1;
    } else if (part === "--id") {
      args.id = argv[i + 1];
      i += 1;
    } else if (part === "--plan") {
      args.plan = argv[i + 1];
      i += 1;
    } else if (part === "--summary") {
      args.summary = argv[i + 1];
      i += 1;
    } else if (part === "--model") {
      args.model = argv[i + 1];
      i += 1;
    } else if (part === "--help") {
      args.help = true;
    } else if (part.startsWith("-")) {
      continue;
    } else {
      args.positional.push(part);
    }
  }
  if (!args.goal && args.positional.length > 0) {
    args.goal = args.positional.join(" ");
  }
  return args;
}

function mergeConfig(base, overlay) {
  const next = Object.assign({}, base);
  if (!overlay) {
    return next;
  }
  for (const key of Object.keys(overlay)) {
    if (overlay[key] !== undefined && overlay[key] !== null) {
      next[key] = overlay[key];
    }
  }
  return next;
}

function loadConfig(autoHome) {
  const fileConfig = readJsonSafe(path.join(autoHome, "config.json")) || {};
  const envConfig = {
    maxTurns: parseNumber(process.env.AUTO_DRIVE_MAX_TURNS, undefined),
    observerCadence: parseNumber(process.env.AUTO_DRIVE_OBSERVER_CADENCE, undefined),
    agentsEnabled: process.env.AUTO_DRIVE_AGENTS_ENABLED,
    verifyEnabled: process.env.AUTO_DRIVE_VERIFY_ENABLED,
    historyTail: parseNumber(process.env.AUTO_DRIVE_HISTORY_TAIL, undefined),
    nativeAgents: process.env.AUTO_DRIVE_NATIVE_AGENTS,
  };

  let merged = mergeConfig(DEFAULT_CONFIG, fileConfig);
  merged = mergeConfig(merged, envConfig);

  merged.maxTurns = parseNumber(merged.maxTurns, DEFAULT_CONFIG.maxTurns);
  merged.observerCadence = parseNumber(merged.observerCadence, DEFAULT_CONFIG.observerCadence);
  merged.historyTail = parseNumber(merged.historyTail, DEFAULT_CONFIG.historyTail);
  merged.agentsEnabled = toBool(merged.agentsEnabled, DEFAULT_CONFIG.agentsEnabled);
  merged.verifyEnabled = toBool(merged.verifyEnabled, DEFAULT_CONFIG.verifyEnabled);
  merged.nativeAgents = toBool(merged.nativeAgents, DEFAULT_CONFIG.nativeAgents);

  return merged;
}

function buildSessionId() {
  const bytes = crypto.randomBytes(16).toString("hex");
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-${bytes.slice(12, 16)}-${bytes.slice(16, 20)}`;
}

function sessionDir(autoHome, id) {
  return path.join(autoHome, "runs", id);
}

function sessionMetaPath(autoHome, id) {
  return path.join(sessionDir(autoHome, id), "session.json");
}

function sessionHistoryPath(autoHome, id) {
  return path.join(sessionDir(autoHome, id), "history.jsonl");
}

function sessionEventsPath(autoHome, id) {
  return path.join(sessionDir(autoHome, id), "events.jsonl");
}

function loadSession(autoHome, id) {
  const meta = readJsonSafe(sessionMetaPath(autoHome, id));
  return meta;
}

function saveSession(autoHome, session) {
  ensureDir(sessionDir(autoHome, session.id));
  session.updated_at = new Date().toISOString();
  writeJson(sessionMetaPath(autoHome, session.id), session);
}

function formatEnvSummary() {
  const cwd = process.cwd();
  let gitBranch = "<unknown>";
  let gitStatus = "<unavailable>";
  try {
    gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
    gitStatus = execSync("git status --short", { encoding: "utf8" }).trim() || "clean";
  } catch (err) {
    gitBranch = "<not a git repo>";
    gitStatus = "n/a";
  }
  return `cwd: ${cwd}\nbranch: ${gitBranch}\nstatus: ${gitStatus}`;
}

function normalizeDecision(decision) {
  if (!decision || typeof decision !== "object") {
    return null;
  }
  const status = decision.finish_status;
  if (!["continue", "finish_success", "finish_failed"].includes(status)) {
    return null;
  }
  return {
    finish_status: status,
    status_title: decision.status_title || null,
    status_sent_to_user: decision.status_sent_to_user || null,
    prompt_sent_to_cli: decision.prompt_sent_to_cli || null,
    agents: decision.agents || null,
  };
}

function buildNativeAgentsBlock(decision) {
  if (!decision.agents || !Array.isArray(decision.agents.list)) {
    return "";
  }
  const timing = decision.agents.timing || "blocking";
  const lines = [];
  lines.push("<agents>");
  lines.push("Please use agents to help you complete this task.");
  for (const agent of decision.agents.list) {
    const prompt = String(agent.prompt || "").trim().replace(/\n/g, " ").replace(/"/g, "\\\"");
    const write = agent.write ? "true" : "false";
    lines.push("");
    lines.push(`prompt: \"${prompt}\" (write: ${write})`);
    if (agent.context) {
      lines.push(`context: ${String(agent.context).replace(/\n/g, " ")}`);
    }
    if (agent.models && agent.models.length > 0) {
      lines.push(`models: ${agent.models.join(", ")}`);
    }
  }
  lines.push("");
  if (timing === "parallel") {
    lines.push("Timing: parallel. Continue the main task while agents run. Call agent.wait when ready to merge.");
  } else {
    lines.push("Timing: blocking. Launch agents first, then call agent.wait before continuing.");
  }
  lines.push("</agents>");
  return lines.join("\n");
}

function buildExecutorPrompt(decision, config) {
  let prompt = decision.prompt_sent_to_cli || "";
  if (!prompt.trim()) {
    return "";
  }
  if (config.agentsEnabled && config.nativeAgents && decision.agents && Array.isArray(decision.agents.list)) {
    const block = buildNativeAgentsBlock(decision);
    if (block) {
      prompt = `${prompt}\n\n${block}`;
    }
  }
  return prompt.trim();
}

async function requestDecision({
  templates,
  schemaText,
  goal,
  envSummary,
  observerNote,
  autoAgentsText,
  history,
  historyTail,
  model,
}) {
  const template = templates["Coordinator"];
  if (!template) {
    throw new Error("Missing Coordinator template");
  }

  const historyText = formatHistory(history, historyTail);
  const prompt = template
    .replace("{{GOAL}}", goal)
    .replace("{{ENV}}", envSummary)
    .replace("{{OBSERVER}}", observerNote || "none")
    .replace("{{AUTO_AGENTS}}", autoAgentsText || "none")
    .replace("{{HISTORY}}", historyText)
    .replace("{{SCHEMA}}", schemaText);

  const cliCommand = pickEnvValue("AUTO_DRIVE_CLI", "codex");
  const cliArgs = pickEnvValue("AUTO_DRIVE_CLI_ARGS", "exec").split(" ").filter(Boolean);
  const outputSchemaMode = pickEnvValue("AUTO_DRIVE_OUTPUT_SCHEMA", "auto");
  const promptMode = pickEnvValue("AUTO_DRIVE_PROMPT_MODE", "arg");
  const promptFlag = pickEnvValue("AUTO_DRIVE_PROMPT_FLAG", "");
  const schemaFlag = pickEnvValue("AUTO_DRIVE_OUTPUT_SCHEMA_FLAG", "--output-schema");

  const result = await runModelPrompt({
    prompt,
    schemaPath: path.join(__dirname, "../references/decision-schema.json"),
    outputSchemaMode,
    model: model || null,
    cliCommand,
    cliArgs,
    promptMode,
    promptFlag: promptFlag || null,
    schemaFlag,
    cwd: process.cwd(),
    env: process.env,
  });

  const stdout = stripAnsi(result.stdout || "");
  const stderr = stripAnsi(result.stderr || "");
  const parsed = parseJsonFromText(stdout);
  const normalized = normalizeDecision(parsed);
  if (normalized) {
    return { decision: normalized, raw: stdout, stderr, code: result.code };
  }

  return { decision: null, raw: stdout, stderr, code: result.code };
}

async function runObserver({ templates, history, historyTail, model }) {
  const template = templates["Observer"];
  if (!template) {
    return null;
  }
  const historyText = formatHistory(history, historyTail);
  const prompt = template.replace("{{HISTORY}}", historyText);

  const cliCommand = pickEnvValue("AUTO_DRIVE_CLI", "codex");
  const cliArgs = pickEnvValue("AUTO_DRIVE_CLI_ARGS", "exec").split(" ").filter(Boolean);
  const promptMode = pickEnvValue("AUTO_DRIVE_PROMPT_MODE", "arg");
  const promptFlag = pickEnvValue("AUTO_DRIVE_PROMPT_FLAG", "");

  const result = await runModelPrompt({
    prompt,
    schemaPath: null,
    outputSchemaMode: "never",
    model: model || null,
    cliCommand,
    cliArgs,
    promptMode,
    promptFlag: promptFlag || null,
    schemaFlag: "",
    cwd: process.cwd(),
    env: process.env,
  });

  const stdout = stripAnsi(result.stdout || "").trim();
  if (!stdout || stdout.toLowerCase() === "none") {
    return null;
  }
  return stdout;
}

async function runVerifier({ goal, historyPath }) {
  const verifierScript = path.join(__dirname, "auto_drive_verify.js");
  const node = process.execPath;
  const result = await runModelPrompt({
    prompt: "",
    schemaPath: null,
    outputSchemaMode: "never",
    model: null,
    cliCommand: node,
    cliArgs: [verifierScript, "--goal", goal, "--history", historyPath],
    promptMode: "arg",
    promptFlag: null,
    schemaFlag: "",
    cwd: process.cwd(),
    env: process.env,
  });

  const stdout = stripAnsi(result.stdout || "").trim();
  const parsed = parseJsonFromText(stdout);
  if (!parsed || typeof parsed.complete !== "boolean") {
    return { complete: false, explanation: "Verifier failed to return valid JSON." };
  }
  return {
    complete: Boolean(parsed.complete),
    explanation: String(parsed.explanation || "").trim(),
  };
}

function composeHistory(sessionMessages, session) {
  const history = [];
  if (Array.isArray(sessionMessages)) {
    history.push(...sessionMessages);
  }
  if (session.plan) {
    history.push({ role: "user", content: `Plan: ${session.plan}` });
  }
  if (Array.isArray(session.summaries)) {
    for (const summary of session.summaries) {
      history.push({ role: "user", content: `Work summary: ${summary}` });
    }
  }
  return history;
}

function printTaskPrompt(id, prompt) {
  const skillDir = resolveSkillDir();
  console.log("Your task is:");
  console.log(prompt);
  console.log("");
  console.log(
    `Execute \`node ${skillDir}/scripts/auto_drive.js --id ${id} --summary "Work completed since last call"\``
  );
}

async function handleDecisionLoop({
  autoHome,
  session,
  config,
  modelOverride,
  templates,
  schemaText,
}) {
  if ((session.turns_completed || 0) >= config.maxTurns) {
    session.status = "failed";
    session.last_error = `Max turns reached (${config.maxTurns}).`;
    saveSession(autoHome, session);
    console.log("Auto Drive Failed");
    console.log(session.last_error);
    return;
  }
  const envSummary = formatEnvSummary();
  const autoAgentsPath = path.join(process.cwd(), "AUTO_AGENTS.md");
  const autoAgentsText = fs.existsSync(autoAgentsPath) ? fs.readFileSync(autoAgentsPath, "utf8").trim() : "";
  const historyPath = sessionHistoryPath(autoHome, session.id);
  const eventsPath = sessionEventsPath(autoHome, session.id);

  const sessionFile = session.session_file || findSessionFileById(session.id);
  if (sessionFile && sessionFile !== session.session_file) {
    session.session_file = sessionFile;
  }

  const sinceMs = session.started_at_ms ? Number(session.started_at_ms) : undefined;
  const sessionMessages = extractMessagesFromSessionFile(sessionFile, sinceMs).slice(-config.historyTail * 2);
  const history = composeHistory(sessionMessages, session);
  writeJsonl(historyPath, history);

  let observerNote = null;
  if (config.observerCadence > 0) {
    const lastTurn = session.turns_completed || 0;
    if (lastTurn > 0 && lastTurn % config.observerCadence === 0) {
      observerNote = await runObserver({
        templates,
        history,
        historyTail: config.historyTail,
        model: modelOverride,
      });
      if (observerNote) {
        appendJsonl(eventsPath, { type: "observer", note: observerNote, ts: Date.now() });
      }
    }
  }

  let attempts = 0;
  let decisionResult = null;
  let lastFailure = null;
  while (attempts < 2 && !decisionResult) {
    const result = await requestDecision({
      templates,
      schemaText,
      goal: session.goal,
      envSummary,
      observerNote,
      autoAgentsText,
      history,
      historyTail: config.historyTail,
      model: modelOverride,
    });
    if (result.decision) {
      decisionResult = result.decision;
      appendJsonl(eventsPath, { type: "decision", decision: result.decision, ts: Date.now() });
      break;
    }
    lastFailure = result;
    attempts += 1;
  }

  if (!decisionResult) {
    session.status = "failed";
    const rawSnippet = lastFailure && lastFailure.raw ? lastFailure.raw.slice(0, 800) : "";
    const errSnippet = lastFailure && lastFailure.stderr ? lastFailure.stderr.slice(0, 800) : "";
    const parts = ["Coordinator failed to return valid JSON."];
    if (errSnippet) {
      parts.push(`stderr: ${errSnippet}`);
    }
    if (rawSnippet) {
      parts.push(`stdout: ${rawSnippet}`);
    }
    session.last_error = parts.join("\n");
    saveSession(autoHome, session);
    console.log("Auto Drive Failed");
    console.log(session.last_error);
    return;
  }

  session.last_decision = decisionResult;
  session.turns_completed = (session.turns_completed || 0) + 1;

  if (decisionResult.finish_status === "finish_failed") {
    session.status = "failed";
    saveSession(autoHome, session);
    console.log("Auto Drive Failed");
    if (decisionResult.status_sent_to_user) {
      console.log(decisionResult.status_sent_to_user);
    }
    return;
  }

  if (decisionResult.finish_status === "finish_success") {
    if (config.verifyEnabled) {
      const verify = await runVerifier({
        goal: session.goal,
        historyPath,
      });
      appendJsonl(eventsPath, { type: "verify", result: verify, ts: Date.now() });
      if (verify.complete) {
        session.status = "completed";
        session.verification = verify;
        saveSession(autoHome, session);
        console.log("Auto Drive Complete");
        if (verify.explanation) {
          console.log(verify.explanation);
        }
        return;
      }
      session.summaries = session.summaries || [];
      session.summaries.push(`Verifier: ${verify.explanation || "Goal not complete."}`);
      saveSession(autoHome, session);
      return handleDecisionLoop({ autoHome, session, config, modelOverride, templates, schemaText });
    }

    session.status = "completed";
    saveSession(autoHome, session);
    console.log("Auto Drive Complete");
    if (decisionResult.status_sent_to_user) {
      console.log(decisionResult.status_sent_to_user);
    }
    return;
  }

  if (decisionResult.finish_status === "continue") {
    const prompt = buildExecutorPrompt(decisionResult, config);
    if (!prompt) {
      session.status = "failed";
      session.last_error = "Coordinator returned continue without a prompt.";
      saveSession(autoHome, session);
      console.log("Auto Drive Failed");
      console.log(session.last_error);
      return;
    }
    session.status = "awaiting_summary";
    session.last_prompt = prompt;
    saveSession(autoHome, session);
    printTaskPrompt(session.id, prompt);
    return;
  }

  session.status = "failed";
  session.last_error = `Unexpected finish_status: ${decisionResult.finish_status}`;
  saveSession(autoHome, session);
  console.log("Auto Drive Failed");
  console.log(session.last_error);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node auto_drive.js --goal \"...\" | --id <id> [--plan ... | --summary ...]");
    process.exit(0);
  }

  const autoHome = resolveAutoDriveHome();
  ensureDir(autoHome);
  const config = loadConfig(autoHome);
  const templates = loadPromptTemplates(path.join(__dirname, "../references/prompt-templates.md"));
  const schemaText = fs.readFileSync(path.join(__dirname, "../references/decision-schema.json"), "utf8").trim();
  const modelOverride = args.model || pickEnvValue("AUTO_DRIVE_MODEL", "");

  if (args.goal && !args.id && !args.plan && !args.summary) {
    const currentSession = findLatestSessionForCwd(process.cwd());
    const id = buildSessionId();
    const skillDir = resolveSkillDir();
    const session = {
      id,
      goal: args.goal.trim(),
      status: "awaiting_plan",
      plan: null,
      summaries: [],
      last_prompt: null,
      last_decision: null,
      turns_completed: 0,
      started_at_ms: Date.now(),
      session_file: currentSession ? currentSession.file : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveSession(autoHome, session);
    console.log("Auto Drive Session Created");
    console.log(
      `Call \`node ${skillDir}/scripts/auto_drive.js --id ${id}\` repeatedly until it says you are complete`
    );
    return;
  }

  if (!args.id) {
    console.error("auto_drive: missing --id (or use --goal to create a session)");
    process.exit(2);
  }

  const session = loadSession(autoHome, args.id);
  if (!session) {
    console.error("auto_drive: session not found");
    process.exit(2);
  }

  if (args.plan) {
    session.plan = args.plan.trim();
    session.status = "planning_complete";
    saveSession(autoHome, session);
    await handleDecisionLoop({ autoHome, session, config, modelOverride, templates, schemaText });
    return;
  }

  if (args.summary) {
    session.summaries = session.summaries || [];
    session.summaries.push(args.summary.trim());
    session.status = "summary_received";
    saveSession(autoHome, session);
    await handleDecisionLoop({ autoHome, session, config, modelOverride, templates, schemaText });
    return;
  }

  if (session.status === "awaiting_plan") {
    console.log("Your task is to plan how to reach the goal for this session.");
    console.log(`Goal: ${session.goal}`);
    console.log("");
    console.log(
      `Execute \`node ${resolveSkillDir()}/scripts/auto_drive.js --id ${session.id} --plan "Your plan here"\``
    );
    return;
  }

  if (session.status === "awaiting_summary" && session.last_prompt) {
    printTaskPrompt(session.id, session.last_prompt);
    return;
  }

  if (session.status === "completed") {
    console.log("Auto Drive Complete");
    if (session.verification && session.verification.explanation) {
      console.log(session.verification.explanation);
    }
    return;
  }

  if (session.status === "failed") {
    console.log("Auto Drive Failed");
    if (session.last_error) {
      console.log(session.last_error);
    }
    return;
  }

  console.log("Auto Drive is waiting for an update.");
  console.log(
    `Call \`node ${resolveSkillDir()}/scripts/auto_drive.js --id ${session.id}\` for the next instruction.`
  );
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(2);
});
