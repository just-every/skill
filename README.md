# @just-every/skill

Starter kit skill installer for CLI apps. Installs a curated set of skills into supported clients and can scaffold new skills inside this repo.

## Quick start

```bash
npx -y @just-every/skill@latest install
```

This installs the `starter` kit (Every Design + Playwright) into supported clients. Every Design is installed via its own CLI (so auth + MCP config happen through `npx @just-every/design`).

## Commands

### Install

```bash
npx -y @just-every/skill@latest install
```

Options:

- `--kit <name>` (default: `starter`)
- `--kit none` to skip kits
- `--skills name1,name2` to add or override skills
- `--client <auto|all|code|codex|claude-desktop|claude-code|cursor|gemini|qwen>`
- `--yes` non-interactive
- `--dry-run` print changes without writing
- `--force` overwrite existing skill files
- `--skip-auth` forward to Every Design installer
- `--no-path` forward to Every Design installer
- `--launcher <npx|local>` forward to Every Design installer
- `--no-every-design` skip running the Every Design installer
- `--no-design` alias for `--no-every-design`

### Remove

```bash
npx -y @just-every/skill@latest remove --kit starter
```

This removes the selected skills from supported clients and, if `every-design` is included, runs the Every Design `remove` command (unless `--no-every-design`).

### List

```bash
npx -y @just-every/skill@latest list
```

### Create

```bash
npx -y @just-every/skill@latest create my-skill --description "What this skill does"
```

This scaffolds `skills/my-skill/SKILL.md` and registers it in `skills/registry.json`.

## Repo layout

- `skills/registry.json`: skills registry
- `skills/kits.json`: named kits
- `skills/<name>/`: skill contents
- `templates/skill/SKILL.md`: create template

## Registry schema

Registry entries can point to a local `path` (copied into client skill folders) or an external `installer`:

```json
{
  "name": "every-design",
  "installer": {
    "runner": "npx",
    "args": ["-y", "@just-every/design@latest", "install"],
    "removeArgs": ["-y", "@just-every/design@latest", "remove"]
  }
}
```

## Install Path Variables

During install, `SKILL.md` supports template tokens that are replaced per client:

- `{{SKILL_DIR}}` → installed skill directory (client-specific)
- `{{SKILL_NAME}}` → skill name
- `{{SKILLS_ROOT}}` → client skills root directory
- `{{CLIENT_NAME}}` → client key (code, codex, claude-code, cursor, gemini, qwen, claude-desktop)

## Notes

- Skills are installed into `~/.codex/skills`, `~/.code/skills`, and `~/.claude/skills` when those clients are detected.
- External skills (like Every Design) are installed via their own CLI installers instead of shipping a local `SKILL.md` in this repo.
