# Repository Guidelines

This repo follows the shared JustEvery starter conventions. See `README.md`
for the full workflow and environment guidance.

## iOS simulator testing (Appetize)
- Requires `APPETIZE_API_KEY` (or `APPETTIZE_API_KEY`) in `~/.env`.
- Build with EAS profile `simulator` and upload via the helper script if installed:
  `~/.code/skills/ios-appetize-automation/scripts/appetize_build_upload.sh --repo . --name "Starter"`.
- For authenticated sessions, use the login approval-link flow described in `../login/docs/cli-tokens.md`.
