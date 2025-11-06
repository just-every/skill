# Shell-to-CLI Migration Mapping

Legacy shell helpers have been removed; refer to `packages/bootstrap-cli` for the canonical implementation.

---

## Target Architecture

```
cli/
├── src/
│   ├── index.ts              # Entry point, CLI framework
│   ├── env.ts                # Env validation & resolution (leverages packages/config)
│   ├── providers/
│   │   ├── cloudflare.ts     # D1, R2, Wrangler ops
│   │   ├── logto.ts          # App, resource, M2M provisioning
│   │   └── stripe.ts         # Products, prices, webhooks
│   ├── runtime.ts            # Secret sync, config templating, migrations
│   └── deploy.ts             # Worker deployment, post-deploy notes
└── package.json              # CLI dependencies
```

---

## 1. common.sh → env.ts + shared utilities

### Functions

| Shell Function | Target Module | Notes |
|----------------|---------------|-------|
| `log_info/warn/error` | `env.ts` or `cli/logger.ts` | Use chalk/picocolors for color; export typed logger |
| `to_lower` | Inline `.toLowerCase()` | Native JS string method |
| `require_command` | `env.ts::assertCommand()` | Use `which` package or `child_process.spawnSync('which', [cmd])` |
| `load_env_file` | `env.ts::loadEnvFile()` | Use `dotenv` or custom parser (see `deploy-worker.cjs:22-32`) |
| `format_env_value` | `env.ts::formatEnvValue()` | Shell quoting → JSON.stringify or custom escaper |
| `print_env_line` | `env.ts::printEnvLine()` | Return `key=value` string for file write |
| `ensure_var` | `env.ts::ensureVar()` | Throw if missing; leverage `packages/config/src/env.ts::resolveEnv()` |
| `escape_sed` | `runtime.ts::escapeSed()` | Use `.replace(/[&\/]/g, '\\$&')` for template substitution |
| `run_cmd`, `run_cmd_capture` | `shared/exec.ts` | Wrap `child_process.spawnSync` with typed options |
| `read_generated_value` | `env.ts::readGeneratedValue()` | Parse `.env.local.generated` using dotenv or regex |
| `extract_origin` | `env.ts::extractOrigin()` | Use `new URL(url).origin` |
| `extract_host_from_url` | `env.ts::extractHost()` | Use `new URL(url).hostname` |
| `prepare_cloudflare_env` | `providers/cloudflare.ts` | Warn if `CLOUDFLARE_ZONE_ID` unset |

### Required Envs
- None (utilities only)

### Side Effects
- Console output (logging)
- Exit on command missing or env validation failure

### Idempotency
- Stateless utilities; safe to call multiple times

### Tests
- `env.test.ts`: validate URL parsing, env resolution
- `logger.test.ts`: verify color output (snapshot test)
- `exec.test.ts`: mock spawn, assert exit codes

---

## 2. cloudflare.sh → providers/cloudflare.ts

### Functions

| Shell Function | Target Function | Signature | Notes |
|----------------|-----------------|-----------|-------|
| `detect_wrangler` | `detectWrangler()` | `() => Promise<string[]>` | Return path array; check local bin → global → npx |
| `wrangler_cmd` | `wranglerCmd()` | `(args: string[]) => Promise<ExecResult>` | Execute wrangler with config path |
| `ensure_cloudflare_auth` | `ensureAuth()` | `() => Promise<void>` | Run `wrangler whoami`; throw if unauthenticated |
| `wrangler_d1_list` | `listD1Databases()` | `() => Promise<D1Database[]>` | Parse JSON from `wrangler d1 list --json` |
| `ensure_d1` | `ensureD1()` | `(name: string) => Promise<{id: string, name: string}>` | Idempotent create or return existing |
| `ensure_r2` | `ensureR2()` | `(bucket: string) => Promise<{id: string, name: string}>` | Idempotent create or return existing |
| `update_wrangler_config` | `updateWranglerConfig()` | `(vars: Record<string, string>) => Promise<void>` | Template `wrangler.toml.template` → `wrangler.toml` |
| `run_migrations` | `runMigrations()` | `(remote: boolean) => Promise<void>` | Call `workers/api/scripts/migrate.js` |
| `get_d1_database_name` | `getD1Name()` | `() => string` | Parse from `wrangler.toml` or fallback to `${PROJECT_ID}-d1` |
| `seed_project` | `seedProject()` | `(opts: SeedOpts) => Promise<void>` | Insert/upsert project row via `wrangler d1 execute` |
| `upload_r2_placeholder` | `uploadR2Placeholder()` | `(bucket: string) => Promise<void>` | PUT welcome.txt via `wrangler r2 object put` |

### Required Envs
- `CLOUDFLARE_ACCOUNT_ID` (optional but recommended)
- `PROJECT_ID`
- `PROJECT_DOMAIN`
- `APP_URL`

