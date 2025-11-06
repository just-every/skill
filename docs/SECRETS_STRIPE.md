# Stripe Configuration

This guide explains how to configure and provision Stripe products, prices, and webhooks using the bootstrap CLI.

## Prerequisites

1. A Stripe account (test or live mode)
2. Stripe secret key (`sk_test_*` or `sk_live_*`)
3. (Optional) Product definitions for automated provisioning

## Environment Variables

### Required

- **`STRIPE_SECRET_KEY`**: Your Stripe secret API key
  - Get from: https://dashboard.stripe.com/apikeys
  - Format: `sk_test_...` (test mode) or `sk_live_...` (live mode)
  - **Never commit this to version control**
  - **Fallback**: If `STRIPE_SECRET_KEY` is missing but `STRIPE_TEST_SECRET_KEY` is present, the test key will be used automatically

### Optional

- **`STRIPE_TEST_SECRET_KEY`**: Alternative to `STRIPE_SECRET_KEY` for development
  - If `STRIPE_SECRET_KEY` is not provided, this value will be used as the secret key automatically
  - Useful for separating test keys from production keys in your `.env` file

- **`STRIPE_PRODUCTS`**: JSON array defining products and prices to provision
  - Used by bootstrap CLI for idempotent product/price creation
  - See [Product Definitions](#product-definitions) below

- **`STRIPE_WEBHOOK_URL`**: URL for webhook endpoint
  - Default: `${PROJECT_DOMAIN}/api/webhooks/stripe`
  - Override if using a custom webhook path

### Generated (by bootstrap CLI)

These are automatically written to `.env.local.generated` after running `pnpm bootstrap:env` or `pnpm bootstrap:apply`:

- **`STRIPE_WEBHOOK_SECRET`**: Webhook signing secret (e.g., `whsec_...`)
- **`STRIPE_PRODUCT_IDS`**: Comma-separated product IDs created by bootstrap
- **`STRIPE_PRICE_IDS`**: Comma-separated price IDs created by bootstrap

## Product Definitions

Define products and prices in `.env` using the `STRIPE_PRODUCTS` variable. The format is a JSON array:

```bash
STRIPE_PRODUCTS='[
  {
    "name": "Basic Plan",
    "description": "Basic subscription tier",
    "prices": [
      {
        "amount": 999,
        "currency": "usd",
        "interval": "month"
      }
    ]
  },
  {
    "name": "Pro Plan",
    "description": "Professional subscription tier",
    "prices": [
      {
        "amount": 2999,
        "currency": "usd",
        "interval": "month"
      },
      {
        "amount": 29990,
        "currency": "usd",
        "interval": "year"
      }
    ],
    "metadata": {
      "featured": "true"
    }
  }
]'
```

### Legacy Semicolon Format

For backward compatibility, a legacy semicolon-separated format is also supported:

```bash
STRIPE_PRODUCTS="Founders:2500,usd,month;Scale:4900,usd,month"
```

Format: `ProductName:amount,currency[,interval];NextProduct:amount,currency[,interval]`

**Note:** The legacy format is normalized to the JSON structure internally. Use the JSON format (above) for new deployments to access all available product and price configuration options like descriptions and metadata.

### Product Schema

- **`name`** (required): Display name of the product
- **`description`** (optional): Product description
- **`prices`** (required): Array of price definitions
- **`metadata`** (optional): Additional key-value metadata

### Price Schema

- **`amount`** (required): Price in cents (e.g., 999 = $9.99)
- **`currency`** (required): Three-letter ISO currency code (e.g., "usd")
- **`interval`** (optional): Billing interval for recurring prices ("day", "week", "month", "year")
- **`interval_count`** (optional): Number of intervals between billings (default: 1)
- **`metadata`** (optional): Additional key-value metadata

## Idempotent Provisioning

The bootstrap CLI uses metadata-based deduplication to ensure idempotent provisioning:

1. **Products** are matched by `metadata.idempotency_key` = `bootstrap:{PROJECT_ID}:{product_name}`
2. **Prices** are matched by `metadata.idempotency_key` = `bootstrap:{PROJECT_ID}:{product_name}:price:{amount}:{currency}:{interval}:{interval_count}`
3. **Webhooks** are matched by URL or `metadata.idempotency_key` = `bootstrap:{PROJECT_ID}:webhook`

### Behavior

- **Existing resources**: No changes are made if metadata matches and configuration is identical
- **Configuration changes**:
  - For products: Existing product is reused, only missing prices are created
  - For prices: New price is created (Stripe prices are immutable), old price remains active
  - For webhooks: Events list is updated if it differs
- **Duplicates**: Warnings are issued if duplicate webhooks are detected

## Bootstrap Commands

### Check Plan

Preview what will be provisioned without making changes:

```bash
pnpm bootstrap:preflight
```

### Apply Configuration

Provision products, prices, and webhook:

```bash
pnpm bootstrap:apply
```

Or dry-run to see what would happen:

```bash
pnpm bootstrap:apply --dry-run
```

### Generate Environment Files

Provision Stripe resources and update `.env.local.generated`:

```bash
pnpm bootstrap:env
```

Check for differences without writing:

```bash
pnpm bootstrap:env --check
```

## Webhook Events

The bootstrap CLI automatically configures webhooks with these events:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

The webhook secret is automatically persisted to `.env.local.generated` and `workers/api/.dev.vars` for validation.

## Example Workflow

1. **Set up `.env`**:

```bash
PROJECT_ID=myapp
PROJECT_DOMAIN=https://myapp.example.com
STRIPE_SECRET_KEY=sk_test_xxx

STRIPE_PRODUCTS='[
  {
    "name": "Starter",
    "prices": [{"amount": 999, "currency": "usd", "interval": "month"}]
  }
]'
```

2. **Check the plan**:

```bash
pnpm bootstrap:preflight
```

Expected output:
```
Provider: stripe
Steps:
  - Product: Starter: Create new product [create]
  - Price: 9.99 USD/month: Create price for new product [create]
  - Webhook endpoint: Create webhook for https://myapp.example.com/api/webhooks/stripe [create]
```

3. **Apply**:

```bash
pnpm bootstrap:apply
```

4. **Verify generated files**:

```bash
cat .env.local.generated | grep STRIPE
```

You should see:
```
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_WEBHOOK_URL=https://myapp.example.com/api/webhooks/stripe
STRIPE_PRODUCT_IDS=prod_xxx
STRIPE_PRICE_IDS=price_xxx
```

## Troubleshooting

### "Stripe SDK not found"

The bootstrap CLI requires the Stripe SDK. Install it:

```bash
pnpm --filter @justevery/bootstrap-cli add stripe
```

### Price definition changes

When you change a price amount or billing interval, the bootstrap CLI:
1. Creates a new price (Stripe prices are immutable)
2. Warns you about the change
3. Keeps the old price active

To deactivate old prices, manually archive them in the Stripe Dashboard or via API.

### Duplicate webhooks

If you see warnings about duplicate webhooks:
1. Check the Stripe Dashboard: https://dashboard.stripe.com/webhooks
2. Remove duplicate endpoints manually
3. Re-run `pnpm bootstrap:apply`

## Security Notes

- **Never commit** `STRIPE_SECRET_KEY` to version control
- Use **test mode** (`sk_test_*`) for development
- Rotate secrets if compromised
- Use separate Stripe accounts for staging and production
- The webhook secret in `.env.local.generated` is safe to commit as it's environment-specific

## Additional Resources

- [Stripe API Keys](https://stripe.com/docs/keys)
- [Stripe Products & Prices](https://stripe.com/docs/api/products)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Testing with Test Clocks](https://stripe.com/docs/billing/testing/test-clocks)
