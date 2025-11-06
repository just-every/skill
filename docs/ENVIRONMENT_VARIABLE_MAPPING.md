# Environment Variable Mapping

The bootstrap CLI resolves configuration from multiple layers:

1. `.env` (and `~/.env` if sourced) – developer-provided secrets and overrides.
2. `.env.local.generated` – written by `pnpm bootstrap:env`; contains derived values used by the Expo web app.
3. `workers/api/wrangler.toml` – rendered by `pnpm bootstrap:deploy`; exposes Worker vars and bound services.
4. `workers/api/.dev.vars` – local overrides consumed by `wrangler dev`.

Always export `.env` before running CLI commands:

```bash
set -a
source ~/.env
set +a
```

## Quick Reference

| Key | Source | Default / Derivation | Consumed By |
| --- | --- | --- | --- |
| `PROJECT_ID` | `.env` (required) | – | Worker name, D1/R2 names, routes |
| `PROJECT_NAME` | `.env` (required for packages/config) | – | packages/config, UI copy |
| `PROJECT_DOMAIN` | `.env` (required for packages/config) | – | Worker routes, smoke checks; used for auto-derivations |
| `APP_BASE_URL` | `.env` (optional) | `/app` | Derives `APP_URL` |
| `APP_URL` | `.env` (optional) | **Auto-derived**: `${PROJECT_DOMAIN}${APP_BASE_URL \|\| '/app'}` | packages/config, web runtime |
| `WORKER_ORIGIN` | `.env` (optional) | **Auto-derived**: `${PROJECT_DOMAIN}` | Worker origin for API calls |
| `E2E_BASE_URL` | `.env` (optional) | Fallback `PROJECT_DOMAIN` | Playwright / smoke |
| `CLOUDFLARE_ACCOUNT_ID` | `.env` (required) | – | CF API calls, GitHub workflows |
| `CLOUDFLARE_API_TOKEN` | `.env` (required) | – | Provision + deploy |
| `CLOUDFLARE_ZONE_ID` | `.env` (optional) | – | Route assertions |
| `CLOUDFLARE_R2_BUCKET` | `.env` (optional) | `<PROJECT_ID>-assets` | R2 provisioning |
| `D1_DATABASE_NAME` | `.env`/generated | `<PROJECT_ID>-d1` | Wrangler `[d1_databases]` |
| `LOGTO_MANAGEMENT_ENDPOINT` | `.env` (optional) | – | Bootstrap Logto provisioning |
| `LOGTO_MANAGEMENT_AUTH_BASIC` | `.env` (optional) | – | Logto management token |
| `LOGTO_ENDPOINT` | `.env` (required) | – | Worker + Expo vars |
| `LOGTO_ISSUER` | `.env` or derived | `${LOGTO_ENDPOINT}/oidc` (defaulted when rendering Wrangler config) | packages/config validation |
| `LOGTO_JWKS_URI` | `.env` or derived | `${LOGTO_ENDPOINT}/oidc/jwks` (defaulted when rendering Wrangler config) | packages/config validation |
| `LOGTO_API_RESOURCE` | `.env` (optional) | **Auto-derived**: `${PROJECT_DOMAIN}/api` | Worker auth checks |
| `LOGTO_APPLICATION_ID` | `.env`/generated | Created when absent | Worker secret + Expo |
| `STRIPE_SECRET_KEY` | `.env` (required) | **Fallback**: `STRIPE_TEST_SECRET_KEY` | Worker secret + bootstrap Stripe provisioning |
| `STRIPE_TEST_SECRET_KEY` | `.env` (optional) | – | Development alias for `STRIPE_SECRET_KEY` |
| `STRIPE_PRODUCTS` | `.env` (optional) | JSON array (recommended) or legacy semicolon format | Bootstrap Stripe product/price provisioning |
| `STRIPE_WEBHOOK_URL` | `.env` (optional) | `${PROJECT_DOMAIN}/api/webhooks/stripe` | Bootstrap webhook endpoint provisioning |
| `STRIPE_WEBHOOK_SECRET` | `.env.local.generated` | Created/retrieved via bootstrap | Worker secret for webhook validation |
| `STRIPE_PRODUCT_IDS` | `.env.local.generated` | Comma-separated product IDs | Reference to provisioned Stripe products |
| `STRIPE_PRICE_IDS` | `.env.local.generated` | Comma-separated price IDs | Reference to provisioned Stripe prices |
| `EXPO_PUBLIC_*` | `.env` (optional) | – | Expo runtime (`apps/web/src/runtimeEnv.ts`) |
| `EXPO_PUBLIC_WORKER_ORIGIN` | `.env` (optional) | `PROJECT_DOMAIN` | Web API base |
| `EXPO_PUBLIC_WORKER_ORIGIN_LOCAL` | `.env` | `http://127.0.0.1:8787` | Local web dev |
| `LOGTO_TOKEN` | `.env` (optional) | – | Smoke authenticated requests |

## Automatic Fallbacks & Derivations

