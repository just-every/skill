# Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage
per-package semantic releases across the pnpm workspace.

## Adding a changeset

1. Run `pnpm changeset`.
2. Select the packages that should be versioned together.
3. Choose the appropriate bump (patch/minor/major).
4. Write an imperative summary (for example, `feat(config): support runtime env`).

Commit the generated markdown file under `.changeset/` with your code changes.

## Previewing & rehearsing

- See queued releases: `pnpm changeset status`.
- Dry-run the publish step (no registry writes, no tag pushes):
  `pnpm run release:dry-run`.
- Reset local experiments with `git reset --hard && pnpm install`.
