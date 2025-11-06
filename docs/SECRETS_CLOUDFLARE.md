# Cloudflare Secrets Setup Guide

This guide explains how to obtain and configure the required Cloudflare credentials for local development and GitHub Actions deployments.

## Required Secrets

The following Cloudflare secrets are required for deployment:

| Secret | Purpose | Where Used |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Identify your Cloudflare account | Wrangler, GitHub workflows |
| `CLOUDFLARE_API_TOKEN` | Authenticate API calls for provisioning and deployment | Wrangler, GitHub workflows |
| `CLOUDFLARE_ZONE_ID` | (Optional) Claim DNS records and route assertions | GitHub workflows, route validation |

## Getting Your Account ID

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. In the top-right corner, click your profile avatar and select **Account Settings**
3. On the left sidebar, select **Accounts**
4. Locate your account and copy the **Account ID** (a 32-character alphanumeric string)

Example:
```
CLOUDFLARE_ACCOUNT_ID=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

## Creating an API Token

### Recommended: Limited Token (Least Privilege)

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Under **Custom token**, click **Get started**
4. Configure the token:
   - **Token name**: `cloudflare-worker-deploy` (or similar)
   - **Permissions**:
     - Account → Cloudflare Workers → Edit
     - Account → Cloudflare Workers Routes → Edit
     - Account → Cloudflare Workers Secrets → Edit
     - Account → Cloudflare Workers KV → Edit
     - Account → Account Settings → Read (for validation)
   - **Account Resources**: Select your account
   - **TTL** (optional): Set an expiration date for security (e.g., 90 days)
5. Click **Continue to summary** → **Create Token**
6. Copy the token immediately—you won't see it again

Example token format:
```
CLOUDFLARE_API_TOKEN=v1.0xxxxxxxxxxxxxxxxxxxxxxxx
```

### Alternative: Global API Key (Not Recommended)

If you prefer using your global API key:

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Scroll to **API Keys** section
3. Click **View** next to the Global API Key
4. Copy the key
5. Use your Cloudflare **email** as the username (set `CLOUDFLARE_API_EMAIL`)

⚠️ **Security Note**: Global API keys have full account access. The limited token approach above is strongly recommended.

## Finding Your Zone ID (Optional)

Zone IDs are only needed if you're managing DNS records through Cloudflare:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your domain
3. On the **Overview** tab, scroll to **API** section on the right
4. Copy the **Zone ID** (a 32-character alphanumeric string)

Example:
```
CLOUDFLARE_ZONE_ID=f1e2d3c4b5a6g7h8i9j0k1l2m3n4o5p6
```

## Local Setup

### 1. Add Secrets to `~/.env`

Create or edit `~/.env` in your home directory with the credentials:

```bash
# Required
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
CLOUDFLARE_API_TOKEN=<your-api-token>

