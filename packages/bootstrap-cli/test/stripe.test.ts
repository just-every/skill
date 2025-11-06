import { describe, expect, it, vi } from 'vitest';
import {
  buildStripePlan,
  executeStripePlan,
  formatStripePlan,
  type StripeClient,
  type StripeProduct,
  type StripePrice,
  type StripeWebhookEndpoint
} from '../src/providers/stripe.js';
import type { BootstrapEnv } from '../src/env.js';

const BASE_ENV: BootstrapEnv = {
  PROJECT_ID: 'demo',
  PROJECT_DOMAIN: 'https://demo.justevery.com',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
  CLOUDFLARE_API_TOKEN: 'token',
  LOGTO_ENDPOINT: 'https://auth.example.com',
  LOGTO_API_RESOURCE: 'https://api.example.com',
  STRIPE_SECRET_KEY: 'sk_test_12345',
  STRIPE_PRODUCTS: JSON.stringify([
    {
      name: 'Premium Plan',
      description: 'Premium subscription',
      prices: [
        {
          amount: 2999,
          currency: 'usd',
          interval: 'month'
        }
      ]
    }
  ])
};

function createMockStripeClient(): StripeClient {
  return {
    products: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn(),
      update: vi.fn()
    },
    prices: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn()
    },
    webhookEndpoints: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn(),
      update: vi.fn()
    }
  };
}

