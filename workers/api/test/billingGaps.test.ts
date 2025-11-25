import { afterEach, describe, expect, it, vi } from 'vitest';
import type { D1Database, D1PreparedStatement, D1Result, D1Meta } from '@cloudflare/workers-types';

import {
  type Env,
  ensureAccountProvisionedForSession,
  fetchSubscriptionSummaryFromDb,
  handleBillingCheckout,
  handleSubscriptionWebhookEvent,
} from '../src/index';
import { buildSession, createProvisioningEnv } from './provisioningTestUtils';
import { createBillingCheckout } from '@justevery/login-client/billing';

vi.mock('@justevery/login-client/billing', async () => {
  const actual = await vi.importActual<typeof import('@justevery/login-client/billing')>('@justevery/login-client/billing');
  return {
    ...actual,
    createBillingCheckout: vi.fn(),
  };
});

const checkoutMock = vi.mocked(createBillingCheckout);

type CompanyRow = {
  id: string;
  plan: string;
  billing_email: string | null;
  stripe_customer_id?: string | null;
};

type SubscriptionRow = {
  id: string;
  company_id: string;
  plan_name: string | null;
  status: string;
  seats: number;
  current_period_start: string | null;
  current_period_end: string | null;
};

type MemberRow = {
  company_id: string;
  email: string;
  role: string;
};

class RecordingD1 implements D1Database {
  companies = new Map<string, CompanyRow>();
  subscriptions = new Map<string, SubscriptionRow>();
  stripeCustomers = new Map<string, { stripe_customer_id: string; billing_email: string | null }>();
  members = new Map<string, MemberRow[]>();

  constructor(seed?: {
    companies?: CompanyRow[];
    subscriptions?: SubscriptionRow[];
    members?: MemberRow[];
    stripeCustomers?: Array<{ company_id: string; stripe_customer_id: string; billing_email: string | null }>;
  }) {
    seed?.companies?.forEach((company) => this.companies.set(company.id, { ...company }));
    seed?.subscriptions?.forEach((row) => this.subscriptions.set(row.company_id, { ...row }));
    seed?.members?.forEach((row) => {
      const existing = this.members.get(row.company_id) ?? [];
      existing.push(row);
      this.members.set(row.company_id, existing);
    });
    seed?.stripeCustomers?.forEach((row) => {
      this.stripeCustomers.set(row.company_id, {
        stripe_customer_id: row.stripe_customer_id,
        billing_email: row.billing_email,
      });
      const company = this.companies.get(row.company_id);
      if (company) {
        company.stripe_customer_id = row.stripe_customer_id;
      }
    });
  }

  prepare(sql: string): D1PreparedStatement {
    const statement: D1PreparedStatement = {
      sql,
      bindings: [] as unknown[],
      bind: (...args: unknown[]) => {
        statement.bindings = args;
        return statement;
      },
      first: async () => this.handleFirst(sql, statement.bindings),
      all: async () => ({ success: true, results: await this.handleAll(sql, statement.bindings), meta: {} as D1Meta }),
      raw: async () => [] as unknown[],
      run: async () => {
        await this.handleRun(sql, statement.bindings);
        return { success: true, meta: {} as D1Meta };
      },
    } as D1PreparedStatement & { sql: string; bindings: unknown[] };

    return statement;
  }

  batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]> {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  private async handleRun(sql: string, bindings: unknown[]): Promise<void> {
    const normalized = sql.trim().toLowerCase();

    if (normalized.startsWith('insert into company_subscriptions')) {
      const [id, companyId, stripeSubscriptionId, stripePriceId, planName, status, seats, mrrCents, periodStart, periodEnd, cancelAt, cancelAtPeriodEnd]
        = bindings as [string, string, string | null, string | null, string | null, string, number, number, string | null, string | null, string | null, number | null];
      this.subscriptions.set(companyId, {
        id,
        company_id: companyId,
        plan_name: planName,
        status,
        seats,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      });
      return;
    }

    if (normalized.startsWith('update companies set plan')) {
      const [plan, companyId] = bindings as [string, string];
      const company = this.companies.get(companyId);
      if (company) {
        company.plan = plan;
      }
      return;
    }

    if (normalized.startsWith('insert into stripe_customers')) {
      const [id, companyId, stripeCustomerId, billingEmail]
        = bindings as [string, string, string, string | null];
      this.stripeCustomers.set(companyId, { stripe_customer_id: stripeCustomerId, billing_email: billingEmail ?? null });
      const company = this.companies.get(companyId);
      if (company) {
        company.stripe_customer_id = stripeCustomerId;
        company.billing_email = billingEmail ?? company.billing_email ?? null;
      }
      return;
    }

    if (normalized.startsWith('update companies set stripe_customer_id')) {
      const [stripeCustomerId, companyId] = bindings as [string, string];
      const company = this.companies.get(companyId);
      if (company) {
        company.stripe_customer_id = stripeCustomerId;
      }
      return;
    }
  }

  private async handleFirst(sql: string, bindings: unknown[]): Promise<Record<string, unknown> | null> {
    const normalized = sql.trim().toLowerCase();

    if (normalized.includes('from company_subscriptions')) {
      const [companyId] = bindings as [string];
      const row = this.subscriptions.get(companyId);
      return row ? { ...row, seats: row.seats ?? 0, mrr_cents: 0 } : null;
    }

    if (normalized.includes('from stripe_customers')) {
      const [companyId] = bindings as [string];
      const customer = this.stripeCustomers.get(companyId);
      return customer ? { stripe_customer_id: customer.stripe_customer_id } : null;
    }

    if (normalized.includes('from companies')) {
      const [companyId] = bindings as [string];
      const company = this.companies.get(companyId);
      return company ? {
        stripe_customer_id: company.stripe_customer_id ?? null,
        billing_email: company.billing_email,
        plan: company.plan,
      } : null;
    }

    if (normalized.includes('from company_members')) {
      const [companyId] = bindings as [string];
      const row = this.members.get(companyId)?.[0];
      return row ? { email: row.email, role: row.role } : null;
    }

    return null;
  }

  private async handleAll(_sql: string, _bindings: unknown[]): Promise<Record<string, unknown>[]> {
    return [];
  }
}