### Side Effects
- Creates D1 database (if missing)
- Creates R2 bucket (if missing)
- Writes `workers/api/wrangler.toml`
- Backs up existing `wrangler.toml` to `.backup`
- Runs migrations against local + remote D1
- Seeds project row in D1
- Uploads placeholder to R2

### Idempotency
- ✅ `ensureD1`: checks list before creating
- ✅ `ensureR2`: checks list before creating
- ✅ `updateWranglerConfig`: overwrites safely with backup
- ✅ `seedProject`: uses `ON CONFLICT DO UPDATE`
- ✅ `uploadR2Placeholder`: object PUT is idempotent

### Suggested Tests
- Mock `wrangler d1 list --json` → verify parse logic
- Mock `wrangler d1 create` → assert not called if exists
- Verify template substitution with known vars
- Assert backup file created before overwrite
- Mock `wrangler d1 execute` → verify SQL contains `ON CONFLICT`
- E2E test: run twice, assert no duplicate resources

---

## 3. logto.sh → providers/logto.ts

### Functions

| Shell Function | Target Function | Signature | Notes |
|----------------|-----------------|-----------|-------|
| `mint_logto_management_token` | `mintManagementToken()` | `() => Promise<string>` | POST to `/oidc/token` with Basic auth |
| `derive_logto_defaults` | `deriveDefaults()` | `(env: Partial<Env>) => LogtoConfig` | Calculate issuer, JWKS, API resource from endpoint |
| `build_logto_application_payload` | `buildAppPayload()` | `(opts: AppOpts) => object` | Return typed JSON for POST/PATCH |
| `reconcile_logto_application_metadata` | `reconcileApp()` | `(id: string, opts: AppOpts) => Promise<{id: string}>` | PATCH if metadata differs; idempotent |
| `ensure_logto_application` | `ensureApplication()` | `(opts: AppOpts) => Promise<{id: string, secret?: string}>` | Create SPA app or reconcile existing |
| `ensure_logto_api_resource` | `ensureApiResource()` | `(indicator: string) => Promise<{id: string}>` | Create API resource or return existing |
| `ensure_logto_m2m_application` | `ensureM2MApp()` | `(name?: string) => Promise<{id: string, secret: string}>` | Create M2M app for smoke tests |
| `logto_post_deploy_note` | `postDeployNote()` | `() => void` | Log redirect URI instructions |

### Required Envs
- `LOGTO_MANAGEMENT_ENDPOINT`
- `LOGTO_MANAGEMENT_AUTH_BASIC` (Base64 client_id:client_secret)
- `LOGTO_ENDPOINT` (can derive from management endpoint)
- `PROJECT_DOMAIN`

### Side Effects
- Exports `LOGTO_MANAGEMENT_TOKEN` (in-memory cache)
- Creates Logto SPA application (if missing)
- Updates redirect URIs on existing app
- Creates API resource (if missing)
- Creates M2M application (if missing)
- Logs post-deploy instructions

### Idempotency
- ✅ Token minting: caches in memory (skip if already set)
- ✅ `ensureApplication`: searches by name before creating
- ✅ `reconcileApp`: PATCHes only if metadata differs
- ✅ `ensureApiResource`: searches by indicator before creating
- ✅ `ensureM2MApp`: searches by name/type before creating

### Suggested Tests
- Mock token endpoint → verify Bearer token returned
- Mock app list → assert no POST if name exists
- Mock app GET → verify PATCH triggered when redirect URIs differ
- Mock app PATCH failure → assert fallback to create
- Mock resource list → verify no POST if indicator exists
- Snapshot test: verify redirect URI arrays built correctly

---

## 4. stripe.sh → providers/stripe.ts

### Functions

| Shell Function | Target Function | Signature | Notes |
|----------------|-----------------|-----------|-------|
| `resolve_stripe_secret` | `resolveSecret()` | `(mode: 'test' \| 'live') => {key: string, mode: string, source: string}` | Pick test/live key |
| `parse_stripe_products` | `parseProducts()` | `(raw: string) => Product[]` | Split `;`-delimited format → typed array |
| `provision_stripe_products` | `provisionProducts()` | `(products: Product[]) => Promise<StripeProductMap[]>` | Create product+price pairs |
| `ensure_stripe_webhook` | `ensureWebhook()` | `(url: string, events: string[]) => Promise<{id: string, secret: string}>` | Create or reconcile webhook endpoint |
| `stripe_post_deploy_note` | `postDeployNote()` | `() => void` | Log webhook secret instructions |

### Required Envs
- `STRIPE_SECRET_KEY` OR `STRIPE_TEST_SECRET_KEY` / `STRIPE_LIVE_SECRET_KEY`
- `STRIPE_MODE` (default: `test`)
- `PROJECT_ID`
- `PROJECT_DOMAIN`