describe('buildStripePlan', () => {
  it('creates plan for new products and prices', async () => {
    const stripe = createMockStripeClient();
    const plan = await buildStripePlan(BASE_ENV, stripe, {
      webhookUrl: 'https://demo.justevery.com/api/webhooks/stripe'
    });

    expect(plan.provider).toBe('stripe');
    expect(plan.steps.length).toBeGreaterThan(0);

    // Should have product creation step
    const productStep = plan.steps.find((s) => s.id === 'product:Premium Plan');
    expect(productStep).toBeDefined();
    expect(productStep?.status).toBe('create');

    // Should have price creation step
    const priceStep = plan.steps.find((s) => s.id.includes('price:Premium Plan'));
    expect(priceStep).toBeDefined();
    expect(priceStep?.status).toBe('create');

    // Should have webhook creation step
    const webhookStep = plan.steps.find((s) => s.id === 'webhook');
    expect(webhookStep).toBeDefined();
    expect(webhookStep?.status).toBe('create');
  });

  it('detects existing products with matching metadata', async () => {
    const existingProduct: StripeProduct = {
      id: 'prod_existing',
      name: 'Premium Plan',
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan'
      }
    };

    const existingPrice: StripePrice = {
      id: 'price_existing',
      product: 'prod_existing',
      unit_amount: 2999,
      currency: 'usd',
      recurring: {
        interval: 'month',
        interval_count: 1
      },
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan:price:2999:usd:month:1'
      }
    };

    const stripe = createMockStripeClient();
    vi.mocked(stripe.products.list).mockResolvedValue({
      data: [existingProduct]
    });
    vi.mocked(stripe.prices.list).mockResolvedValue({
      data: [existingPrice]
    });

    const plan = await buildStripePlan(BASE_ENV, stripe);

    const productStep = plan.steps.find((s) => s.id === 'product:Premium Plan');
    expect(productStep?.status).toBe('existing');
    expect(productStep?.detail).toContain('prod_existing');

    const priceSteps = plan.steps.filter((s) => s.id.includes('price:Premium Plan'));
    expect(priceSteps.length).toBeGreaterThan(0);
    expect(priceSteps[0].status).toBe('existing');
  });

  it('plans to create new price when definition changes', async () => {
    const existingProduct: StripeProduct = {
      id: 'prod_existing',
      name: 'Premium Plan',
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan'
      }
    };

    const existingPrice: StripePrice = {
      id: 'price_old',
      product: 'prod_existing',
      unit_amount: 1999, // Different amount
      currency: 'usd',
      recurring: {
        interval: 'month',
        interval_count: 1
      },
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan:price:1999:usd:month:1'
      }
    };

    const stripe = createMockStripeClient();
    vi.mocked(stripe.products.list).mockResolvedValue({
      data: [existingProduct]
    });
    vi.mocked(stripe.prices.list).mockResolvedValue({
      data: [existingPrice]
    });

    const plan = await buildStripePlan(BASE_ENV, stripe);

    // Should warn about price definition change
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings.some((w) => w.includes('Price definition changed'))).toBe(true);

    // Should plan to create new price
    const createPriceSteps = plan.steps.filter(
      (s) => s.id.includes('price:Premium Plan') && s.status === 'create'
    );
    expect(createPriceSteps.length).toBeGreaterThan(0);
  });

  it('detects existing webhook by URL', async () => {
    const existingWebhook: StripeWebhookEndpoint = {
      id: 'we_existing',
      url: 'https://demo.justevery.com/api/webhooks/stripe',
      enabled_events: [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.payment_succeeded',
        'invoice.payment_failed'
      ],
      status: 'enabled',
      metadata: {}
    };

    const stripe = createMockStripeClient();
    vi.mocked(stripe.webhookEndpoints.list).mockResolvedValue({
      data: [existingWebhook]
    });

    const plan = await buildStripePlan(BASE_ENV, stripe, {
      webhookUrl: 'https://demo.justevery.com/api/webhooks/stripe'
    });

    const webhookStep = plan.steps.find((s) => s.id === 'webhook');
    expect(webhookStep?.status).toBe('existing');
  });

  it('updates webhook when events differ', async () => {
    const existingWebhook: StripeWebhookEndpoint = {
      id: 'we_existing',
      url: 'https://demo.justevery.com/api/webhooks/stripe',
      enabled_events: ['customer.subscription.created'], // Missing events
      status: 'enabled',
      metadata: {
        idempotency_key: 'bootstrap:demo:webhook'
      }
    };

    const stripe = createMockStripeClient();
    vi.mocked(stripe.webhookEndpoints.list).mockResolvedValue({
      data: [existingWebhook]
    });

    const plan = await buildStripePlan(BASE_ENV, stripe, {
      webhookUrl: 'https://demo.justevery.com/api/webhooks/stripe'
    });

    const webhookStep = plan.steps.find((s) => s.id === 'webhook');
    expect(webhookStep?.status).toBe('update');
    expect(webhookStep?.detail).toContain('Update events');
  });

  it('warns about duplicate webhooks', async () => {
    const webhook1: StripeWebhookEndpoint = {
      id: 'we_1',
      url: 'https://demo.justevery.com/api/webhooks/stripe',
      enabled_events: [],
      status: 'enabled',
      metadata: { idempotency_key: 'bootstrap:demo:webhook' }
    };

    const webhook2: StripeWebhookEndpoint = {
      id: 'we_2',
      url: 'https://demo.justevery.com/api/webhooks/stripe',
      enabled_events: [],
      status: 'enabled',
      metadata: {}
    };

    const stripe = createMockStripeClient();
    vi.mocked(stripe.webhookEndpoints.list).mockResolvedValue({
      data: [webhook1, webhook2]
    });

    const plan = await buildStripePlan(BASE_ENV, stripe, {
      webhookUrl: 'https://demo.justevery.com/api/webhooks/stripe'
    });

    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings[0]).toContain('duplicate');
  });
});