function buildEnv(overrides: Partial<Env> = {}): Env {
  const defaults: Env = {
    LOGIN_ORIGIN: 'https://login.local',
    APP_BASE_URL: 'https://app.local',
    PROJECT_DOMAIN: 'https://app.local',
    STRIPE_PRODUCTS: '[]',
    BILLING_CHECKOUT_TOKEN: 'svc_token_123',
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_WEBHOOK_SECRET: 'whsec_mock',
    EXPO_PUBLIC_WORKER_ORIGIN: 'http://127.0.0.1:9788',
  } as Env;
  return { ...defaults, ...overrides };
}

const baseBrand = {
  primaryColor: '#000000',
  secondaryColor: '#ffffff',
  accentColor: '#cccccc',
  logoUrl: undefined,
  tagline: 'Test brand',
  updatedAt: new Date().toISOString(),
};

const baseStats = {
  activeMembers: 1,
  pendingInvites: 0,
  mrr: 0,
  seats: 5,
};

function buildAccount(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'acct_test',
    slug: 'acct-test',
    name: 'Test Co',
    industry: 'SaaS',
    plan: 'Launch',
    createdAt: new Date().toISOString(),
    billingEmail: overrides.billingEmail,
    brand: baseBrand,
    stats: baseStats,
    ...overrides,
  };
}

describe('billing regression coverage', () => {
  afterEach(() => {
    checkoutMock.mockReset();
    vi.restoreAllMocks();
  });

  it('syncs companies.plan when Stripe subscription events deliver a new plan', async () => {
    const companyId = 'acct_plan_sync';
    const db = new RecordingD1({
      companies: [{ id: companyId, plan: 'Launch', billing_email: 'owner@example.com' }],
    });
    const env = buildEnv({ DB: db });

    await handleSubscriptionWebhookEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          items: { data: [{ price: { id: 'price_scale' }, quantity: 5 }] },
          plan: { nickname: 'Scale', metadata: { plan_key: 'Scale' } },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 86_400,
        },
      },
    } as { type: string; data: { object: Record<string, unknown> } }, companyId, env);

    expect(db.companies.get(companyId)?.plan).toBe('Scale');
  });

  it('treats trialing subscriptions as active in summaries', async () => {
    const companyId = 'acct_trial';
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const db = new RecordingD1({
      subscriptions: [{
        id: 'sub_trial',
        company_id: companyId,
        plan_name: 'Launch',
        status: 'trialing',
        seats: 5,
        current_period_start: new Date().toISOString(),
        current_period_end: future,
      }],
    });
    const env = buildEnv({ DB: db });

    const summary = await fetchSubscriptionSummaryFromDb(env, companyId);
    expect(summary?.active).toBe(true);
  });

  it('seeds a future current_period_end during tenant provisioning', async () => {
    const { env, db } = createProvisioningEnv();
    const session = buildSession('user_future', 'future@example.com', 'Future Founder');

    await ensureAccountProvisionedForSession(env, session);

    expect(db.subscriptions).toHaveLength(1);
    const seeded = db.subscriptions[0];
    const seededEnd = new Date(seeded.current_period_end);
    expect(seededEnd.getTime()).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000);
  });

  it('allows checkout to proceed when the billing email was cleared but an owner email exists', async () => {
    const companyId = 'acct_email_gap';
    const db = new RecordingD1({
      companies: [{ id: companyId, plan: 'Launch', billing_email: null }],
      members: [{ company_id: companyId, email: 'owner@example.com', role: 'owner' }],
    });
    const env = buildEnv({ DB: db });
    checkoutMock.mockResolvedValue({
      organizationId: companyId,
      checkoutRequestId: 'chk_gap_success',
      sessionId: 'cs_test',
      url: 'https://checkout.stripe.com/pay/cs_test',
      priceId: 'price_scale',
      productCode: 'Scale',
    });

    const request = new Request('https://app.local/api/accounts/acct-email-gap/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_scale',
        successUrl: 'https://app.local/success',
        cancelUrl: 'https://app.local/cancel',
      }),
    });

    const account = buildAccount({ id: companyId, slug: 'acct-email-gap', billingEmail: null });
    const response = await handleBillingCheckout(request, env, account as any, false);

    expect(response.status).toBe(200);
    expect(checkoutMock).toHaveBeenCalled();
  });

  it('rejects checkout attempts that supply disallowed redirect URLs', async () => {
    const companyId = 'acct_redirect_gap';
    const db = new RecordingD1({
      companies: [{ id: companyId, plan: 'Launch', billing_email: 'billing@example.com' }],
    });
    const env = buildEnv({ DB: db });

    const request = new Request('https://app.local/api/accounts/acct-redirect-gap/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_scale',
        successUrl: 'https://evil.example.com/success',
        cancelUrl: 'https://app.local/cancel',
      }),
    });

    const account = buildAccount({ id: companyId, slug: 'acct-redirect-gap' });
    const response = await handleBillingCheckout(request, env, account as any, false);

    expect(response.status).toBe(400);
    expect(checkoutMock).not.toHaveBeenCalled();
  });
});
