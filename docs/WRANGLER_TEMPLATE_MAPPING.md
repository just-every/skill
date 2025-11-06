# Wrangler Template Mapping

Placeholder mapping for `workers/api/wrangler.toml.template`.

| Placeholder | Value source | Default / derivation | Notes |
| --- | --- | --- | --- |
| `{{PROJECT_ID}}` | `env.PROJECT_ID` | — | Worker name suffix and route host. |
| `{{LOGTO_ISSUER}}` | `env.LOGTO_ISSUER` | `${LOGTO_ENDPOINT}/oidc` | Required by worker auth config. |
| `{{LOGTO_JWKS_URI}}` | `env.LOGTO_JWKS_URI` | `${LOGTO_ENDPOINT}/oidc/jwks` | Mirrors issuer default. |
| `{{LOGTO_API_RESOURCE}}` | `env.LOGTO_API_RESOURCE` | — | API audience; canonical key (previously `LOGTO_AUDIENCE`). |
| `{{LOGTO_ENDPOINT}}` | `env.LOGTO_ENDPOINT` | — | Auth base URL. |
| `{{LOGTO_APPLICATION_ID}}` | `env.LOGTO_APPLICATION_ID` | empty string | Optional but emitted for parity. |
| `{{EXPO_PUBLIC_LOGTO_*}}` | corresponding Expo values | fallback to derived defaults (local redirect URI `http://127.0.0.1:8787/callback`, prod redirect `${PROJECT_DOMAIN}/callback`, resources → `LOGTO_API_RESOURCE`) | Keeps Expo runtime aligned with worker configuration. |
| `{{EXPO_PUBLIC_WORKER_ORIGIN}}` | `env.EXPO_PUBLIC_WORKER_ORIGIN` | Worker origin derived from `WORKER_ORIGIN` → `APP_URL` → `PROJECT_DOMAIN` | Matches Expo fetch origin. |
| `{{EXPO_PUBLIC_WORKER_ORIGIN_LOCAL}}` | `env.EXPO_PUBLIC_WORKER_ORIGIN_LOCAL` | `http://127.0.0.1:8787` | Local dev default. |
| `{{PROJECT_DOMAIN}}` | `env.PROJECT_DOMAIN` | empty string | Used in vars to rebuild URLs. |
| `{{APP_BASE_URL}}` | `env.APP_BASE_URL` | `/app` | Same default as bootstrap shell. |
| `{{STRIPE_PRODUCTS}}` | `env.STRIPE_PRODUCTS` | `'[]'` | Recorded JSON string of seed products. |
| `{{EXPO_PUBLIC_WORKER_ORIGIN}}` | see above | — | Duplicate placeholder used by Expo + worker. |
| `{{CLOUDFLARE_ZONE_ID}}` | `env.CLOUDFLARE_ZONE_ID` | empty string | Optional; Wrangler tolerates blank. |
| `{{D1_DATABASE_NAME}}` | `env.CLOUDFLARE_D1_NAME` | `${PROJECT_ID}-d1` | Matches bootstrap default. |
| `{{D1_DATABASE_ID}}` | `env.D1_DATABASE_ID` or `env.CLOUDFLARE_D1_ID` | empty string | Allows persisted database UUID. |
| `{{D1_BINDING_SECTION}}` | Derived at render time | Emits a fully populated `[[d1_databases]]` block when a database ID is available **and** the account has D1 permission; otherwise a comment `# D1 binding skipped …` is written. | Keeps Wrangler config valid during degraded mode. |
| `{{R2_BUCKET_NAME}}` | `env.CLOUDFLARE_R2_BUCKET` | `${PROJECT_ID}-assets` | Aligns with bootstrap default. |
| `{{R2_BINDING_SECTION}}` | Derived at render time | Emits a `[[r2_buckets]]` block when the bucket exists and the account can manage R2; otherwise a comment `# R2 binding skipped …` is written. | Prevents deploy failures when storage permissions are missing. |
| `{{PROJECT_HOST}}` | derived | host part of `PROJECT_DOMAIN` | Currently unused but retained for completeness. |
| `{{PROJECT_ID}}.justevery.com` | literal pattern | — | Route binding uses PROJECT_ID. |

### Sample (with defaults)

```toml
name = "demo-worker"

[vars]
LOGTO_ISSUER = "https://login.demo.example/oidc"
LOGTO_JWKS_URI = "https://login.demo.example/oidc/jwks"
STRIPE_PRODUCTS = "[{\"name\":\"Founders\",\"description\":\"Founders tier\",\"prices\":[{\"amount\":2500,\"currency\":\"usd\",\"interval\":\"month\"}]}]"

# D1 binding skipped (no database ID available)

# R2 binding skipped (no bucket configured)
```

### Suggested Tests
1. Rendering fills all placeholders and stays deterministic given identical env input.
2. `renderWranglerConfig` writes `workers/api/wrangler.toml` and reports `changed` on the first run but not subsequent runs.
3. `--check` mode exits with an error when `wrangler.toml` differs from the rendered output.

### Degraded Cloudflare Mode

When the bootstrap CLI detects that the current Cloudflare credentials lack D1 and/or R2 permissions, the renderer keeps the resulting config deployable by:

- Substituting `{{D1_BINDING_SECTION}}` with a comment that explains the binding was skipped.
- Substituting `{{R2_BINDING_SECTION}}` with a similar comment for the bucket binding.
- Leaving the rest of the template untouched, so a worker-only deploy can still succeed.

Once the account gains the necessary permissions and the next apply run discovers real IDs, the rendered config automatically flips back to the full binding blocks without any manual edits.
