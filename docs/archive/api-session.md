# Worker Auth Endpoints – Quick Reference

## `/api/session`

- **Purpose:** Validate a Logto access token presented as a Bearer header and expose minimal session metadata.
- **Success Response:**
  ```json
  {
    "authenticated": true,
    "sessionId": "sess_abc123",
    "expiresAt": "2025-01-01T12:00:00Z",
    "emailAddress": "founder@example.com"
  }
  ```
- **Failures:** Body shape stays consistent (`authenticated: false`, remaining fields `null`).
  - `401` + `WWW-Authenticate: Bearer realm="worker", error="invalid_token", …`
    - Missing header → `error="invalid_request"`, `error_description="Bearer token required"`
    - Expired/invalid → `error="invalid_token"`, description derived from jose error
  - `403` + `WWW-Authenticate: Bearer realm="worker", error="insufficient_scope"` when the audience does not match `LOGTO_API_RESOURCE`
  - `502`/`503` + `{ "error": "bad_gateway" | "service_unavailable", "error_description": "…" }` for upstream identity errors
- **Example curl:**
  ```bash
  curl -sS https://your-worker.example.com/api/session \
    -H "Authorization: Bearer $ACCESS_TOKEN"
  ```

## `/callback`

- **Usage:** `GET /callback?code=…&state=…` invoked by Logto after user sign-in.
- **Success:** Exchanges the authorization code (client secret optional) and responds `302 Location: /app` (or the configured base path).
- **Errors:** JSON body `{ "error", "error_description" }` with appropriate HTTP status.
  - `400 invalid_request` – missing parameters or provider returned an error code
  - `502 bad_gateway` – provider responded with handled errors (e.g., `invalid_grant`)
  - `503 service_unavailable` – network/5xx issues; includes `Retry-After: 5` when the worker could not reach Logto

## Implementation Notes

- JWT verification uses `LOGTO_ISSUER`, `LOGTO_JWKS_URI`, and enforces `LOGTO_API_RESOURCE` as an audience.
- Failure responses always include `WWW-Authenticate` for 401/403 and a stable JSON shape so frontends can branch on `authenticated`.
- The callback handler falls back to 502/503 while preserving provider error payloads for easier debugging.
- Endpoints are documented in `docs/archive/api-session.yaml` (OpenAPI 3.1).
