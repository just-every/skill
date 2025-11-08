import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import type { StripeProvisionResult } from '../providers/stripe.js';

/**
 * Update .env.local with Stripe provisioned IDs
 */
export async function updateEnvWithStripeIds(
  cwd: string,
  result: StripeProvisionResult
): Promise<void> {
  const envPath = resolve(cwd, '.env.local');
  let existingContent = '';

  try {
    existingContent = await fs.readFile(envPath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const parsed = parse(existingContent);

  // Update Stripe product IDs (comma-separated)
  if (result.products.length > 0) {
    const productIds = result.products.map((p) => p.productId).join(',');
    parsed.STRIPE_PRODUCT_IDS = productIds;

    // Also store price IDs
    const priceIds = result.products.flatMap((p) => p.priceIds).join(',');
    parsed.STRIPE_PRICE_IDS = priceIds;
  }

  // Update webhook secret and URL if provisioned
  if (result.webhook) {
    parsed.STRIPE_WEBHOOK_SECRET = result.webhook.webhookSecret;
    // Store the webhook ID for reference
    parsed.STRIPE_WEBHOOK_ID = result.webhook.webhookId;
  }

  // Generate new content
  const updated = Object.entries(parsed)
    .map(([key, value]) => `${key}=${escapeEnvValue(value)}`)
    .join('\n');

  await fs.writeFile(envPath, ensureTrailingNewline(updated), 'utf8');
}

function escapeEnvValue(value: string): string {
  if (value === '') return '';
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}