### Side Effects
- Creates Stripe products (with metadata `project_id`)
- Creates Stripe prices linked to products
- Creates webhook endpoint at `${PROJECT_DOMAIN}/webhook/stripe`
- Rotates webhook secret if missing after GET
- Deletes duplicate webhooks if `STRIPE_PRUNE_DUPLICATE_WEBHOOKS=1`
- Exports `STRIPE_PRODUCT_IDS`, `STRIPE_WEBHOOK_ENDPOINT_ID`, `STRIPE_WEBHOOK_SECRET`

### Idempotency
- ✅ `provisionProducts`: searches by name + `metadata.project_id` before creating
- ✅ Price creation: searches existing prices by amount/currency/interval
- ✅ `ensureWebhook`: searches by URL before creating
- ⚠️ Webhook secret rotation: if secret unavailable, re-creates endpoint (intentional fallback)

### Suggested Tests
- Verify product parsing: `"Pro:2000,usd,month;Ent:5000,usd,year"` → array of 2
- Mock Stripe API: list products → assert no POST if match exists
- Mock price list → verify price reused if params match
- Mock webhook list → verify no POST if URL exists
- Mock webhook GET with missing secret → assert rotation or recreation triggered
- E2E test: run twice, assert product/webhook count unchanged

---

## 5. expo.sh → runtime.ts (partial)

### Functions

| Shell Function | Target Function | Signature | Notes |
|----------------|-----------------|-----------|-------|
| `write_expo_env_file` | N/A | — | Shell exports suffice; CLI skips `.env.local` writes |
| `export_expo_runtime_vars` | `resolveExpoVars()` | `(base: Env) => ExpoEnv` | Derive `EXPO_PUBLIC_*` from Logto/Worker envs |
| `build_web_bundle` | `buildWebBundle()` | `() => Promise<void>` | Run `pnpm build` in `apps/web` with exported vars |

### Required Envs
- `PROJECT_DOMAIN`
- `LOGTO_ENDPOINT`
- `LOGTO_APPLICATION_ID`
- `LOGTO_API_RESOURCE`

### Side Effects
- Exports `EXPO_PUBLIC_*` vars to environment (process.env)
- Runs `pnpm build` or `npm run build` in `apps/web`

### Idempotency
- ✅ Env var derivation: pure function
- ✅ Build: rebuilds dist on each run (expected)

### Suggested Tests
- Verify `EXPO_PUBLIC_LOGTO_ENDPOINT` defaults to `LOGTO_ENDPOINT`
- Verify `EXPO_PUBLIC_LOGTO_REDIRECT_URI_PROD` derived from `PROJECT_DOMAIN`
- Verify `EXPO_PUBLIC_WORKER_ORIGIN` extracts origin from `APP_URL`
- Mock `pnpm` → verify build called with correct env

---

## 6. runtime.sh → runtime.ts + deploy.ts

### Functions

| Shell Function | Target Function | Target Module | Signature | Notes |
|----------------|-----------------|---------------|-----------|-------|
| `ensure_worker_secret` | `ensureWorkerSecret()` | `runtime.ts` | `(name: string, value: string) => Promise<void>` | Skip if local mode; run `wrangler secret put` |
| `sync_worker_secrets` | `syncWorkerSecrets()` | `runtime.ts` | `(secrets: Record<string, string>) => Promise<void>` | Batch sync via `ensureWorkerSecret` |
| `deploy_worker` | `deployWorker()` | `deploy.ts` | `() => Promise<void>` | Run `wrangler deploy` |
| `write_generated_env` | `writeGeneratedEnv()` | `runtime.ts` | `(vars: Record<string, any>) => Promise<void>` | Write `.env.local.generated` |
| `post_deploy_guidance` | `postDeployGuidance()` | `deploy.ts` | `() => void` | Call Logto/Stripe note functions |

### Required Envs
- `BOOTSTRAP_DEPLOY` (controls remote secret sync)
- All provider-specific envs (passed through)

### Side Effects
- Syncs Worker secrets via `wrangler secret put` (remote only)
- Deploys Worker via `wrangler deploy`
- Writes `.env.local.generated`
- Logs post-deploy instructions

### Idempotency
- ✅ `ensureWorkerSecret`: wrangler secret put is idempotent (upsert)
- ✅ `writeGeneratedEnv`: overwrites file
- ✅ `deployWorker`: wrangler deploy is idempotent

### Suggested Tests
- Mock `wrangler secret put` → verify stdin contains secret value
- Mock `wrangler deploy` → verify exit 0
- Verify `.env.local.generated` format matches shell output
- Snapshot test: post-deploy notes

---

## Cross-Cutting Concerns