# Optional (only needed if managing DNS)
CLOUDFLARE_ZONE_ID=<your-zone-id>
```

### 2. Source the Environment

Before running bootstrap or deployment commands, export the secrets:

```bash
set -a
source ~/.env
set +a
```

Alternatively, add to your shell profile (`.bashrc`, `.zshrc`, etc.):

```bash
set -a
[ -f ~/.env ] && source ~/.env
set +a
```

### 3. Validate Credentials

Run the preflight check to ensure your credentials are valid:

```bash
pnpm bootstrap:preflight
```

Expected output:
```
✓ Wrangler authenticated
✓ Required environment variables present
✓ Cloudflare account accessible
```

## Capability Detection & Degraded Mode

Every bootstrap flow (`pnpm bootstrap:env`, `pnpm bootstrap:deploy`, and `pnpm bootstrap:apply`) now runs a quick capability probe before talking to Cloudflare. The task reports three signals:

```
Detect Cloudflare capabilities → ✓ authenticated, ✗ D1, ✗ R2
```

- **Authenticated** indicates the API token is valid for the current account.
- **D1** and **R2** confirm whether the token can manage those resources. Limited tokens frequently omit these scopes.

If either storage permission is missing, the CLI automatically enters a degraded worker-only mode:

- Cloudflare steps for the missing resource are marked `[skipped]` instead of failing the run.
- The rendered Wrangler template substitutes `{{D1_BINDING_SECTION}}` / `{{R2_BINDING_SECTION}}` with explanatory comments so the deploy still succeeds.
- `.env.local.generated` records blank values for the skipped identifiers (for example, `CLOUDFLARE_R2_BUCKET=`) to signal downstream tooling that the resource is intentionally absent.

You can continue to deploy and validate the worker with the starter credentials in `.env`. Once full permissions are granted, re-run `bootstrap:apply`—the same flow detects the new capabilities, provisions the resources, and repopulates the bindings without a manual reset.

## GitHub Actions Setup

### 1. Add Secrets to Repository

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each value:
   - **Name**: `CLOUDFLARE_ACCOUNT_ID` → **Secret**: Your account ID
   - **Name**: `CLOUDFLARE_API_TOKEN` → **Secret**: Your API token
   - **Name**: `CLOUDFLARE_ZONE_ID` → **Secret**: Your zone ID (optional)

### 2. Verify Workflows Can Access Secrets

The deployment workflow (`deploy.yml`) uses these secrets:

```yaml
env:
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  CLOUDFLARE_ZONE_ID: ${{ secrets.CLOUDFLARE_ZONE_ID }}
```

They are automatically available to all steps in the workflow.

## Token Rotation & Renewal

### When to Rotate

- After a team member leaves
- If the token is accidentally exposed
- On a regular schedule (e.g., annually)
- When updating permissions

### How to Rotate

1. Create a new API token (follow the **Creating an API Token** section above)
2. Test the new token locally:
   ```bash
   CLOUDFLARE_API_TOKEN=<new-token> pnpm bootstrap:preflight
   ```
3. Update `~/.env` locally
4. Update the `CLOUDFLARE_API_TOKEN` secret in GitHub:
   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Click the pencil icon next to `CLOUDFLARE_API_TOKEN`
   - Paste the new token and click **Update secret**
5. (Optional) Delete the old token from Cloudflare API Tokens page

## Troubleshooting

### "Invalid API token" error

```
Error: Invalid API token
```

**Solutions:**
- Verify the token hasn't expired
- Check you copied the full token (including `v1.0` prefix if present)
- Ensure the token has the required permissions
- Re-create the token if unsure

### "Account not found" error

```
Error: Cloudflare account not accessible
```

**Solutions:**
- Double-check the Account ID is correct (32 characters)
- Verify your API token has **Account Settings → Read** permission
- Try the preflight check: `pnpm bootstrap:preflight`

### "Insufficient permissions" error

```
Error: User does not have permission to access this account
```

**Solutions:**
- Review the token's permissions in Cloudflare dashboard
- Ensure it includes:
  - `Account → Cloudflare Workers → Edit`
  - `Account → Cloudflare Workers Routes → Edit`
  - `Account → Cloudflare Workers Secrets → Edit`
- Re-create the token with correct scopes if needed

### GitHub Actions fail with "secret not found"

```
Error: Secret CLOUDFLARE_API_TOKEN is not set
```

**Solutions:**
- Verify the secret is added to the repository (Settings → Secrets)
- Check the secret name matches exactly (case-sensitive)
- Wait a few minutes after adding—secrets may take time to sync
- Look for any typos in the workflow file

## Security Best Practices

1. **Use Limited Tokens**: Create tokens with minimal required permissions (not global API keys)
2. **Set Expiration**: Use TTL on tokens to limit exposure window
3. **Store Safely**: Never commit secrets to git; use `~/.env` locally and GitHub Secrets in CI
4. **Rotate Regularly**: Establish a rotation schedule (e.g., every 90 days)
5. **Monitor Access**: Review API token usage in Cloudflare Analytics
6. **Use Different Tokens**: Consider separate tokens for local dev vs. GitHub Actions
7. **Scope by Account**: Tokens are scoped to a single Cloudflare account (not global)

## Related Documentation

- [ENVIRONMENT_VARIABLE_MAPPING.md](./ENVIRONMENT_VARIABLE_MAPPING.md) – Full list of all environment variables
- [QUICKSTART.md](./QUICKSTART.md) – Quick setup guide for new developers
- [WRANGLER_TEMPLATE_MAPPING.md](./WRANGLER_TEMPLATE_MAPPING.md) – Details on template expansion
- [Cloudflare API Token Documentation](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Wrangler Authentication Guide](https://developers.cloudflare.com/workers/wrangler/install-and-update/#authenticate-with-wrangler)
