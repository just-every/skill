import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  resolveAutoDriveHome,
  readJsonl,
  formatHistory,
  loadPromptTemplates,
  parseJsonFromText,
  pickEnvValue,
  runModelPrompt,
  parseNumber,
  stripAnsi,
} from "./auto_drive_lib.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === "--goal") {
      args.goal = argv[i + 1];
      i += 1;
    } else if (part === "--history") {
      args.history = argv[i + 1];
      i += 1;
    } else if (part === "--history-tail") {
      args.historyTail = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const goal = args.goal || "";
  if (!goal.trim()) {
    console.error("auto_drive_verify: missing --goal");
    process.exit(2);
  }

  const autoHome = resolveAutoDriveHome();
  const historyPath = args.history || path.join(autoHome, "history.jsonl");
  const historyTail = parseNumber(args.historyTail, 12);
  const history = readJsonl(historyPath);
  const historyText = formatHistory(history, historyTail);

  const templatesPath = path.join(__dirname, "../references/prompt-templates.md");
  const templates = loadPromptTemplates(templatesPath);
  const template = templates["Verifier"];
  if (!template) {
    console.error("auto_drive_verify: missing Verifier template");
    process.exit(2);
  }

  const schemaPath = path.join(__dirname, "../references/verifier-schema.json");
  const schemaText = fs.readFileSync(schemaPath, "utf8").trim();

  const prompt = template
    .replace("{{GOAL}}", goal)
    .replace("{{HISTORY}}", historyText)
    .replace("{{SCHEMA}}", schemaText);

  const cliCommand = pickEnvValue("AUTO_DRIVE_CLI", "codex");
  const cliArgs = pickEnvValue("AUTO_DRIVE_CLI_ARGS", "exec").split(" ").filter(Boolean);
  const outputSchemaMode = pickEnvValue("AUTO_DRIVE_OUTPUT_SCHEMA", "auto");
  const promptMode = pickEnvValue("AUTO_DRIVE_PROMPT_MODE", "arg");
  const promptFlag = pickEnvValue("AUTO_DRIVE_PROMPT_FLAG", "");
  const schemaFlag = pickEnvValue("AUTO_DRIVE_OUTPUT_SCHEMA_FLAG", "--output-schema");
  const model = pickEnvValue("AUTO_DRIVE_MODEL", "");

  const result = await runModelPrompt({
    prompt,
    schemaPath,
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
  if (result.code !== 0 && !stdout.trim()) {
    console.error(stderr || "auto_drive_verify: verifier failed");
    process.exit(2);
  }

  const parsed = parseJsonFromText(stdout);
  if (!parsed || typeof parsed.complete !== "boolean") {
    console.error("auto_drive_verify: invalid JSON response");
    process.exit(2);
  }

  const output = {
    complete: Boolean(parsed.complete),
    explanation: String(parsed.explanation || "").trim(),
  };
  process.stdout.write(JSON.stringify(output));
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(2);
});