describe('executeStripePlan', () => {
  it('creates new products and prices when none exist', async () => {
    const stripe = createMockStripeClient();

    const createdProduct: StripeProduct = {
      id: 'prod_new',
      name: 'Premium Plan',
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan',
        project_id: 'demo'
      }
    };

    const createdPrice: StripePrice = {
      id: 'price_new',
      product: 'prod_new',
      unit_amount: 2999,
      currency: 'usd',
      recurring: {
        interval: 'month',
        interval_count: 1
      },
      active: true,
      metadata: {}
    };

    vi.mocked(stripe.products.create).mockResolvedValue(createdProduct);
    vi.mocked(stripe.prices.create).mockResolvedValue(createdPrice);

    const result = await executeStripePlan(BASE_ENV, stripe, { dryRun: false });

    expect(stripe.products.create).toHaveBeenCalledWith({
      name: 'Premium Plan',
      description: 'Premium subscription',
      metadata: expect.objectContaining({
        idempotency_key: 'bootstrap:demo:Premium Plan',
        project_id: 'demo'
      })
    });

    expect(stripe.prices.create).toHaveBeenCalledWith({
      product: 'prod_new',
      unit_amount: 2999,
      currency: 'usd',
      recurring: {
        interval: 'month'
      },
      metadata: expect.objectContaining({
        project_id: 'demo',
        idempotency_key: expect.stringContaining('bootstrap:demo:Premium Plan:price')
      })
    });

    expect(result.products).toHaveLength(1);
    expect(result.products[0].productId).toBe('prod_new');
    expect(result.products[0].priceIds).toContain('price_new');
  });

  it('skips creating existing products and prices', async () => {
    const existingProduct: StripeProduct = {
      id: 'prod_existing',
      name: 'Premium Plan',
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan'
      }
    };

    const existingPrice: StripePrice = {
      id: 'price_existing',
      product: 'prod_existing',
      unit_amount: 2999,
      currency: 'usd',
      recurring: {
        interval: 'month',
        interval_count: 1
      },
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan:price:2999:usd:month:1'
      }
    };

    const stripe = createMockStripeClient();
    vi.mocked(stripe.products.list).mockResolvedValue({
      data: [existingProduct]
    });
    vi.mocked(stripe.prices.list).mockResolvedValue({
      data: [existingPrice]
    });

    const result = await executeStripePlan(BASE_ENV, stripe, { dryRun: false });

    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();

    expect(result.products[0].productId).toBe('prod_existing');
    expect(result.products[0].priceIds).toContain('price_existing');
  });

  it('creates webhook endpoint with correct events', async () => {
    const stripe = createMockStripeClient();

    const createdProduct: StripeProduct = {
      id: 'prod_new',
      name: 'Premium Plan',
      active: true,
      metadata: {}
    };

    const createdPrice: StripePrice = {
      id: 'price_new',
      product: 'prod_new',
      unit_amount: 2999,
      currency: 'usd',
      recurring: {
        interval: 'month',
        interval_count: 1
      },
      active: true,
      metadata: {}
    };

    const createdWebhook: StripeWebhookEndpoint = {
      id: 'we_new',
      url: 'https://demo.justevery.com/api/webhooks/stripe',
      enabled_events: [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.payment_succeeded',
        'invoice.payment_failed'
      ],
      status: 'enabled',
      metadata: {},
      secret: 'whsec_newsecret123'
    };

    vi.mocked(stripe.products.create).mockResolvedValue(createdProduct);
    vi.mocked(stripe.prices.create).mockResolvedValue(createdPrice);
    vi.mocked(stripe.webhookEndpoints.create).mockResolvedValue(createdWebhook);

    const result = await executeStripePlan(BASE_ENV, stripe, {
      dryRun: false,
      webhookUrl: 'https://demo.justevery.com/api/webhooks/stripe'
    });

    expect(stripe.webhookEndpoints.create).toHaveBeenCalledWith({
      url: 'https://demo.justevery.com/api/webhooks/stripe',
      enabled_events: expect.arrayContaining([
        'customer.subscription.created',
        'invoice.payment_succeeded'
      ]),
      metadata: expect.objectContaining({
        idempotency_key: 'bootstrap:demo:webhook',
        project_id: 'demo'
      })
    });

    expect(result.webhook).toBeDefined();
    expect(result.webhook?.webhookId).toBe('we_new');
    expect(result.webhook?.webhookSecret).toBe('whsec_newsecret123');
  });

  it('updates webhook events when they differ', async () => {
    const existingProduct: StripeProduct = {
      id: 'prod_existing',
      name: 'Premium Plan',
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan'
      }
    };

    const existingPrice: StripePrice = {
      id: 'price_existing',
      product: 'prod_existing',
      unit_amount: 2999,
      currency: 'usd',
      recurring: {
        interval: 'month',
        interval_count: 1
      },
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan:price:2999:usd:month:1'
      }
    };

    const existingWebhook: StripeWebhookEndpoint = {
      id: 'we_existing',
      url: 'https://demo.justevery.com/api/webhooks/stripe',
      enabled_events: ['customer.subscription.created'],
      status: 'enabled',
      metadata: {
        idempotency_key: 'bootstrap:demo:webhook'
      }
    };

    const stripe = createMockStripeClient();
    vi.mocked(stripe.products.list).mockResolvedValue({
      data: [existingProduct]
    });
    vi.mocked(stripe.prices.list).mockResolvedValue({
      data: [existingPrice]
    });
    vi.mocked(stripe.webhookEndpoints.list).mockResolvedValue({
      data: [existingWebhook]
    });

    await executeStripePlan(BASE_ENV, stripe, {
      dryRun: false,
      webhookUrl: 'https://demo.justevery.com/api/webhooks/stripe'
    });

    expect(stripe.webhookEndpoints.update).toHaveBeenCalledWith(
      'we_existing',
      expect.objectContaining({
        enabled_events: expect.arrayContaining([
          'customer.subscription.created',
          'customer.subscription.updated',
          'customer.subscription.deleted',
          'invoice.payment_succeeded',
          'invoice.payment_failed'
        ])
      })
    );
  });

  it('does not make API calls in dry run mode', async () => {
    const stripe = createMockStripeClient();

    const result = await executeStripePlan(BASE_ENV, stripe, { dryRun: true });

    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(stripe.webhookEndpoints.create).not.toHaveBeenCalled();

    expect(result.products).toHaveLength(1);
    expect(result.products[0].productId).toBe('prod_dry_run_id');
  });

  it('warns when creating new price due to definition change', async () => {
    const existingProduct: StripeProduct = {
      id: 'prod_existing',
      name: 'Premium Plan',
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan'
      }
    };

    const existingPrice: StripePrice = {
      id: 'price_old',
      product: 'prod_existing',
      unit_amount: 1999,
      currency: 'usd',
      recurring: {
        interval: 'month',
        interval_count: 1
      },
      active: true,
      metadata: {
        idempotency_key: 'bootstrap:demo:Premium Plan:price:1999:usd:month:1'
      }
    };

    const newPrice: StripePrice = {
      id: 'price_new',
      product: 'prod_existing',
      unit_amount: 2999,
      currency: 'usd',
      recurring: {
        interval: 'month',
        interval_count: 1
      },
      active: true,
      metadata: {}
    };

    const stripe = createMockStripeClient();
    vi.mocked(stripe.products.list).mockResolvedValue({
      data: [existingProduct]
    });
    vi.mocked(stripe.prices.list).mockResolvedValue({
      data: [existingPrice]
    });
    vi.mocked(stripe.prices.create).mockResolvedValue(newPrice);

    const result = await executeStripePlan(BASE_ENV, stripe, { dryRun: false });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Price definition changed');
    expect(stripe.prices.create).toHaveBeenCalled();
  });
});

