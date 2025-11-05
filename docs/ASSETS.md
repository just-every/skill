# Marketing Assets

## Hero Image (`marketing/hero.png`)
- **Recommended dimensions:** 1600 × 900 px (16:9).
- **Format:** PNG or WEBP with transparent or dark background.
- **Alt text:** “justevery product hero” or product-specific wording.
- **Caching:** Upload with `Cache-Control: public, max-age=31536000, immutable`.

## Upload Snippet
```bash
wrangler r2 object put demo-assets/marketing/hero.png \
  --file hero.png \
  --cache-control "public, max-age=31536000, immutable" \
  --config workers/api/wrangler.toml --remote
```

## Listing Objects
To verify assets are present:
```bash
wrangler r2 bucket list --config workers/api/wrangler.toml
```

Look for `demo-assets` in the console output. This requires the token to include R2 Storage Read scope.

## Required Cloudflare Token Scopes
- **R2 Storage: Read** (minimum, for listing objects)
- **R2 Storage: Edit** (required for uploads, updates, and deletes)

To verify your Cloudflare API token has the required scopes:
```bash
node scripts/assert-cloudflare-scopes.cjs --bucket demo-assets
```

This runs a fast validation check (via `wrangler r2 bucket list`) and provides clear error messages if scopes are missing. Create or update tokens at: https://dash.cloudflare.com/profile/api-tokens

## Notes
If no asset is present, the landing page hides the hero and smoke tests mark the check as optional (pass even when 404).
