---
name: Request Better Auth session for E2E
description: Ask for a temporary Owner/Admin TEST_SESSION_COOKIE so the authenticated Playwright spec runs post-deploy.
title: Request TEST_SESSION_COOKIE for E2E
labels: e2e, needs-auth
assignees: ''
---

## Why we need it
- The new `tests/e2e/authenticated.spec.ts` exercises the sidebar, Team edit/remove, Billing persistence, and Checkout flows with a real Owner/Admin session. That spec only runs when `TEST_SESSION_COOKIE` is set in GitHub secrets.

## What to do
1. Sign in as an Owner/Admin at https://starter.justevery.com/app.  
2. In DevTools → Application/Storage → Cookies → `https://starter.justevery.com`, copy the value of `better-auth.session_token`.  
3. Set that raw value as the `TEST_SESSION_COOKIE` secret under Settings → Secrets & variables → Actions.  

## Checklist
- [ ] `TEST_SESSION_COOKIE` secret exists with a fresh Owner/Admin session token.  
- [ ] Cookie originates from `/app` (Better Auth scopes it to `/api/*`, as expected).  
- [ ] Rotate or delete the secret after the verification run for safety.

## Notes
- The gated spec skips if the secret is absent, so no urgent action is required if we can’t provide a session today.  
- Once the job runs, artifacts (sidebar/team/billing screenshots, traces) appear under `test-results/**` on the deploy run page.