describe('formatStripePlan', () => {
  it('formats plan with steps and notes', async () => {
    const stripe = createMockStripeClient();
    const plan = await buildStripePlan(BASE_ENV, stripe, {
      webhookUrl: 'https://demo.justevery.com/api/webhooks/stripe'
    });

    const formatted = formatStripePlan(plan);

    expect(formatted).toContain('Provider: stripe');
    expect(formatted).toContain('Steps:');
    expect(formatted).toContain('Premium Plan');
    expect(formatted).toContain('Notes:');
    expect(formatted).toContain('Project: demo');
  });

  it('includes warnings when present', async () => {
    const webhook1: StripeWebhookEndpoint = {
      id: 'we_1',
      url: 'https://demo.justevery.com/api/webhooks/stripe',
      enabled_events: [],
      status: 'enabled',
      metadata: { idempotency_key: 'bootstrap:demo:webhook' }
    };

    const webhook2: StripeWebhookEndpoint = {
      id: 'we_2',
      url: 'https://demo.justevery.com/api/webhooks/stripe',
      enabled_events: [],
      status: 'enabled',
      metadata: {}
    };

    const stripe = createMockStripeClient();
    vi.mocked(stripe.webhookEndpoints.list).mockResolvedValue({
      data: [webhook1, webhook2]
    });

    const plan = await buildStripePlan(BASE_ENV, stripe, {
      webhookUrl: 'https://demo.justevery.com/api/webhooks/stripe'
    });

    const formatted = formatStripePlan(plan);

    expect(formatted).toContain('Warnings:');
    expect(formatted).toContain('duplicate');
  });
});

