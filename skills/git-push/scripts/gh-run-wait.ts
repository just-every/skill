#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type Options = {
  runId?: string;
  workflow?: string;
  branch?: string;
  repo?: string;
  intervalSeconds: number;
  discoverDelaySeconds: number;
  discoverTimeoutSeconds: number;
  conclusionWaitSeconds?: number;
};

type JobFailure = {
  name: string;
  conclusion: string;
  step?: string;
};

type JobSummary = {
  total: number;
  completed: number;
  inProgress: number;
  queued: number;
  success: number;
  failure: number;
  cancelled: number;
  skipped: number;
  neutral: number;
  stepsTotal: number;
  stepsCompleted: number;
  stepsInProgress: number;
  stepsQueued: number;
  runningNames: string[];
  queuedNames: string[];
  failedJobs: JobFailure[];
};

export type RunListEntry = {
  databaseId?: number | string;
  workflowName?: string;
  displayTitle?: string;
  headBranch?: string;
  headSha?: string;
  createdAt?: string;
};

export type WaiterDeps = {
  runGh?: (args: string[], repo?: string) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (msg: string) => void;
};

export type WatchResult = {
  exitCode: number;
  status: string;
  conclusion: string;
  expired: boolean;
};

const DEFAULT_INTERVAL_SECONDS = 5;
const DEFAULT_DISCOVER_DELAY_SECONDS = 2;
const DEFAULT_DISCOVER_TIMEOUT_SECONDS = 30;
export const DEFAULT_CONCLUSION_WAIT_SECONDS = 30;
export const DISCOVER_LIST_LIMIT = 50;
const TIGHT_POLL_SECONDS = 1;
const RUN_LIST_FIELDS =
  "databaseId,displayTitle,workflowName,headBranch,status,conclusion,headSha,createdAt";

function usage(): void {
  console.log(`Usage: gh-run-wait.ts [options]

Options:
  -r, --run <id>            Run ID to monitor.
  -w, --workflow <name>     Workflow name or filename to pick the latest run.
  -b, --branch <name>       Branch to filter when selecting a run.
  -R, --repo <owner/repo>   Repository override for gh (uses gh -R).
  -i, --interval <secs>     Polling interval in seconds (default: ${DEFAULT_INTERVAL_SECONDS}).
  --discover-delay <secs>   Delay between discovery attempts (default: ${DEFAULT_DISCOVER_DELAY_SECONDS}).
  --discover-timeout <secs> Max seconds to wait for a run to appear (default: ${DEFAULT_DISCOVER_TIMEOUT_SECONDS}).
  -h, --help                Show this help message.
`);
}

function parseNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    discoverDelaySeconds: DEFAULT_DISCOVER_DELAY_SECONDS,
    discoverTimeoutSeconds: DEFAULT_DISCOVER_TIMEOUT_SECONDS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-r":
      case "--run":
        opts.runId = argv[++i];
        break;
      case "-w":
      case "--workflow":
        opts.workflow = argv[++i];
        break;
      case "-b":
      case "--branch":
        opts.branch = argv[++i];
        break;
      case "-R":
      case "--repo":
        opts.repo = argv[++i];
        break;
      case "-i":
      case "--interval":
        opts.intervalSeconds = parseNumber(argv[++i], "interval");
        break;
      case "--discover-delay":
        opts.discoverDelaySeconds = parseNumber(argv[++i], "discover-delay");
        break;
      case "--discover-timeout":
        opts.discoverTimeoutSeconds = parseNumber(argv[++i], "discover-timeout");
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

async function ensureGhAvailable(): Promise<void> {
  try {
    await execFileAsync("gh", ["--version"]);
  } catch (err) {
    throw new Error("gh is required but was not found in PATH");
  }
}

