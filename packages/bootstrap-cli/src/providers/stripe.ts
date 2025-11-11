import chalk from 'chalk';
import type { BootstrapEnv } from '../env.js';

/**
 * Create a Stripe client using the SDK
 */
type StripeConstructor = new (
  secretKey: string,
  config: { apiVersion: string }
) => StripeClient;

export async function createStripeClient(secretKey: string): Promise<StripeClient> {
  if (!secretKey || secretKey.trim() === '') {
    throw new Error('STRIPE_SECRET_KEY is required to create a Stripe client');
  }

  try {
    const stripeModule = await import('stripe');
    const StripeCtor = (stripeModule.default ?? stripeModule) as StripeConstructor;
    return new StripeCtor(secretKey, {
      apiVersion: '2024-11-20.acacia'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Cannot find module') || message.includes('ERR_MODULE_NOT_FOUND')) {
      throw new Error(
        'Stripe SDK not found. Install it with: pnpm add stripe\n' + `Error: ${message}`
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Stripe SDK types (minimal subset to avoid requiring the full SDK at build time)
 */
export interface StripeProduct {
  id: string;
  name: string;
  description?: string | null;
  metadata: Record<string, string>;
  active: boolean;
}

export interface StripePrice {
  id: string;
  product: string;
  unit_amount: number | null;
  currency: string;
  recurring?: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
  } | null;
  metadata: Record<string, string>;
  active: boolean;
}

export interface StripeWebhookEndpoint {
  id: string;
  url: string;
  enabled_events: string[];
  status: string;
  metadata: Record<string, string>;
  secret?: string;
}

export interface StripeClient {
  products: {
    list: (params?: { limit?: number }) => Promise<{ data: StripeProduct[] }>;
    create: (params: {
      name: string;
      description?: string;
      metadata?: Record<string, string>;
    }) => Promise<StripeProduct>;
    update: (
      id: string,
      params: { metadata?: Record<string, string> }
    ) => Promise<StripeProduct>;
  };
  prices: {
    list: (params?: { product?: string; limit?: number }) => Promise<{ data: StripePrice[] }>;
    create: (params: {
      product: string;
      unit_amount: number;
      currency: string;
      recurring?: { interval: string; interval_count?: number };
      metadata?: Record<string, string>;
    }) => Promise<StripePrice>;
  };
  webhookEndpoints: {
    list: (params?: { limit?: number }) => Promise<{ data: StripeWebhookEndpoint[] }>;
    create: (params: {
      url: string;
      enabled_events: string[];
      metadata?: Record<string, string>;
    }) => Promise<StripeWebhookEndpoint>;
    update: (
      id: string,
      params: {
        url?: string;
        enabled_events?: string[];
        metadata?: Record<string, string>;
      }
    ) => Promise<StripeWebhookEndpoint>;
  };
}

/**
 * Product definition from configuration
 */
export interface ProductDefinition {
  name: string;
  description?: string;
  prices: PriceDefinition[];
  metadata?: Record<string, string>;
}

export interface PriceDefinition {
  amount: number;
  currency: string;
  interval?: 'day' | 'week' | 'month' | 'year';
  interval_count?: number;
  metadata?: Record<string, string>;
}

/**
 * Provisioned resource identifiers
 */
export interface ProvisionedProduct {
  productId: string;
  productName: string;
  priceIds: string[];
}

export interface ProvisionedWebhook {
  webhookId: string;
  webhookSecret: string;
  webhookUrl: string;
}

export interface StripeProvisionResult {
  products: ProvisionedProduct[];
  webhook?: ProvisionedWebhook;
  warnings: string[];
}

/**
 * Plan step for Stripe provisioning
 */
export interface StripePlanStep {
  id: string;
  title: string;
  detail: string;
  status: 'noop' | 'create' | 'update' | 'existing';
}

export interface StripePlan {
  provider: 'stripe';
  steps: StripePlanStep[];
  notes: string[];
  warnings: string[];
}

function resolveStripeProductDefinitions(env: BootstrapEnv): string {
  return env.STRIPE_PRODUCT_DEFINITIONS ?? env.STRIPE_PRODUCTS ?? '';
}

/**
 * Build idempotent Stripe provisioning plan
 */
export async function buildStripePlan(
  env: BootstrapEnv,
  stripe: StripeClient,
  options: { webhookUrl?: string } = {}
): Promise<StripePlan> {
  const steps: StripePlanStep[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  // Parse product definitions
  const products = parseProductDefinitions(resolveStripeProductDefinitions(env));

  // Check existing Stripe products
  const existingProducts = await stripe.products.list({ limit: 100 });

  for (const productDef of products) {
    const idempotencyKey = `bootstrap:${env.PROJECT_ID}:${productDef.name}`;
    const existing = existingProducts.data.find(
      (p) => p.metadata.idempotency_key === idempotencyKey
    );

    if (existing) {
      steps.push({
        id: `product:${productDef.name}`,
        title: `Product: ${productDef.name}`,
        detail: `Existing product found (${existing.id})`,
        status: 'existing'
      });

      // Check prices for this product
      const existingPrices = await stripe.prices.list({ product: existing.id, limit: 100 });

      for (const priceDef of productDef.prices) {
        const priceKey = buildPriceIdempotencyKey(idempotencyKey, priceDef);
        const existingPrice = existingPrices.data.find(
          (p) => p.metadata.idempotency_key === priceKey
        );

        if (existingPrice) {
          // Verify price matches definition
          const matches = priceMatches(existingPrice, priceDef);
          if (matches) {
            steps.push({
              id: `price:${productDef.name}:${priceKey}`,
              title: `Price: ${formatPriceDetail(priceDef)}`,
              detail: `Existing price matches (${existingPrice.id})`,
              status: 'existing'
            });
          } else {
            warnings.push(
              `Price definition changed for ${productDef.name}: creating new price instead of updating`
            );
            steps.push({
              id: `price:${productDef.name}:${priceKey}`,
              title: `Price: ${formatPriceDetail(priceDef)}`,
              detail: 'Create new price (definition changed)',
              status: 'create'
            });
          }
        } else {
          // Check if there are any other prices for this product (might indicate a definition change)
          const hasOtherPrices = existingPrices.data.length > 0;
          if (hasOtherPrices) {
            warnings.push(
              `Price definition changed for ${productDef.name}: creating new price`
            );
          }

          steps.push({
            id: `price:${productDef.name}:${priceKey}`,
            title: `Price: ${formatPriceDetail(priceDef)}`,
            detail: hasOtherPrices ? 'Create new price (definition changed)' : 'Create new price',
            status: 'create'
          });
        }
      }
    } else {
      steps.push({
        id: `product:${productDef.name}`,
        title: `Product: ${productDef.name}`,
        detail: 'Create new product',
        status: 'create'
      });

      for (const priceDef of productDef.prices) {
        steps.push({
          id: `price:${productDef.name}:${formatPriceDetail(priceDef)}`,
          title: `Price: ${formatPriceDetail(priceDef)}`,
          detail: 'Create price for new product',
          status: 'create'
        });
      }
    }
  }

  // Check webhook endpoint
  if (options.webhookUrl) {
    const existingEndpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const webhookKey = `bootstrap:${env.PROJECT_ID}:webhook`;

    // Find by URL or metadata
    const existing = existingEndpoints.data.find(
      (ep) => ep.url === options.webhookUrl || ep.metadata.idempotency_key === webhookKey
    );

    if (existing) {
      // Check if events need updating
      const requiredEvents = getRequiredWebhookEvents();
      const needsUpdate = !arraysEqual(existing.enabled_events.sort(), requiredEvents.sort());

      if (needsUpdate) {
        steps.push({
          id: 'webhook',
          title: 'Webhook endpoint',
          detail: `Update events for ${options.webhookUrl}`,
          status: 'update'
        });
      } else {
        steps.push({
          id: 'webhook',
          title: 'Webhook endpoint',
          detail: `Existing endpoint matches (${existing.id})`,
          status: 'existing'
        });
      }

      // Check for duplicates
      const duplicates = existingEndpoints.data.filter(
        (ep) => ep.url === options.webhookUrl && ep.id !== existing.id
      );
      if (duplicates.length > 0) {
        warnings.push(
          `Found ${duplicates.length} duplicate webhook endpoint(s) for ${options.webhookUrl}. Consider cleaning up manually.`
        );
      }
    } else {
      steps.push({
        id: 'webhook',
        title: 'Webhook endpoint',
        detail: `Create webhook for ${options.webhookUrl}`,
        status: 'create'
      });
    }
  }

  notes.push(`Project: ${env.PROJECT_ID}`);
  notes.push(`Products configured: ${products.length}`);
  if (options.webhookUrl) {
    notes.push(`Webhook URL: ${options.webhookUrl}`);
  }

  return {
    provider: 'stripe',
    steps,
    notes,
    warnings
  };
}

/**
 * Execute Stripe provisioning plan
 */
export async function executeStripePlan(
  env: BootstrapEnv,
  stripe: StripeClient,
  options: {
    dryRun?: boolean;
    webhookUrl?: string;
    logger?: (line: string) => void;
  } = {}
): Promise<StripeProvisionResult> {
  const { dryRun = false, logger = (line: string) => console.log(line) } = options;
  const prefix = dryRun ? chalk.cyan('[dry-run]') : chalk.green('[apply]');

  const provisionedProducts: ProvisionedProduct[] = [];
  const warnings: string[] = [];
  let provisionedWebhook: ProvisionedWebhook | undefined;

  const products = parseProductDefinitions(resolveStripeProductDefinitions(env));
  const existingProducts = await stripe.products.list({ limit: 100 });

  // Provision products and prices
  for (const productDef of products) {
    const idempotencyKey = `bootstrap:${env.PROJECT_ID}:${productDef.name}`;
    let existing = existingProducts.data.find(
      (p) => p.metadata.idempotency_key === idempotencyKey
    );

    let productId: string;

    if (existing) {
      logger(`${prefix} Product ${productDef.name} exists (${existing.id})`);
      productId = existing.id;
    } else {
      if (dryRun) {
        logger(`${prefix} Would create product: ${productDef.name}`);
        productId = 'prod_dry_run_id';
      } else {
        logger(`${prefix} Creating product: ${productDef.name}`);
        const created = await stripe.products.create({
          name: productDef.name,
          description: productDef.description,
          metadata: {
            idempotency_key: idempotencyKey,
            project_id: env.PROJECT_ID,
            ...productDef.metadata
          }
        });
        productId = created.id;
        logger(chalk.green(`✓ Created product: ${created.id}`));
      }
    }

    // Provision prices
    const priceIds: string[] = [];
    const existingPrices = existing
      ? (await stripe.prices.list({ product: productId, limit: 100 })).data
      : [];

    for (const priceDef of productDef.prices) {
      const priceKey = buildPriceIdempotencyKey(idempotencyKey, priceDef);
      const existingPrice = existingPrices.find(
        (p) => p.metadata.idempotency_key === priceKey
      );

      if (existingPrice && priceMatches(existingPrice, priceDef)) {
        logger(`${prefix} Price exists (${existingPrice.id})`);
        priceIds.push(existingPrice.id);
      } else {
        // Warn if definition changed
        const hasOtherPrices = existingPrices.length > 0;
        if (existingPrice && !priceMatches(existingPrice, priceDef)) {
          warnings.push(
            `Price definition changed for ${productDef.name}, creating new price`
          );
          logger(
            chalk.yellow(
              `⚠ Price definition changed for ${formatPriceDetail(priceDef)}, creating new price`
            )
          );
        } else if (!existingPrice && hasOtherPrices) {
          warnings.push(
            `Price definition changed for ${productDef.name}, creating new price`
          );
          logger(
            chalk.yellow(
              `⚠ Price definition changed for ${productDef.name}, creating new price`
            )
          );
        }

        if (dryRun) {
          logger(`${prefix} Would create price: ${formatPriceDetail(priceDef)}`);
          priceIds.push('price_dry_run_id');
        } else {
          logger(`${prefix} Creating price: ${formatPriceDetail(priceDef)}`);
          const created = await stripe.prices.create({
            product: productId,
            unit_amount: priceDef.amount,
            currency: priceDef.currency,
            recurring: priceDef.interval
              ? {
                  interval: priceDef.interval,
                  ...(priceDef.interval_count && priceDef.interval_count !== 1
                    ? { interval_count: priceDef.interval_count }
                    : {})
                }
              : undefined,
            metadata: {
              idempotency_key: priceKey,
              project_id: env.PROJECT_ID,
              ...priceDef.metadata
            }
          });
          priceIds.push(created.id);
          logger(chalk.green(`✓ Created price: ${created.id}`));
        }
      }
    }

    provisionedProducts.push({
      productId,
      productName: productDef.name,
      priceIds
    });
  }

  // Provision webhook
  if (options.webhookUrl) {
    const existingEndpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const webhookKey = `bootstrap:${env.PROJECT_ID}:webhook`;

    const existing = existingEndpoints.data.find(
      (ep) => ep.url === options.webhookUrl || ep.metadata.idempotency_key === webhookKey
    );

    const requiredEvents = getRequiredWebhookEvents();

    if (existing) {
      const needsUpdate = !arraysEqual(existing.enabled_events.sort(), requiredEvents.sort());

        const fallbackSecret = env.STRIPE_WEBHOOK_SECRET ?? 'whsec_missing_secret';

        if (needsUpdate) {
          if (dryRun) {
            logger(`${prefix} Would update webhook events for ${options.webhookUrl}`);
            provisionedWebhook = {
              webhookId: existing.id,
              webhookSecret: 'whsec_dry_run_secret',
              webhookUrl: options.webhookUrl
            };
          } else {
            logger(`${prefix} Updating webhook events for ${options.webhookUrl}`);
            await stripe.webhookEndpoints.update(existing.id, {
              enabled_events: requiredEvents,
              metadata: {
                idempotency_key: webhookKey,
                project_id: env.PROJECT_ID
              }
            });
            logger(chalk.green(`✓ Updated webhook: ${existing.id}`));
            // Note: webhook secret cannot be retrieved after creation
            provisionedWebhook = {
              webhookId: existing.id,
              webhookSecret: fallbackSecret,
              webhookUrl: options.webhookUrl
            };
          }
        } else {
          logger(`${prefix} Webhook endpoint exists and matches (${existing.id})`);
          provisionedWebhook = {
            webhookId: existing.id,
            webhookSecret: fallbackSecret,
            webhookUrl: options.webhookUrl
          };
        }

      // Detect duplicates
      const duplicates = existingEndpoints.data.filter(
        (ep) => ep.url === options.webhookUrl && ep.id !== existing.id
      );
      if (duplicates.length > 0) {
        const warning = `Found ${duplicates.length} duplicate webhook(s) at ${options.webhookUrl}: ${duplicates.map((d) => d.id).join(', ')}`;
        warnings.push(warning);
        logger(chalk.yellow(`⚠ ${warning}`));
      }
    } else {
      if (dryRun) {
        logger(`${prefix} Would create webhook endpoint: ${options.webhookUrl}`);
        provisionedWebhook = {
          webhookId: 'we_dry_run_id',
          webhookSecret: 'whsec_dry_run_secret',
          webhookUrl: options.webhookUrl
        };
      } else {
        logger(`${prefix} Creating webhook endpoint: ${options.webhookUrl}`);
        const created = await stripe.webhookEndpoints.create({
          url: options.webhookUrl,
          enabled_events: requiredEvents,
          metadata: {
            idempotency_key: webhookKey,
            project_id: env.PROJECT_ID
          }
        });
        provisionedWebhook = {
          webhookId: created.id,
          webhookSecret: created.secret ?? 'whsec_missing_secret',
          webhookUrl: options.webhookUrl
        };
        logger(chalk.green(`✓ Created webhook: ${created.id}`));
      }
    }
  }

  if (dryRun) {
    logger(chalk.gray('Dry run completed without side effects.'));
  }

  return {
    products: provisionedProducts,
    webhook: provisionedWebhook,
    warnings
  };
}

/**
 * Format Stripe plan for display
 */
export function formatStripePlan(plan: StripePlan): string {
  const lines: string[] = [];

  lines.push(`Provider: ${plan.provider}`);

  if (plan.steps.length > 0) {
    lines.push('Steps:');
    for (const step of plan.steps) {
      lines.push(`  - ${step.title}: ${step.detail} [${step.status}]`);
    }
  }

  if (plan.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of plan.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
  }

  if (plan.notes.length > 0) {
    lines.push('Notes:');
    for (const note of plan.notes) {
      lines.push(`  ${note}`);
    }
  }

  return lines.join('\n');
}

/**
 * Parse product definitions from environment variable
 * Supports two formats:
 * 1. JSON array (recommended): [{"name":"Product","prices":[{"amount":2500,"currency":"usd","interval":"month"}]}]
 * 2. Legacy semicolon format: "Product:2500,usd,month;AnotherProduct:4900,usd,month"
 */
function parseProductDefinitions(raw?: string): ProductDefinition[] {
  if (!raw || raw.trim() === '') {
    return [];
  }

  // Try JSON first (recommended format)
  if (raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('STRIPE_PRODUCTS must be a JSON array');
      }
      return parsed as ProductDefinition[];
    } catch (error) {
      throw new Error(
        `Failed to parse STRIPE_PRODUCTS as JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Fall back to legacy semicolon format
  try {
    return parseLegacyProductFormat(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse STRIPE_PRODUCTS (tried both JSON and legacy format): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Parse legacy semicolon-separated product format
 * Format: "ProductName:amount,currency,interval;NextProduct:amount,currency,interval"
 * Example: "Founders:2500,usd,month;Scale:4900,usd,month"
 */
function parseLegacyProductFormat(raw: string): ProductDefinition[] {
  const products: ProductDefinition[] = [];
  const entries = raw.split(';').filter((s) => s.trim() !== '');

  for (const entry of entries) {
    const [namePart, ...priceParts] = entry.split(':');
    if (!namePart || priceParts.length === 0) {
      throw new Error(`Invalid product entry: "${entry}"`);
    }

    const name = namePart.trim();
    const priceStr = priceParts.join(':').trim();
    const [amountStr, currency, interval] = priceStr.split(',').map((s) => s.trim());

    if (!amountStr || !currency) {
      throw new Error(`Invalid price format for "${name}": expected "amount,currency[,interval]"`);
    }

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount for "${name}": "${amountStr}" is not a number`);
    }

    const price: PriceDefinition = {
      amount,
      currency: currency.toLowerCase()
    };

    // Add interval if provided
    if (interval && interval !== '') {
      const normalizedInterval = interval.toLowerCase();
      if (
        normalizedInterval !== 'day' &&
        normalizedInterval !== 'week' &&
        normalizedInterval !== 'month' &&
        normalizedInterval !== 'year'
      ) {
        throw new Error(
          `Invalid interval for "${name}": "${interval}" (must be day, week, month, or year)`
        );
      }
      price.interval = normalizedInterval as 'day' | 'week' | 'month' | 'year';
    }

    products.push({
      name,
      prices: [price]
    });
  }

  return products;
}

/**
 * Build idempotency key for a price based on its characteristics
 */
function buildPriceIdempotencyKey(
  productKey: string,
  price: PriceDefinition
): string {
  const parts = [
    productKey,
    'price',
    price.amount.toString(),
    price.currency,
    price.interval ?? 'one_time',
    price.interval_count?.toString() ?? '1'
  ];
  return parts.join(':');
}

/**
 * Check if an existing price matches the definition
 */
function priceMatches(existing: StripePrice, definition: PriceDefinition): boolean {
  if (existing.unit_amount !== definition.amount) return false;
  if (existing.currency !== definition.currency) return false;

  const defInterval = definition.interval ?? null;
  const existingInterval = existing.recurring?.interval ?? null;

  if (defInterval !== existingInterval) return false;

  if (defInterval) {
    const defCount = definition.interval_count ?? 1;
    const existingCount = existing.recurring?.interval_count ?? 1;
    if (defCount !== existingCount) return false;
  }

  return true;
}

/**
 * Format price for display
 */
function formatPriceDetail(price: PriceDefinition): string {
  const amount = (price.amount / 100).toFixed(2);
  const currency = price.currency.toUpperCase();

  if (price.interval) {
    const count = price.interval_count ?? 1;
    const intervalStr = count === 1 ? price.interval : `${count} ${price.interval}s`;
    return `${amount} ${currency}/${intervalStr}`;
  }

  return `${amount} ${currency}`;
}

/**
 * Get required webhook events for the application
 */
function getRequiredWebhookEvents(): string[] {
  return [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed'
  ];
}

/**
 * Check if two arrays are equal (same elements, order-sensitive)
 */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function buildStripeProductsPayload(env: BootstrapEnv, stripeResult?: StripeProvisionResult): string {
  const raw = resolveStripeProductDefinitions(env);
  if (!raw) {
    return '[]';
  }
  let definitions: ProductDefinition[];
  try {
    definitions = parseProductDefinitions(raw);
  } catch (error) {
    return raw;
  }

  const resultProducts = stripeResult?.products ?? [];
  const payload: unknown[] = [];

  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const provisioned = resultProducts[index];
    const priceIds = provisioned?.priceIds ?? [];
    const id = provisioned?.productId ?? definition.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    for (let priceIndex = 0; priceIndex < definition.prices.length; priceIndex += 1) {
      const priceDef = definition.prices[priceIndex];
      const priceId = priceIds[priceIndex] ?? '';
      payload.push({
        id,
        name: definition.name,
        description: definition.description,
        priceId,
        unitAmount: priceDef.amount,
        currency: priceDef.currency,
        interval: priceDef.interval,
        metadata: {
          ...(definition.metadata ?? {}),
          ...(priceDef.metadata ?? {})
        }
      });
    }
  }

  if (payload.length === 0) {
    return raw;
  }

  return JSON.stringify(payload);
}