describe('Legacy STRIPE_PRODUCTS parsing', () => {
  it('parses legacy semicolon-separated format with single price per product', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: 'Founders:2500,usd,month;Scale:4900,usd,month'
    };

    const plan = await buildStripePlan(env, stripe);

    // Should create plans for both products
    const founderStep = plan.steps.find((s) => s.id === 'product:Founders');
    expect(founderStep).toBeDefined();
    expect(founderStep?.status).toBe('create');

    const scaleStep = plan.steps.find((s) => s.id === 'product:Scale');
    expect(scaleStep).toBeDefined();
    expect(scaleStep?.status).toBe('create');

    // Should have correct price steps
    const founderPriceStep = plan.steps.find((s) => s.title === 'Price: 25.00 USD/month');
    expect(founderPriceStep).toBeDefined();
    expect(founderPriceStep?.status).toBe('create');

    const scalePriceStep = plan.steps.find((s) => s.title === 'Price: 49.00 USD/month');
    expect(scalePriceStep).toBeDefined();
    expect(scalePriceStep?.status).toBe('create');
  });

  it('parses legacy format with daily billing interval', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: 'Daily:100,eur,day'
    };

    const plan = await buildStripePlan(env, stripe);

    const priceStep = plan.steps.find((s) => s.id.includes('price:Daily'));
    expect(priceStep).toBeDefined();
    expect(priceStep?.status).toBe('create');
  });

  it('parses legacy format with yearly billing interval', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: 'Annual:49999,gbp,year'
    };

    const plan = await buildStripePlan(env, stripe);

    const priceStep = plan.steps.find((s) => s.id.includes('price:Annual'));
    expect(priceStep).toBeDefined();
    expect(priceStep?.status).toBe('create');
  });

  it('parses legacy format without interval (one-time charge)', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: 'Setup:9999,usd'
    };

    const plan = await buildStripePlan(env, stripe);

    const priceStep = plan.steps.find((s) => s.id.includes('price:Setup'));
    expect(priceStep).toBeDefined();
    expect(priceStep?.status).toBe('create');
  });

  it('handles legacy format with spaces around delimiters', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: ' Founders : 2500 , usd , month ; Scale : 4900 , usd , month '
    };

    const plan = await buildStripePlan(env, stripe);

    const founderStep = plan.steps.find((s) => s.id === 'product:Founders');
    expect(founderStep).toBeDefined();

    const scaleStep = plan.steps.find((s) => s.id === 'product:Scale');
    expect(scaleStep).toBeDefined();
  });

  it('throws error on invalid legacy format with missing amount', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: 'BadProduct:,usd,month'
    };

    await expect(buildStripePlan(env, stripe)).rejects.toThrow(/Invalid price format/);
  });

  it('throws error on invalid legacy format with non-numeric amount', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: 'BadProduct:notanumber,usd,month'
    };

    await expect(buildStripePlan(env, stripe)).rejects.toThrow(/not a number/);
  });

  it('throws error on invalid legacy format with unknown interval', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: 'BadProduct:1000,usd,quarterly'
    };

    await expect(buildStripePlan(env, stripe)).rejects.toThrow(/Invalid interval/);
  });

  it('throws error on malformed JSON format', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: '[{name: "BadJSON"}'
    };

    await expect(buildStripePlan(env, stripe)).rejects.toThrow(/Failed to parse STRIPE_PRODUCTS as JSON/);
  });

  it('throws error when JSON array contains non-object elements', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      STRIPE_PRODUCTS: '["NotAnObject"]'
    };

    await expect(buildStripePlan(env, stripe)).rejects.toThrow(/is not iterable|not a number|TypeError/);
  });

  it('prefers JSON format over legacy format when both could apply', async () => {
    const stripe = createMockStripeClient();
    const env = {
      ...BASE_ENV,
      // Valid JSON array should take precedence
      STRIPE_PRODUCTS: JSON.stringify([
        {
          name: 'JSONProduct',
          description: 'From JSON format',
          prices: [
            {
              amount: 3000,
              currency: 'usd',
              interval: 'month'
            }
          ]
        }
      ])
    };

    const plan = await buildStripePlan(env, stripe);

    const step = plan.steps.find((s) => s.id === 'product:JSONProduct');
    expect(step).toBeDefined();
    expect(step?.status).toBe('create');
  });
});
