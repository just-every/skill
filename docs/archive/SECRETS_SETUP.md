# Secrets Setup Guide

Most teams only need the focused handoff checklist in `docs/archive/SECRETS_HANDOFF.md`. It covers the required Logto credentials, worker secret, and the helper scripts that gate CI.

Use this file as a quick index to supporting material:

- **Logto & Worker secrets** – `docs/archive/SECRETS_HANDOFF.md`, `docs/archive/SSO.md`
- **Bootstrap sync behaviour** – `docs/archive/bootstrap.md`
- **Deployment workflows & smoke evidence** – `docs/archive/DEPLOYMENTS.md`, `docs/archive/VERIFICATION.md`
- **Helper scripts** – `npm run assert:secrets`, `npm run assert:r2`, `npm run token:logto`

If you are onboarding a brand‑new environment, read `docs/archive/SECRETS_HANDOFF.md` first, then run the helper scripts locally to verify everything before pushing secrets into CI or the Worker.
