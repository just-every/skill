import type {
  D1Database,
  D1DatabaseSession,
  D1ExecResult,
  D1Meta,
  D1PreparedStatement,
  D1Result,
  D1SessionBookmark,
  D1SessionConstraint,
} from '@cloudflare/workers-types';
import type { Session } from '@justevery/auth-shared';

import type { Env } from '../src/index';
import type { AuthenticatedSession } from '../src/sessionAuth';

type QueryContext = {
  sql: string;
  bindings: unknown[];
};

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
  subscriptions: Array<{
    id: string;
    company_id: string;
    plan_name: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
  }> = [];

  prepare(query: string): D1PreparedStatement {
    const context: QueryContext = { sql: query, bindings: [] };

    const statement: D1PreparedStatement = {
      bind: (...args: unknown[]) => {
        context.bindings = args;
        return statement;
      },
      first: ((columnName?: string) =>
        this.executeFirst(context.sql, context.bindings, columnName)) as D1PreparedStatement['first'],
      all: <T = Record<string, unknown>>() => this.executeAll<T>(context.sql, context.bindings),
      raw: ((options?: { columnNames?: boolean }) => {
        if (options?.columnNames) {
          return this.executeRaw(context.sql, context.bindings, { columnNames: true });
        }
        return this.executeRaw(context.sql, context.bindings, options as { columnNames?: false });
      }) as D1PreparedStatement['raw'],
      run: <T = Record<string, unknown>>() => this.executeRun<T>(context.sql, context.bindings),
    };

    return statement;
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return Promise.all(statements.map((statement) => statement.run<T>()));
  }

  async exec(query: string): Promise<D1ExecResult> {
    const result = await this.executeRun(query, []);
    return {
      count: result.meta.rows_written,
      duration: result.meta.duration,
    };
  }

  withSession(
    _constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint,
  ): D1DatabaseSession {
    return {
      prepare: (sql: string) => this.prepare(sql),
      batch: <T = unknown>(statements: D1PreparedStatement[]) => this.batch<T>(statements),
      getBookmark: () => null,
    };
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  private async executeFirst<T>(
    sql: string,
    bindings: unknown[],
    columnName?: string,
  ): Promise<T | null> {
    const normalized = sql.trim().toUpperCase();
    let record: Record<string, unknown> | null = null;

    if (normalized.startsWith('SELECT COMPANY_ID FROM ORGANIZATION_MEMBERS WHERE USER_ID')) {
      const [userId] = bindings as [string];
      const match = this.companyMembers.find((member) => member.user_id === userId);
      record = match ? { company_id: match.company_id } : null;
    }

    if (normalized.startsWith('SELECT COMPANY_ID FROM ORGANIZATION_MEMBERS WHERE LOWER(EMAIL)')) {
      const [email] = bindings as [string];
      const match = this.companyMembers.find(
        (member) => member.email.toLowerCase() === email.toLowerCase(),
      );
      record = match ? { company_id: match.company_id } : null;
    }

    if (normalized.startsWith('SELECT SLUG FROM ORGANIZATIONS WHERE SLUG')) {
      const [slug] = bindings as [string];
      const match = this.companies.find((company) => company.slug === slug);
      record = match ? { slug: match.slug } : null;
    }

    if (normalized.startsWith('SELECT ID FROM USERS WHERE LOWER(EMAIL)')) {
      const [email] = bindings as [string];
      const match = this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
      record = match ? { id: match.id } : null;
    }

    if (normalized.startsWith('SELECT ID FROM ORGANIZATIONS WHERE SLUG')) {
      const [slug] = bindings as [string];
      const match = this.companies.find((company) => company.slug === slug);
      record = match ? { id: match.id } : null;
    }

    if (normalized.startsWith('SELECT ID FROM ORGANIZATION_MEMBERS WHERE COMPANY_ID')) {
      const [companyId, userId] = bindings as [string, string];
      const match = this.companyMembers.find(
        (member) => member.company_id === companyId && member.user_id === userId,
      );
      record = match ? { id: match.id } : null;
    }

    if (!record) {
      return null;
    }

    if (columnName) {
      const value = record[columnName];
      return (value ?? null) as T | null;
    }

    return record as T;
  }

  private async executeAll<T>(sql: string, bindings: unknown[]): Promise<D1Result<T>> {
    const first = await this.executeFirst<T>(sql, bindings);
    const results = first ? [first] : [];
    return this.buildResult(results);
  }

  private async executeRaw<T>(
    sql: string,
    bindings: unknown[],
    options: { columnNames: true },
  ): Promise<[string[], ...T[]]>;
  private async executeRaw<T>(
    sql: string,
    bindings: unknown[],
    options?: { columnNames?: false },
  ): Promise<T[]>;
  private async executeRaw<T>(
    sql: string,
    bindings: unknown[],
    options?: { columnNames?: boolean },
  ): Promise<[string[], ...T[]] | T[]> {
    const { results } = await this.executeAll<T>(sql, bindings);
    if (options?.columnNames) {
      const columnNames =
        results.length && typeof results[0] === 'object' && results[0] !== null
          ? Object.keys(results[0] as Record<string, unknown>)
          : [];
      return [columnNames, ...results] as [string[], ...T[]];
    }
    return results;
  }

  private buildResult<T = unknown>(
    results: T[] = [],
    metaOverrides: Partial<D1Meta> = {},
  ): D1Result<T> {
    const baseMeta: D1Meta = {
      duration: 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: 0,
      last_row_id: 0,
      changes: 0,
      changed_db: false,
    };

    const meta = {
      ...baseMeta,
      ...metaOverrides,
      changed_db:
        metaOverrides.changed_db ?? Boolean(metaOverrides.rows_written ?? baseMeta.rows_written),
    } as D1Meta & Record<string, unknown>;

    return {
      success: true,
      results,
      meta,
    };
  }

  private async executeRun<T = Record<string, unknown>>(
    sql: string,
    bindings: unknown[],
  ): Promise<D1Result<T>> {
    const normalized = sql.trim().toUpperCase();

    if (normalized.startsWith('INSERT INTO USERS')) {
      const [id, email] = bindings as [string, string];
      const conflict = this.users.find(
        (user) => user.email.toLowerCase() === email.toLowerCase() && user.id !== id,
      );
      if (conflict) {
        throw new Error('UNIQUE constraint failed: users.email');
      }
      const existing = this.users.find((user) => user.id === id);
      if (existing) {
        existing.email = email;
        return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
      }
      this.users.push({ id, email });
      return this.buildResult([], {
        rows_written: 1,
        changes: 1,
        last_row_id: this.users.length,
        changed_db: true,
      });
    }

    if (normalized.startsWith('INSERT INTO ORGANIZATIONS')) {
      const [id, slug, name, plan, billingEmail] = bindings as [
        string,
        string,
        string,
        string,
        string | null,
      ];
      const existing = this.companies.find((company) => company.slug === slug);
      if (existing) {
        existing.name = name;
        existing.plan = plan;
        existing.billing_email = billingEmail ?? null;
        return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
      }
      this.companies.push({ id, slug, name, plan, billing_email: billingEmail ?? null });
      return this.buildResult([], {
        rows_written: 1,
        changes: 1,
        last_row_id: this.companies.length,
        changed_db: true,
      });
    }

    if (normalized.startsWith('UPDATE ORGANIZATIONS SET NAME')) {
      const [name, billingEmail, slug] = bindings as [string, string | null, string];
      const existing = this.companies.find((company) => company.slug === slug);
      if (existing) {
        existing.name = name;
        existing.billing_email = billingEmail ?? null;
        return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
      }
      return this.buildResult();
    }

    if (normalized.startsWith('INSERT INTO ORGANIZATION_MEMBERS')) {
      const [id, companyId, userId, email, displayName] = bindings as [
        string,
        string,
        string | null,
        string,
        string,
      ];
      const role = bindings.length >= 6 ? (bindings as any)[5] : 'owner';
      const byEmail = this.companyMembers.find(
        (member) => member.company_id === companyId && member.email.toLowerCase() === email.toLowerCase(),
      );
      if (byEmail) {
        byEmail.user_id = userId;
        byEmail.display_name = displayName;
        byEmail.role = String(role);
        return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
      }
      const byUserId = userId
        ? this.companyMembers.find((member) => member.company_id === companyId && member.user_id === userId)
        : undefined;
      if (byUserId) {
        byUserId.email = email;
        byUserId.display_name = displayName;
        byUserId.role = String(role);
        return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
      }
      this.companyMembers.push({
        id,
        company_id: companyId,
        user_id: userId,
        email,
        display_name: displayName,
        role: String(role),
      });
      return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
    }

    if (normalized.startsWith('UPDATE ORGANIZATION_MEMBERS')) {
      if (normalized.includes("SET STATUS = 'SUSPENDED'")) {
        return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
      }
      if (normalized.includes('WHERE COMPANY_ID') && normalized.includes('AND USER_ID')) {
        const [email, displayName, role, companyId, userId] = bindings as [
          string,
          string,
          string,
          string,
          string,
        ];
        const existing = this.companyMembers.find(
          (member) => member.company_id === companyId && member.user_id === userId,
        );
        if (existing) {
          existing.email = email;
          existing.display_name = displayName;
          existing.role = role;
          return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
        }
        return this.buildResult();
      }
      const [userId, displayName, role, companyId, email] = bindings as [
        string,
        string,
        string,
        string,
        string,
      ];
      const existing = this.companyMembers.find(
        (member) => member.company_id === companyId && member.email.toLowerCase() === email.toLowerCase(),
      );
      if (existing) {
        existing.user_id = userId;
        existing.display_name = displayName;
        existing.role = role;
        return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
      }
      return this.buildResult();
    }

    if (normalized.startsWith('INSERT INTO COMPANY_BRANDING_SETTINGS')) {
      const [companyId, updatedAt] = bindings as [string, string];
      const existing = this.brandings.find((branding) => branding.company_id === companyId);
      if (existing) {
        existing.updated_at = updatedAt;
      } else {
        this.brandings.push({ company_id: companyId, updated_at: updatedAt });
      }
      return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
    }

    if (normalized.startsWith('INSERT INTO ORGANIZATION_SUBSCRIPTIONS')) {
      const [id, companyId, planName, currentPeriodStart, currentPeriodEnd] = bindings as [
        string,
        string,
        string,
        string,
        string,
      ];
      this.subscriptions.push({
        id,
        company_id: companyId,
        plan_name: planName,
        status: 'trialing',
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
      });
      return this.buildResult([], { rows_written: 1, changes: 1, changed_db: true });
    }

    return this.buildResult();
  }
}

export function createProvisioningEnv(): { env: Env; db: ProvisioningDbMock } {
  const db = new ProvisioningDbMock();
  const env = {
    LOGIN_ORIGIN: 'https://login.local',
    LOGIN_SERVICE: {
      fetch: async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'org-test',
                name: 'Test',
                slug: 'test',
                status: 'active',
                role: 'owner',
              },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    },
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
