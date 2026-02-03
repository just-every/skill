---
name: auto-drive
description: Autonomous task orchestration with coordinator decisions, optional sub-agents, verification pass, and history compaction. Use when a user asks to run a long task end-to-end, keep iterating until a goal is verified complete, or coordinate multiple agent attempts with a final completion check.
---

# Auto Drive

## What This Skill Does

Drive a long-running task by looping through: plan -> execute -> summarize -> coordinator decision -> verify. You are the executor: you run the actual commands, edits, and research. The script only tells you what to do next.

## How To Use

1. Create a session with a goal.
```bash
node {{SKILL_DIR}}/scripts/auto_drive.js --goal "Your goal here"
```
Expected output:
```
Auto Drive Session Created
Call `node skills/auto-drive/scripts/auto_drive.js --id <id>` repeatedly until it says you are complete
```

2. Ask for the next instruction.
```bash
node {{SKILL_DIR}}/scripts/auto_drive.js --id <id>
```
If it asks for a plan, create a plan and send it back:
```bash
node {{SKILL_DIR}}/scripts/auto_drive.js --id <id> --plan "Your plan here"
```

3. Execute the task you are given.
When the script returns a task prompt, do the work (run commands, edit files, launch agents). Then summarize what you actually did:
```bash
node {{SKILL_DIR}}/scripts/auto_drive.js --id <id> --summary "Work completed since last call"
```

4. Repeat.
Keep calling `--id` or sending `--summary` until the script says the session is complete.

## Notes

- If the task prompt includes an `<agents>` block, use native agents if available, then merge their results into your work.
- Provide concrete summaries: commands run, files changed, tests run, and results.
- The script runs `codex exec` under the hood. You do not need to call `codex` directly.
- Default model timeout is 3 minutes. Set `AUTO_DRIVE_CLI_TIMEOUT_MS` (milliseconds) to override (use `0` to disable).
