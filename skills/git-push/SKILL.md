---
name: git-push
description: Commit, push, and workflow-monitoring guidance for any git repository. Use when a user asks to “push” changes or requests a commit+push workflow, including careful merges and GitHub Actions monitoring.
---

# Git Push

## Overview

Follow the standard push flow for a git repo. Use this to take a clean snapshot, commit, merge remote changes carefully, push, and monitor workflows before replying.

## Workflow

1. Confirm repo context.
Only run inside a git repo. If not in a repo, say so and stop.

2. Capture the snapshot.
Run `git status --short` and `git diff --cached` for context. Use these to decide what to commit. If the working tree is clean and there are no staged changes, report “nothing to push” and stop.

3. Clean and commit.
If the working tree is dirty, briefly clean it (add temp files or secrets to `.gitignore`, delete scratch files) and then stage + commit all remaining changes. Use a descriptive commit message. If there are no changes to commit, skip this step.

4. Merge remote changes carefully.
Prefer merge-only updates. Recommended flow:
- Commit local work first (if any).
- `git fetch origin`
- `git merge --no-ff --no-commit origin/main` (or the repo’s default branch).
- Resolve conflicts line-by-line (avoid bulk checkout of “ours/theirs” across the whole tree).
- Finish the merge commit with a clear message.

5. Push.
Run `git push` after the merge and checks succeed.

6. Monitor workflows.
Use `scripts/gh-run-wait.ts` (or `scripts/wait-for-gh-run.sh` if you prefer bash). If a workflow fails, investigate, fix, commit, push, and monitor again. Wait briefly if no workflows appear before concluding none were triggered.

7. Respond only after completion.
Do not respond until all workflows complete successfully or you have a clear, user-approved stopping point.

## Scripts

Use `scripts/gh-run-wait.ts` to monitor the latest GitHub Actions run when the `gh_run_wait` tool is unavailable. It waits briefly for a run to appear after a push, prints the run URL plus job/step counts, and then reports progress every 5 seconds until completion.

Run (installed skill path):
- `npx -y tsx {{SKILL_DIR}}/scripts/gh-run-wait.ts`

Common options:
- `--workflow <name>`
- `--branch <name>`
- `--repo <owner/repo>`
- `--interval <seconds>`
- `--discover-delay <seconds>`
- `--discover-timeout <seconds>`
- `--run <id>`