The bootstrap CLI applies these fallbacks and derivations **before** schema validation (see `packages/bootstrap-cli/src/env.ts:189-221`), reducing required `.env` entries:

### Fallbacks (aliases)
- **`STRIPE_SECRET_KEY`** ← `STRIPE_TEST_SECRET_KEY`
  If `STRIPE_SECRET_KEY` is missing but `STRIPE_TEST_SECRET_KEY` is present, the test key is used as the secret key. This allows developers to use `STRIPE_TEST_SECRET_KEY` in `.env` without duplicating the value into `STRIPE_SECRET_KEY`.

### Auto-derived values
- **`LOGTO_API_RESOURCE`** ← `${PROJECT_DOMAIN}/api`
  When missing, automatically derived from `PROJECT_DOMAIN` with `/api` appended. Trailing slashes are removed from `PROJECT_DOMAIN` before concatenation.

- **`APP_URL`** ← `${PROJECT_DOMAIN}${APP_BASE_URL || '/app'}`
  When missing, derived from `PROJECT_DOMAIN` + `APP_BASE_URL` (defaults to `/app` if not provided). Trailing slashes are removed from `PROJECT_DOMAIN`, and `APP_BASE_URL` is normalized to start with `/` if it doesn't already.

- **`WORKER_ORIGIN`** ← `${PROJECT_DOMAIN}`
  When missing, defaults to `PROJECT_DOMAIN` with trailing slashes removed.

Use the checked-in `.env.example` as a baseline. At minimum you should provide:
- `PROJECT_ID`, `PROJECT_NAME`, `PROJECT_DOMAIN`, and `APP_URL`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`
- `LOGTO_ENDPOINT`, `LOGTO_ISSUER`, `LOGTO_JWKS_URI`
- Either `STRIPE_SECRET_KEY` or `STRIPE_TEST_SECRET_KEY` (if provisioning Stripe products)

Other values can be omitted and will fall back as described above.

## STRIPE_PRODUCTS Format

The `STRIPE_PRODUCTS` environment variable defines products and prices for automated Stripe provisioning. Two formats are supported:

### JSON Format (Recommended)
The JSON format is the primary method and supports rich product definitions with descriptions, multiple prices per product, and metadata:

```json
[
  {
    "name": "Founders",
    "description": "Founders tier",
    "prices": [
      {
        "amount": 2500,
        "currency": "usd",
        "interval": "month"
      }
    ]
  },
  {
    "name": "Scale",
    "description": "Scale tier",
    "prices": [
      {
        "amount": 4900,
        "currency": "usd",
        "interval": "month"
      }
    ]
  }
]
```

**Example in .env:**
```bash
STRIPE_PRODUCTS='[{"name":"Founders","description":"Founders tier","prices":[{"amount":2500,"currency":"usd","interval":"month"}]},{"name":"Scale","description":"Scale tier","prices":[{"amount":4900,"currency":"usd","interval":"month"}]}]'
```

### Legacy Semicolon Format
For backward compatibility, the legacy semicolon-separated format is also supported:

```
Founders:2500,usd,month;Scale:4900,usd,month
```

Format: `ProductName:amount,currency[,interval];NextProduct:amount,currency[,interval]`
- **ProductName**: Name of the product
- **amount**: Price in cents (e.g., 2500 = $25.00)
- **currency**: ISO currency code (e.g., usd, eur, gbp)
- **interval**: (optional) Billing interval: day, week, month, or year. Defaults to `month` if omitted.

**Note:** The legacy format is normalized to the JSON structure internally. Use JSON for new deployments to access descriptions, multiple prices, metadata, and future schema extensions.

## Sample `.env`

The repository ships with an up-to-date `.env.example` that demonstrates a minimal, production-like configuration using JSON `STRIPE_PRODUCTS`, Cloudflare credentials, and Logto endpoints. Copy it as a starting point and substitute your own secrets before running `pnpm bootstrap:*` commands.

## Files & Responsibilities

- `.env` – developer maintained; checked in sample `.env.example`.
- `.env.local.generated` – regenerate with `pnpm bootstrap:env`; **do not edit manually**.
- `workers/api/wrangler.toml.template` – template rendered into `wrangler.toml`; maps env vars into Worker `vars`, `d1_databases`, and `r2_buckets`.
- `workers/api/.dev.vars.example` – template for local Wrangler dev secrets.
- `docs/WRANGLER_TEMPLATE_MAPPING.md` – breakdown of template placeholders (see alongside this doc).

## Validation Tips

- Run `pnpm bootstrap:preflight -- --check` after editing `.env`; it fails fast when required keys are missing.
- `pnpm bootstrap:env -- --check` reports diffs without writing files (useful in CI).
- `pnpm bootstrap:deploy -- --dry-run` renders `wrangler.toml` without pushing.
- `pnpm bootstrap:smoke -- --base <url>` verifies runtime endpoints; pass `--token` to exercise authenticated calls.

See `docs/WRANGLER_TEMPLATE_MAPPING.md` for template-to-env expansion details.
