import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';
import type { Session } from '@justevery/auth-shared';

import type { Env } from '../src/index';
import type { AuthenticatedSession } from '../src/sessionAuth';

export class ProvisioningDbMock implements D1Database {
  users: Array<{ id: string; email: string }> = [];
  companies: Array<{ id: string; slug: string; name: string; plan: string; billing_email: string | null }> = [];
  companyMembers: Array<{
    id: string;
    company_id: string;
    user_id: string | null;
    email: string;
    display_name: string;
    role: string;
  }> = [];
  brandings: Array<{ company_id: string; updated_at: string }> = [];
  subscriptions: Array<{ id: string; company_id: string; plan_name: string }> = [];

  prepare(query: string): D1PreparedStatement {
    const context = { sql: query, bindings: [] as unknown[] };
    const statement: D1PreparedStatement = {
      bind: (...args: unknown[]) => {
        context.bindings = args;
        return statement;
      },
      first: <T = unknown>() => this.executeFirst<T>(context.sql, context.bindings),
      all: <T = unknown>() => this.executeAll<T>(context.sql, context.bindings),
      raw: <T = unknown>() => this.executeRaw<T>(context.sql, context.bindings),
      run: () => this.executeRun(context.sql, context.bindings),
    };
    return statement;
  }

  batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  private async executeFirst<T>(sql: string, bindings: unknown[]): Promise<T | null> {
    const normalized = sql.trim().toUpperCase();
    if (normalized.startsWith('SELECT COMPANY_ID FROM COMPANY_MEMBERS WHERE USER_ID')) {
      const [userId] = bindings as [string];
      const record = this.companyMembers.find((member) => member.user_id === userId);
      return (record ? { company_id: record.company_id } : null) as T | null;
    }
    if (normalized.startsWith('SELECT COMPANY_ID FROM COMPANY_MEMBERS WHERE LOWER(EMAIL)')) {
      const [email] = bindings as [string];
      const record = this.companyMembers.find((member) => member.email.toLowerCase() === email.toLowerCase());
      return (record ? { company_id: record.company_id } : null) as T | null;
    }
    if (normalized.startsWith('SELECT SLUG FROM COMPANIES WHERE SLUG')) {
      const [slug] = bindings as [string];
      const record = this.companies.find((company) => company.slug === slug);
      return (record ? { slug: record.slug } : null) as T | null;
    }
    if (normalized.startsWith('SELECT ID FROM USERS WHERE LOWER(EMAIL)')) {
      const [email] = bindings as [string];
      const record = this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
      return (record ? { id: record.id } : null) as T | null;
    }
    return null;
  }

  private async executeAll<T>(sql: string, bindings: unknown[]): Promise<{ results: T[] }> {
    const first = await this.executeFirst<T>(sql, bindings);
    return { results: first ? [first] : [] };
  }

  private async executeRaw<T>(sql: string, bindings: unknown[]): Promise<T[]> {
    const result = await this.executeAll<T>(sql, bindings);
    return result.results;
  }

  private async executeRun(sql: string, bindings: unknown[]): Promise<D1Result> {
    const normalized = sql.trim().toUpperCase();
    if (normalized.startsWith('INSERT INTO USERS')) {
      const [id, email] = bindings as [string, string];
      const conflict = this.users.find((user) => user.email.toLowerCase() === email.toLowerCase() && user.id !== id);
      if (conflict) {
        throw new Error('UNIQUE constraint failed: users.email');
      }
      const existing = this.users.find((user) => user.id === id);
      if (existing) {
        existing.email = email;
      } else {
        this.users.push({ id, email });
      }
      return { success: true, results: [], meta: {} } as D1Result;
    }

    if (normalized.startsWith('INSERT INTO COMPANIES')) {
      const [id, slug, name, plan, billingEmail] = bindings as [string, string, string, string, string];
      if (this.companies.some((company) => company.slug === slug)) {
        throw new Error('UNIQUE constraint failed: companies.slug');
      }
      this.companies.push({ id, slug, name, plan, billing_email: billingEmail });
      return { success: true, results: [], meta: {} } as D1Result;
    }

    if (normalized.startsWith('INSERT INTO COMPANY_MEMBERS')) {
      const [id, companyId, userId, email, displayName] = bindings as [string, string, string | null, string, string];
      this.companyMembers.push({
        id,
        company_id: companyId,
        user_id: userId,
        email,
        display_name: displayName,
        role: 'owner',
      });
      return { success: true, results: [], meta: {} } as D1Result;
    }

    if (normalized.startsWith('INSERT INTO COMPANY_BRANDING_SETTINGS')) {
      const [companyId, updatedAt] = bindings as [string, string];
      const existing = this.brandings.find((branding) => branding.company_id === companyId);
      if (existing) {
        existing.updated_at = updatedAt;
      } else {
        this.brandings.push({ company_id: companyId, updated_at: updatedAt });
      }
      return { success: true, results: [], meta: {} } as D1Result;
    }

    if (normalized.startsWith('INSERT INTO COMPANY_SUBSCRIPTIONS')) {
      const [id, companyId, planName] = bindings as [string, string, string];
      this.subscriptions.push({ id, company_id: companyId, plan_name: planName });
      return { success: true, results: [], meta: {} } as D1Result;
    }

    throw new Error(`Unsupported SQL in ProvisioningDbMock: ${sql}`);
  }
}

export function createProvisioningEnv(): { env: Env; db: ProvisioningDbMock } {
  const db = new ProvisioningDbMock();
  const env: Env = {
    LOGIN_ORIGIN: 'https://login.local',
    APP_BASE_URL: '/app',
    PROJECT_DOMAIN: 'https://app.local',
    STRIPE_PRODUCTS: '[]',
    DB: db,
  } as Env;
  return { env, db };
}

export function buildSession(userId: string, email: string, name = 'Test Owner'): AuthenticatedSession {
  const now = new Date();
  const sessionPayload: Session = {
    session: {
      id: `sess-${userId}`,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      token: `token-${userId}`,
      userId,
    },
    user: {
      id: userId,
      email,
      emailVerified: true,
      name,
      createdAt: now,
      updatedAt: now,
    },
  };

  return {
    sessionId: sessionPayload.session.id,
    userId,
    emailAddress: email,
    expiresAt: sessionPayload.session.expiresAt.toISOString(),
    session: sessionPayload,
  };
}
