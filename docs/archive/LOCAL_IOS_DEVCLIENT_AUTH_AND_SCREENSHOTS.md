# Local iOS dev-client auth + screenshot parity (Starter)

This doc captures the fixes behind a painful-but-common workflow when bootstrapping new apps on this stack:

- Getting **authenticated** in the iOS Expo dev client without relying on flaky deep-link prompts.
- Making web + native routes behave consistently.

## Symptoms

### 1) iOS system prompt blocks automation

On iOS Simulator, navigating to a custom scheme (for example `justevery://…`) can show an overlay:

> “Open this page in …?”

This prompt is hard to dismiss reliably via automation and can block `simctl io screenshot` from capturing the underlying UI.

### 2) Native app can’t authenticate even when web works

Typical causes:

- Native fetches don’t automatically share a browser cookie jar.
- The Worker expects a Better Auth cookie, but native clients often only have a session token.
- A stale `better-auth.session_token` cookie can override a newer token passed via headers.

### 3) Callback route doesn’t render

Deep-link callbacks often look like `/callback?return=/app/overview`. If routing matches `/callback` exactly, the callback screen never shows.

## The approach that works reliably

### A) Launch the app directly (avoid deep-link prompts)

Instead of opening a URL that triggers a custom scheme prompt, launch the app directly so iOS doesn’t need to “open a page in the app”.

```bash
# Start Metro for dev client (with a known test session token)
cd apps/web
EXPO_PUBLIC_TEST_SESSION_TOKEN="$(cat /tmp/je-test-session-token.txt)" \
EXPO_PUBLIC_START_PATH="/app/overview" \
pnpm exec dotenv -e ../../.env.local -- npx expo start --dev-client --localhost --port 8081

# Launch app without opening any URL
xcrun simctl launch <SIMULATOR_UDID> com.justevery.manager
```

Notes:

- `--localhost` helps the simulator reach Metro at `127.0.0.1`.
- `EXPO_PUBLIC_START_PATH` avoids landing on `/` on native.

### B) Bootstrap native auth from a signed session token

For development and CI-style screenshots, the app supports bootstrapping from a signed cookie token.

- `EXPO_PUBLIC_TEST_SESSION_TOKEN` (native, dev-only): passed to the app at startup.
- The token is persisted in AsyncStorage under `justevery:test-session-token` (dev-only).

Implementation: `apps/web/src/auth/AuthProvider.tsx`.

### C) Worker accepts `x-session-token` safely

The Worker primarily verifies sessions via the Better Auth cookie, but native clients can send:

- `x-session-token: <signed token>`

The Worker rewrites the request cookie to match that token and strips stale session cookies so the header token wins.
Origin checks prevent accepting header auth from unexpected browser origins.

Implementation: `workers/api/src/sessionAuth.ts`.

### D) Callback route matching

Treat `/callback?...` as a callback route, not only `/callback`.

Implementation: `apps/web/App.tsx`.

## Quick debug checklist

1) Verify local origins are wired

- `workers/api/.dev.vars` should point `LOGIN_ORIGIN`/`BETTER_AUTH_URL` at `http://127.0.0.1:9787`.

2) Verify Worker sees your session via header token

```bash
TOKEN="$(cat /tmp/je-test-session-token.txt)"
curl -sS -H "x-session-token: $TOKEN" http://127.0.0.1:9788/api/me | jq
```

3) Verify native app logs show authentication

Metro logs should include:

- `[auth status] authenticated`

If still stuck, inspect the login worker (`../login`) because the session/token format ultimately comes from Better Auth.

