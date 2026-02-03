import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  resolveAutoDriveHome,
  readJsonl,
  writeJsonl,
  formatHistory,
  loadPromptTemplates,
  pickEnvValue,
  runModelPrompt,
  stripAnsi,
  parseNumber,
} from "./auto_drive_lib.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === "--history") {
      args.history = argv[i + 1];
      i += 1;
    } else if (part === "--tail") {
      args.tail = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function fallbackSummary(messages) {
  const lines = [];
  for (const item of messages.slice(0, 20)) {
    const role = item.role || "unknown";
    const content = typeof item.content === "string" ? item.content : JSON.stringify(item.content);
    lines.push(`[${role}] ${content.slice(0, 200)}`);
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const autoHome = resolveAutoDriveHome();
  const historyPath = args.history || path.join(autoHome, "history.jsonl");
  const tailCount = parseNumber(args.tail, 12);

  const history = readJsonl(historyPath);
  if (history.length <= tailCount + 1) {
    process.stdout.write("no_compaction");
    return;
  }

  const head = history[0];
  const tail = history.slice(-tailCount);
  const middle = history.slice(1, history.length - tailCount);

  const templatesPath = path.join(__dirname, "../references/prompt-templates.md");
  const templates = loadPromptTemplates(templatesPath);
  const template = templates["Compact"];
  if (!template) {
    console.error("auto_drive_compact: missing Compact template");
    process.exit(2);
  }

  const historyText = formatHistory(middle, middle.length);
  const prompt = template.replace("{{HISTORY}}", historyText);

  const cliCommand = pickEnvValue("AUTO_DRIVE_CLI", "codex");
  const cliArgs = pickEnvValue("AUTO_DRIVE_CLI_ARGS", "exec").split(" ").filter(Boolean);
  const promptMode = pickEnvValue("AUTO_DRIVE_PROMPT_MODE", "arg");
  const promptFlag = pickEnvValue("AUTO_DRIVE_PROMPT_FLAG", "");

  const result = await runModelPrompt({
    prompt,
    schemaPath: null,
    outputSchemaMode: "never",
    model: null,
    cliCommand,
    cliArgs,
    promptMode,
    promptFlag: promptFlag || null,
    schemaFlag: "",
    cwd: process.cwd(),
    env: process.env,
  });

  let summary = stripAnsi(result.stdout || "").trim();
  if (!summary) {
    summary = fallbackSummary(middle);
  }

  const compacted = [head, { role: "system", content: `Summary: ${summary}` }, ...tail];
  writeJsonl(historyPath, compacted);
  process.stdout.write("compacted");
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(2);
});