### Logging
- Use `chalk` or `picocolors` for colored output
- Export typed logger: `logger.info()`, `logger.warn()`, `logger.error()`
- Prefix: `[info]`, `[warn]`, `[error]` to match shell output

### Error Handling
- Throw typed errors from provider functions
- Catch at CLI entry point → log + exit(1)
- Preserve shell exit codes (0 = success, 1 = error)

### Env Resolution
- Leverage `packages/config/src/env.ts::resolveEnv()` for base validation
- Extend with provider-specific vars (e.g., `LOGTO_MANAGEMENT_AUTH_BASIC`)
- Use dotenv or custom parser to read `~/.env`, `.env`, `.env.local.generated`

### Exec Wrapper
- Wrap `child_process.spawnSync` in `exec(cmd: string, args: string[], opts?: ExecOpts)`
- Return `{stdout: string, stderr: string, exitCode: number}`
- Throw if `exitCode !== 0` (unless `opts.ignoreError = true`)

### Template Substitution
- Replace sed with string `.replace()` or template engine (handlebars/mustache)
- Use `escapeSed()` for regex-safe value escaping
- Maintain 1:1 mapping with shell template vars

---

## Implementation Sequence

1. **Shared utilities** (`env.ts`, `logger.ts`, `exec.ts`)
   - Port logging, env parsing, command detection
   - Add unit tests

2. **Cloudflare provider** (`providers/cloudflare.ts`)
   - Port D1, R2, Wrangler config, migrations, seeding
   - Add integration tests (mock wrangler calls)

3. **Logto provider** (`providers/logto.ts`)
   - Port token minting, app/resource/M2M provisioning
   - Add integration tests (mock Logto API)

4. **Stripe provider** (`providers/stripe.ts`)
   - Port product/price/webhook provisioning
   - Add integration tests (mock Stripe API)

5. **Runtime/Deploy** (`runtime.ts`, `deploy.ts`)
   - Port secret sync, env file writing, deployment
   - Add E2E test with real `.env.local.generated` output

6. **CLI entry point** (`index.ts`)
   - Wire up all providers
   - Add `--help`, `--dry-run`, `--deploy` flags
   - Add E2E test replicating full `./bootstrap.sh` flow

---

## Validation Strategy

### Unit Tests
- Mock all external commands (`wrangler`, `curl`, `jq`)
- Assert function inputs/outputs
- Verify idempotency checks (e.g., "if exists, skip create")

### Integration Tests
- Use `nock` to mock HTTP APIs (Logto, Stripe)
- Verify request payloads match shell curl commands
- Assert error handling (auth failure, quota limits)

### E2E Tests
- Run CLI against local Miniflare + mock APIs
- Compare `.env.local.generated` output with shell version
- Verify `wrangler.toml` templated correctly
- Run twice → assert no duplicate resources created

### Idempotency Test
- Run CLI twice with same env
- Assert no "Creating new..." log lines on second run
- Query Cloudflare/Stripe APIs → verify resource count unchanged

---

## Migration Checklist

- [ ] Create `cli/` directory structure
- [ ] Port `common.sh` → `env.ts` + `logger.ts` + `exec.ts`
- [ ] Port `cloudflare.sh` → `providers/cloudflare.ts`
- [ ] Port `logto.sh` → `providers/logto.ts`
- [ ] Port `stripe.sh` → `providers/stripe.ts`
- [ ] Port `expo.sh` → `runtime.ts::resolveExpoVars()`
- [ ] Port `runtime.sh` → `runtime.ts` + `deploy.ts`
- [ ] Create CLI entry point (`index.ts`)
- [ ] Add unit tests for each provider
- [ ] Add integration tests with mocked APIs
- [ ] Add E2E test replicating full bootstrap
- [ ] Add idempotency validation test
- [ ] Update `package.json` with CLI script
- [ ] Document CLI usage in `docs/QUICKSTART.md`
- [ ] Archive `scripts/bootstrap/*.sh` → `docs/archive/`
- [ ] Update `bootstrap.sh` to call CLI instead of sourcing shell scripts

---

## Example CLI Usage

```bash
# Bootstrap (local mode)
npm run bootstrap

# Bootstrap + deploy
npm run bootstrap -- --deploy

# Dry run (show actions without executing)
npm run bootstrap -- --dry-run

# Validate idempotency
npm run bootstrap:validate
```

---

## Notes

- **Preserve shell compatibility**: CLI should write `.env.local.generated` in same format as `runtime.sh::write_generated_env()`
- **Incremental migration**: Keep shell scripts functional during CLI development; switch atomically when E2E tests pass
- **Error messages**: Match shell error text to ease transition for users familiar with bootstrap.sh output
- **Secrets management**: CLI reads from `~/.env` (like `deploy-worker.cjs`); no hardcoded credentials
