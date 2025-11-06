# Test Artefacts

This repository ships without recorded runs so new projects start from a clean slate. If you need to capture evidence (bootstrap validation, smoke checks, Playwright runs), create a timestamped subdirectory locally and keep it out of version control.

Example regeneration flow:

1. Run the desired check (for example `npm run validate:bootstrap` or `npm run test:e2e`).
2. Gather the artefacts into `test-results/<ISO8601-timestamp>/`.
3. Inspect or share them as needed, but do not commit the generated folders.

CI pipelines may attach artefacts to workflow runs instead of checking them in. This README remains tracked to document the convention.