async function defaultRunGh(args: string[], repo?: string): Promise<string> {
  const fullArgs = repo ? ["-R", repo, ...args] : args;
  try {
    const { stdout } = await execFileAsync("gh", fullArgs, {
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (err: any) {
    const stderr = err?.stderr ? String(err.stderr).trim() : "";
    const stdout = err?.stdout ? String(err.stdout).trim() : "";
    const message = stderr || stdout || err?.message || "unknown error";
    throw new Error(`gh ${fullArgs.join(" ")} failed: ${message}`);
  }
}

async function runGit(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      maxBuffer: 1024 * 1024,
    });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function detectBranch(): Promise<string> {
  const head = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (head && head !== "HEAD") {
    return head;
  }

  const symref = await runGit(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  if (symref) {
    const parts = symref.split("/");
    const name = parts[parts.length - 1];
    if (name) {
      return name;
    }
  }

  const remoteShow = await runGit(["remote", "show", "origin"]);
  if (remoteShow) {
    for (const line of remoteShow.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("HEAD branch:")) {
        const name = trimmed.replace("HEAD branch:", "").trim();
        if (name) {
          return name;
        }
      }
    }
  }

  return "main";
}

export async function detectHeadSha(): Promise<string | null> {
  return runGit(["rev-parse", "HEAD"]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRunListArgs(opts: Options, branch: string): string[] {
  const args = ["run", "list"];
  if (opts.workflow) {
    args.push("--workflow", opts.workflow);
  }
  args.push(
    "--branch",
    branch,
    "--limit",
    String(DISCOVER_LIST_LIMIT),
    "--json",
    RUN_LIST_FIELDS,
  );
  return args;
}

function hasRunId(entry: RunListEntry | undefined): entry is RunListEntry {
  const id = entry?.databaseId;
  return typeof id === "number" || (typeof id === "string" && id.length > 0);
}

export function selectRunFromList(
  list: RunListEntry[],
  expectedHeadSha: string | undefined,
  preExistingIds: ReadonlySet<string>,
  startMs: number,
): RunListEntry | undefined {
  const withIds = list.filter(hasRunId);
  if (!expectedHeadSha) {
    return withIds[0];
  }

  const expected = expectedHeadSha.toLowerCase();
  const matching = withIds.filter(
    (entry) =>
      typeof entry.headSha === "string" &&
      entry.headSha.toLowerCase() === expected,
  );
  const eligible = matching.filter(
    (entry) => !preExistingIds.has(String(entry.databaseId)),
  );
  const afterStart = eligible.filter((entry) => {
    const created =
      typeof entry.createdAt === "string" ? Date.parse(entry.createdAt) : NaN;
    return Number.isFinite(created) && created > startMs;
  });
  if (afterStart.length === 0) {
    return undefined;
  }

  return afterStart.slice().sort((a, b) => {
    const ta = Date.parse(String(a.createdAt));
    const tb = Date.parse(String(b.createdAt));
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    return nb - na;
  })[0];
}

export async function discoverRun(
  opts: Options,
  branch: string,
  targetHeadSha?: string,
  deps?: WaiterDeps,
): Promise<RunListEntry> {
  const runGh = deps?.runGh ?? defaultRunGh;
  const sleepFn = deps?.sleep ?? sleep;
  const now = deps?.now ?? Date.now;
  const log = deps?.log ?? ((msg: string) => console.log(msg));

  const start = now();
  let first = true;
  let preExistingIds: Set<string> | null = null;
  const expectedHeadSha = targetHeadSha ? targetHeadSha.toLowerCase() : undefined;

  while (true) {
    if (!first) {
      await sleepFn(opts.discoverDelaySeconds * 1000);
    }

    const args = buildRunListArgs(opts, branch);
    const output = await runGh(args, opts.repo);
    const list = JSON.parse(output) as RunListEntry[];

    if (expectedHeadSha && preExistingIds === null) {
      preExistingIds = new Set(
        list
          .filter(
            (entry) =>
              hasRunId(entry) &&
              typeof entry.headSha === "string" &&
              entry.headSha.toLowerCase() === expectedHeadSha,
          )
          .map((entry) => String(entry.databaseId)),
      );
    }

    const run = selectRunFromList(
      list,
      expectedHeadSha,
      preExistingIds ?? new Set(),
      start,
    );
    if (run && hasRunId(run)) {
      return run;
    }

    if (first) {
      log(
        `No runs found yet; waiting ${opts.discoverDelaySeconds}s for a new run to appear...`,
      );
    }
    first = false;

    const elapsed = (now() - start) / 1000;
    if (elapsed >= opts.discoverTimeoutSeconds) {
      throw new Error(
        `No runs found for branch '${branch}' within ${opts.discoverTimeoutSeconds}s`,
      );
    }
  }
}

function parseJobs(view: any): JobSummary {
  const summary: JobSummary = {
    total: 0,
    completed: 0,
    inProgress: 0,
    queued: 0,
    success: 0,
    failure: 0,
    cancelled: 0,
    skipped: 0,
    neutral: 0,
    stepsTotal: 0,
    stepsCompleted: 0,
    stepsInProgress: 0,
    stepsQueued: 0,
    runningNames: [],
    queuedNames: [],
    failedJobs: [],
  };

  const jobs = Array.isArray(view?.jobs) ? view.jobs : [];
  summary.total = jobs.length;

  for (const job of jobs) {
    const name = typeof job?.name === "string" ? job.name : "(unnamed)";
    const status = typeof job?.status === "string" ? job.status : "";
    const conclusion = typeof job?.conclusion === "string" ? job.conclusion : "";

    if (status === "completed") {
      summary.completed += 1;
    } else if (status === "in_progress") {
      summary.inProgress += 1;
      summary.runningNames.push(name);
    } else if (status === "queued") {
      summary.queued += 1;
      summary.queuedNames.push(name);
    }

    if (status === "completed") {
      if (conclusion === "success") {
        summary.success += 1;
      } else if (conclusion === "cancelled") {
        summary.cancelled += 1;
      } else if (conclusion === "skipped") {
        summary.skipped += 1;
      } else if (conclusion === "neutral") {
        summary.neutral += 1;
      } else if (conclusion) {
        summary.failure += 1;
        const steps = Array.isArray(job?.steps) ? job.steps : [];
        const failedStep = steps.find((step: any) => {
          const stepStatus = typeof step?.status === "string" ? step.status : "";
          const stepConclusion = typeof step?.conclusion === "string" ? step.conclusion : "";
          return (
            stepStatus === "completed" &&
            stepConclusion &&
            stepConclusion !== "success" &&
            stepConclusion !== "skipped" &&
            stepConclusion !== "neutral"
          );
        });
        summary.failedJobs.push({
          name,
          conclusion,
          step: typeof failedStep?.name === "string" ? failedStep.name : undefined,
        });
      }
    }

    const steps = Array.isArray(job?.steps) ? job.steps : [];
    summary.stepsTotal += steps.length;
    for (const step of steps) {
      const stepStatus = typeof step?.status === "string" ? step.status : "";
      if (stepStatus === "completed") {
        summary.stepsCompleted += 1;
      } else if (stepStatus === "in_progress") {
        summary.stepsInProgress += 1;
      } else if (stepStatus === "queued") {
        summary.stepsQueued += 1;
      }
    }
  }

  return summary;
}

function progressBar(completed: number, total: number, width = 16): string {
  if (total <= 0) {
    return "[----------------]";
  }
  const clampedWidth = Math.max(1, width);
  const filled = Math.floor((completed * clampedWidth + total - 1) / total);
  let bar = "[";
  for (let i = 0; i < clampedWidth; i += 1) {
    bar += i < filled ? "=" : "-";
  }
  bar += "]";
  return bar;
}

function formatJobList(names: string[], maxItems = 4): string {
  if (!names.length) {
    return "";
  }
  const shown = names.slice(0, maxItems);
  let text = shown.join(", ");
  if (names.length > maxItems) {
    text += ` +${names.length - maxItems} more`;
  }
  return text;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function runDurationFromView(view: any): string | null {
  const startedAt = typeof view?.startedAt === "string" ? view.startedAt : undefined;
  const createdAt = typeof view?.createdAt === "string" ? view.createdAt : undefined;
  const updatedAt = typeof view?.updatedAt === "string" ? view.updatedAt : undefined;
  const start = startedAt || createdAt;
  if (!start || !updatedAt) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(updatedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return formatDuration(Math.floor((endMs - startMs) / 1000));
}

function runSummaryText(
  runId: string,
  branch: string,
  status: string,
  conclusion: string,
  workflow: string | undefined,
  title: string | undefined,
  url: string | undefined,
  jobSummary: JobSummary,
  duration: string | null,
): string {
  const outcome = conclusion || status;
  const lines: string[] = [];
  lines.push(`GitHub Actions run ${outcome}`);
  if (workflow) {
    lines.push(`Workflow: ${workflow}`);
  }
  if (title) {
    lines.push(`Title: ${title}`);
  }
  lines.push(`Run: ${runId}`);
  lines.push(`Branch: ${branch}`);
  if (url) {
    lines.push(`URL: ${url}`);
  }
  if (duration) {
    lines.push(`Duration: ${duration}`);
  }
  if (jobSummary.total === 0) {
    lines.push("Jobs: none reported");
  } else {
    const parts: string[] = [];
    parts.push(`${jobSummary.total} total`);
    if (jobSummary.success > 0) parts.push(`${jobSummary.success} success`);
    if (jobSummary.failure > 0) parts.push(`${jobSummary.failure} failed`);
    if (jobSummary.cancelled > 0) parts.push(`${jobSummary.cancelled} cancelled`);
    if (jobSummary.skipped > 0) parts.push(`${jobSummary.skipped} skipped`);
    if (jobSummary.neutral > 0) parts.push(`${jobSummary.neutral} neutral`);
    lines.push(`Jobs: ${parts.join(" • ")}`);
  }
  if (jobSummary.failedJobs.length > 0) {
    lines.push("Failures:");
    for (const failed of jobSummary.failedJobs) {
      let line = `- ${failed.name} (${failed.conclusion})`;
      if (failed.step) {
        line += ` — step: ${failed.step}`;
      }
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function formatProgressLine(summary: JobSummary): string | null {
  const hasSteps = summary.stepsTotal > 0;
  const progressCompleted = hasSteps ? summary.stepsCompleted : summary.completed;
  const progressTotal = hasSteps ? summary.stepsTotal : summary.total;
  const label = hasSteps ? "progress (steps)" : "progress (jobs)";
  if (progressTotal <= 0) {
    return null;
  }
  const percent = Math.floor((progressCompleted * 100) / Math.max(1, progressTotal));
  const bar = progressBar(progressCompleted, progressTotal, 16);
  const jobCounts = `${summary.completed} completed • ${summary.inProgress} running • ${summary.queued} queued`;
  const stepCounts = hasSteps
    ? `steps ${summary.stepsCompleted} completed • ${summary.stepsInProgress} running • ${summary.stepsQueued} queued`
    : null;
  let line = `${label} ${bar} ${progressCompleted}/${progressTotal} (${percent}%) | jobs ${jobCounts}`;
  if (stepCounts) {
    line += ` | ${stepCounts}`;
  }
  return line;
}

function formatTimestamp(date: Date): string {
  const iso = date.toISOString();
  return iso.replace("T", " ").slice(0, 19);
}

const RUN_VIEW_FIELDS =
  "status,conclusion,jobs,url,displayTitle,workflowName,createdAt,startedAt,updatedAt,headBranch";

export function decideWatchAction(input: {
  status: string;
  conclusion: string;
  jobsComplete: boolean;
  activeJobs: number;
  conclusionWaitStartedAt: number | null;
  now: number;
  conclusionWaitBoundMs: number;
}): {
  phase: "poll" | "poll_tight" | "exit" | "expired";
  exitCode?: number;
  conclusionWaitStartedAt: number | null;
} {
  const hasConclusion = input.conclusion.length > 0;
  if (input.status === "completed" && hasConclusion) {
    return {
      phase: "exit",
      exitCode: input.conclusion === "success" ? 0 : 1,
      conclusionWaitStartedAt: input.conclusionWaitStartedAt,
    };
  }

  const jobsTerminal = input.jobsComplete && input.activeJobs === 0;
  const waitingOnConclusion =
    jobsTerminal || (input.status === "completed" && !hasConclusion);
  if (!waitingOnConclusion) {
    return { phase: "poll", conclusionWaitStartedAt: null };
  }

  const startedAt = input.conclusionWaitStartedAt ?? input.now;
  if (input.now - startedAt >= input.conclusionWaitBoundMs) {
    return {
      phase: "expired",
      exitCode: 0,
      conclusionWaitStartedAt: startedAt,
    };
  }
  return {
    phase: "poll_tight",
    conclusionWaitStartedAt: startedAt,
  };
}

export async function watchRun(
  opts: Options,
  args: {
    runId: string;
    runBranch: string;
    url?: string;
    workflow?: string;
    title?: string;
  },
  deps?: WaiterDeps,
): Promise<WatchResult> {
  const runGh = deps?.runGh ?? defaultRunGh;
  const sleepFn = deps?.sleep ?? sleep;
  const now = deps?.now ?? Date.now;
  const log = deps?.log ?? ((msg: string) => console.log(msg));
  const boundMs =
    (opts.conclusionWaitSeconds ?? DEFAULT_CONCLUSION_WAIT_SECONDS) * 1000;

  let conclusionWaitStartedAt: number | null = null;
  let delaySeconds = opts.intervalSeconds;

  while (true) {
    await sleepFn(delaySeconds * 1000);
    const nextViewJson = await runGh(
      ["run", "view", args.runId, "--json", RUN_VIEW_FIELDS],
      opts.repo,
    );
    const view = JSON.parse(nextViewJson);
    const status = typeof view?.status === "string" ? view.status : "";
    const conclusion = typeof view?.conclusion === "string" ? view.conclusion : "";
    const nextSummary = parseJobs(view);
    const totalJobs = nextSummary.total;
    const activeJobs = nextSummary.inProgress + nextSummary.queued;
    const jobsComplete = totalJobs > 0 && nextSummary.completed === totalJobs;

    const progressLine = formatProgressLine(nextSummary);
    if (progressLine) {
      log(`${formatTimestamp(new Date())} ${progressLine}`);
    }

    const decision = decideWatchAction({
      status,
      conclusion,
      jobsComplete,
      activeJobs,
      conclusionWaitStartedAt,
      now: now(),
      conclusionWaitBoundMs: boundMs,
    });
    conclusionWaitStartedAt = decision.conclusionWaitStartedAt;

    if (decision.phase === "exit" || decision.phase === "expired") {
      log("");
      if (decision.phase === "expired") {
        const boundSeconds =
          opts.conclusionWaitSeconds ?? DEFAULT_CONCLUSION_WAIT_SECONDS;
        log(
          `GitHub Actions run-level conclusion did not arrive within ${boundSeconds}s after all jobs completed (status=${status || "unknown"}, conclusion empty). Not treating this as failure.`,
        );
      } else {
        const runUrl = typeof view?.url === "string" ? view.url : args.url;
        const finalWorkflow =
          typeof view?.workflowName === "string" ? view.workflowName : args.workflow;
        const finalTitle =
          typeof view?.displayTitle === "string" ? view.displayTitle : args.title;
        log(
          runSummaryText(
            args.runId,
            args.runBranch,
            status,
            conclusion,
            finalWorkflow,
            finalTitle,
            runUrl,
            nextSummary,
            runDurationFromView(view),
          ),
        );
      }
      return {
        exitCode: decision.exitCode ?? 0,
        status,
        conclusion,
        expired: decision.phase === "expired",
      };
    }

    delaySeconds =
      decision.phase === "poll_tight"
        ? Math.min(opts.intervalSeconds, TIGHT_POLL_SECONDS)
        : opts.intervalSeconds;
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  await ensureGhAvailable();

  const branch = opts.branch ? opts.branch : await detectBranch();

  let runId = opts.runId;
  let workflow = opts.workflow;
  let displayTitle: string | undefined;
  let runBranch = branch;
  const headSha = await detectHeadSha();

  if (!runId) {
    const run = await discoverRun(opts, branch, headSha || undefined);
    runId = String(run.databaseId);
    if (!workflow && run.workflowName) {
      workflow = run.workflowName;
    }
    if (run.displayTitle) {
      displayTitle = run.displayTitle;
    }
    if (run.headBranch) {
      runBranch = run.headBranch;
    }
  }

  if (!runId) {
    throw new Error("No run ID resolved");
  }

  const initialViewJson = await defaultRunGh(
    ["run", "view", runId, "--json", RUN_VIEW_FIELDS],
    opts.repo,
  );
  const view = JSON.parse(initialViewJson);
  const summary = parseJobs(view);
  const url = typeof view?.url === "string" ? view.url : undefined;
  const resolvedWorkflow =
    typeof view?.workflowName === "string" ? view.workflowName : workflow;
  const resolvedTitle =
    typeof view?.displayTitle === "string" ? view.displayTitle : displayTitle;
  if (typeof view?.headBranch === "string") {
    runBranch = view.headBranch;
  }

  console.log("Monitoring GitHub Workflow");
  if (url) console.log(`url ${url}`);
  if (runBranch) console.log(`branch ${runBranch}`);
  console.log(`run ${runId}`);
  if (resolvedWorkflow) console.log(`workflow ${resolvedWorkflow}`);
  console.log(
    `jobs ${summary.completed} completed • ${summary.inProgress} running • ${summary.queued} queued • ${summary.total} total`,
  );
  if (summary.stepsTotal > 0) {
    console.log(
      `steps ${summary.stepsCompleted} completed • ${summary.stepsInProgress} running • ${summary.stepsQueued} queued • ${summary.stepsTotal} total`,
    );
  }
  const initialProgress = formatProgressLine(summary);
  if (initialProgress) {
    console.log(`${formatTimestamp(new Date())} ${initialProgress}`);
  }
  const runningNames = formatJobList(summary.runningNames);
  if (runningNames) {
    console.log(`running ${runningNames}`);
  }
  const queuedNames = formatJobList(summary.queuedNames);
  if (queuedNames) {
    console.log(`queued ${queuedNames}`);
  }

  const result = await watchRun(
    opts,
    {
      runId,
      runBranch,
      url,
      workflow: resolvedWorkflow,
      title: resolvedTitle,
    },
  );
  process.exit(result.exitCode);
}

function isMainModule(metaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) {
    return false;
  }
  try {
    return metaUrl === pathToFileURL(path.resolve(argv1)).href;
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
