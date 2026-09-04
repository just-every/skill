import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DISCOVER_LIST_LIMIT,
  discoverRun,
  watchRun,
  type Options,
  type RunListEntry,
  type WaiterDeps,
} from "./gh-run-wait.ts";

const HEAD_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const START_MS = 1_700_000_000_000;

function iso(offsetMs: number): string {
  return new Date(START_MS + offsetMs).toISOString();
}

function runEntry(partial: {
  id: number;
  sha: string;
  createdOffsetMs: number;
  title?: string;
}): RunListEntry {
  return {
    databaseId: partial.id,
    headSha: partial.sha,
    createdAt: iso(partial.createdOffsetMs),
    workflowName: "CI",
    displayTitle: partial.title ?? `run ${partial.id}`,
    headBranch: "feat",
  };
}

function discoverOpts(): Options {
  return {
    intervalSeconds: 0.01,
    discoverDelaySeconds: 0.01,
    discoverTimeoutSeconds: 2,
  };
}

function clockDeps(): Pick<WaiterDeps, "now" | "sleep"> {
  let t = START_MS;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

function listGh(pages: RunListEntry[][], captured: { args: string[][] }) {
  let i = 0;
  return async (args: string[]): Promise<string> => {
    captured.args.push([...args]);
    const page = pages[Math.min(i, pages.length - 1)] ?? [];
    i += 1;
    return JSON.stringify(page);
  };
}

function listLimit(args: string[]): number {
  const idx = args.indexOf("--limit");
  assert.ok(idx >= 0, "gh run list must pass --limit");
  return Number(args[idx + 1]);
}

test("1. list[0] attaches another push's run", async () => {
  const other = runEntry({ id: 200, sha: OTHER_SHA, createdOffsetMs: 5_000, title: "push B" });
  const ours = runEntry({ id: 100, sha: HEAD_SHA, createdOffsetMs: 6_000, title: "push A" });
  const captured = { args: [] as string[][] };
  const selected = await discoverRun(discoverOpts(), "feat", HEAD_SHA, {
    ...clockDeps(),
    log: () => {},
    runGh: listGh([[other], [other, ours]], captured),
  });

  assert.equal(
    String(selected.databaseId),
    "100",
    "waiter must attach the run whose headSha matches HEAD, not list[0]",
  );
});

test("2. conclusion read while status is in_progress", async () => {
  const racyView = {
    status: "in_progress",
    conclusion: "",
    jobs: [
      {
        name: "build",
        status: "completed",
        conclusion: "success",
        steps: [],
      },
    ],
    url: "https://example.test/runs/9",
    displayTitle: "push A",
    workflowName: "CI",
    createdAt: iso(1_000),
    startedAt: iso(1_000),
    updatedAt: iso(8_000),
    headBranch: "feat",
  };
  const logs: string[] = [];
  const result = await watchRun(
    {
      ...discoverOpts(),
      conclusionWaitSeconds: 0.05,
    },
    { runId: "9", runBranch: "feat", url: racyView.url, workflow: "CI", title: "push A" },
    {
      ...clockDeps(),
      log: (msg) => {
        logs.push(msg);
      },
      runGh: async () => JSON.stringify(racyView),
    },
  );

  assert.notEqual(
    result.exitCode,
    1,
    "jobs-terminal with an unpublished run conclusion must not be reported as failure",
  );
  assert.equal(result.expired, true);
  assert.match(
    logs.join("\n"),
    /conclusion did not arrive/i,
  );
});

test("3. --limit 1 plus the freshRun fallback attaches push B while waiting on push A", async () => {
  const other = runEntry({ id: 200, sha: OTHER_SHA, createdOffsetMs: 5_000, title: "push B" });
  const ours = runEntry({ id: 100, sha: HEAD_SHA, createdOffsetMs: 8_000, title: "push A" });
  const captured = { args: [] as string[][] };
  const selected = await discoverRun(discoverOpts(), "feat", HEAD_SHA, {
    ...clockDeps(),
    log: () => {},
    runGh: listGh([[], [other], [other, ours]], captured),
  });

  assert.equal(
    String(selected.databaseId),
    "100",
    "a newer unmatched sha must not be selected while waiting for HEAD",
  );
  assert.ok(captured.args.length > 0, "discover must query gh run list");
  for (const args of captured.args) {
    assert.ok(
      listLimit(args) > 1,
      "discover must query a population of runs, not --limit 1",
    );
  }
  assert.equal(DISCOVER_LIST_LIMIT > 1, true, "DISCOVER_LIST_LIMIT must be a population, not 1");
});

test("4. rerun on the same SHA attaches the pre-existing run", async () => {
  const oldRun = runEntry({
    id: 1,
    sha: HEAD_SHA,
    createdOffsetMs: -60_000,
    title: "original",
  });
  const rerun = runEntry({
    id: 2,
    sha: HEAD_SHA,
    createdOffsetMs: 4_000,
    title: "rerun",
  });
  const captured = { args: [] as string[][] };
  const selected = await discoverRun(discoverOpts(), "feat", HEAD_SHA, {
    ...clockDeps(),
    log: () => {},
    runGh: listGh([[oldRun], [rerun, oldRun]], captured),
  });

  assert.equal(
    String(selected.databaseId),
    "2",
    "a same-SHA rerun must attach the new run, not the id that existed at wait start",
  );
});
