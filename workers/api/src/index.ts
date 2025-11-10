import {
  authenticateRequest,
  requireAuthenticatedSession,
  sessionSuccessResponse,
  sessionFailureResponse,
  authFailureResponse,
  type AuthenticatedSession,
} from './sessionAuth';

type AssetFetcher = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
};

export interface Env {
  DB?: D1Database;
  STORAGE?: R2Bucket;
  LOGIN_ORIGIN: string;
  BETTER_AUTH_URL?: string;
  LOGIN_SERVICE?: Fetcher;
  SESSION_COOKIE_DOMAIN?: string;
  APP_BASE_URL?: string;
  PROJECT_DOMAIN?: string;
  STRIPE_PRODUCTS?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  EXPO_PUBLIC_WORKER_ORIGIN?: string;
  ALLOW_PLACEHOLDER_DATA?: string;
  ASSETS?: AssetFetcher;
}

type AccountBranding = {
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  logoUrl?: string;
  tagline?: string;
  updatedAt: string;
};

type BrandingOverride = Partial<Omit<AccountBranding, 'updatedAt'>> & {
  updatedAt: string;
};

type AccountRecord = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  plan: string;
  createdAt: string;
  billingEmail?: string;
  brand: AccountBranding;
  stats: {
    activeMembers: number;
    pendingInvites: number;
    mrr: number;
    seats: number;
  };
};

type AccountMemberRecord = {
  id: string;
  accountId: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Billing' | 'Viewer';
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string;
  lastActiveAt?: string | null;
};

type InviteRole = AccountMemberRecord['role'];
type InviteStatus = 'pending' | 'accepted' | 'expired';

type AccountInviteRecord = {
  id: string;
  companyId: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  name?: string;
};

type SubscriptionSummary = {
  active: boolean;
  plan: string | null;
  renewsOn: string | null;
  seats: number;
};

type AssetObject = {
  key: string;
  size: number;
  uploaded: string | null;
};

const ACCOUNT_DATA: AccountRecord[] = [
  {
    id: 'acct-justevery',
    slug: 'justevery',
    name: 'justevery, inc.',
    industry: 'Developer Tools',
    plan: 'Scale',
    createdAt: '2024-01-05T10:00:00.000Z',
    billingEmail: 'billing@justevery.com',
    brand: {
      primaryColor: '#0f172a',
      secondaryColor: '#38bdf8',
      accentColor: '#facc15',
      logoUrl: 'https://dummyimage.com/200x48/0f172a/ffffff&text=justevery',
      tagline: 'Launch on day one',
      updatedAt: '2024-11-01T00:00:00.000Z'
    },
    stats: {
      activeMembers: 6,
      pendingInvites: 1,
      mrr: 5400,
      seats: 12
    }
  },
  {
    id: 'acct-aerion-labs',
    slug: 'aerion-labs',
    name: 'Aerion Labs',
    industry: 'Climate',
    plan: 'Launch',
    createdAt: '2024-05-18T09:30:00.000Z',
    billingEmail: 'finance@aerionlabs.com',
    brand: {
      primaryColor: '#052e16',
      secondaryColor: '#d9f99d',
      accentColor: '#34d399',
      logoUrl: 'https://dummyimage.com/200x48/052e16/d9f99d&text=Aerion',
      tagline: 'Instrumenting the built world',
      updatedAt: '2024-10-12T00:00:00.000Z'
    },
    stats: {
      activeMembers: 4,
      pendingInvites: 2,
      mrr: 2100,
      seats: 8
    }
  }
];

const ACCOUNT_MEMBERS: AccountMemberRecord[] = [
  {
    id: 'mbr-ava',
    accountId: 'acct-justevery',
    name: 'Ava Patel',
    email: 'ava@justevery.com',
    role: 'Owner',
    status: 'active',
    joinedAt: '2024-01-05T10:00:00.000Z',
    lastActiveAt: '2025-11-06T18:00:00.000Z'
  },
  {
    id: 'mbr-james',
    accountId: 'acct-justevery',
    name: 'James Peter',
    email: 'james@justevery.com',
    role: 'Admin',
    status: 'active',
    joinedAt: '2024-02-12T10:00:00.000Z',
    lastActiveAt: '2025-11-05T22:15:00.000Z'
  },
  {
    id: 'mbr-eloise',
    accountId: 'acct-justevery',
    name: 'Eloise Cho',
    email: 'eloise@justevery.com',
    role: 'Billing',
    status: 'invited',
    joinedAt: '2024-10-01T10:00:00.000Z'
  },
  {
    id: 'mbr-liam',
    accountId: 'acct-aerion-labs',
    name: 'Liam Vega',
    email: 'liam@aerionlabs.com',
    role: 'Owner',
    status: 'active',
    joinedAt: '2024-05-18T09:30:00.000Z',
    lastActiveAt: '2025-11-06T16:32:00.000Z'
  },
  {
    id: 'mbr-tara',
    accountId: 'acct-aerion-labs',
    name: 'Tara Malik',
    email: 'tara@aerionlabs.com',
    role: 'Viewer',
    status: 'active',
    joinedAt: '2024-06-01T12:00:00.000Z',
    lastActiveAt: '2025-11-04T08:00:00.000Z'
  }
];

const SAMPLE_ACCOUNT_IDS = new Set(ACCOUNT_DATA.map((account) => account.id));
const ACCOUNT_INVITE_STORE = new Map<string, AccountInviteRecord[]>();
const INVITE_ROLE_ORDER: InviteRole[] = ['Owner', 'Admin', 'Billing', 'Viewer'];
const FALLBACK_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

for (const account of ACCOUNT_DATA) {
  const seeded = ACCOUNT_MEMBERS
    .filter((member) => member.accountId === account.id && member.status === 'invited')
    .map<AccountInviteRecord>((member) => {
      const createdAt = member.joinedAt ?? new Date().toISOString();
      const expiresAt = new Date(new Date(createdAt).getTime() + FALLBACK_INVITE_EXPIRY_MS).toISOString();
      return {
        id: `seed-${member.id}`,
        companyId: account.id,
        email: member.email,
        role: member.role,
        status: 'pending',
        createdAt,
        expiresAt,
        name: member.name,
      };
    });
  if (seeded.length > 0) {
    ACCOUNT_INVITE_STORE.set(account.id, seeded);
  }
}

const ACCOUNT_BRANDING_OVERRIDES = new Map<string, BrandingOverride>();

type DbRow = Record<string, unknown>;

const COMPANY_SELECT = `
  SELECT
    c.id,
    c.slug,
    c.name,
    c.plan,
    c.industry,
    c.billing_email,
    c.created_at,
    b.primary_color,
    b.secondary_color,
    b.accent_color,
    b.logo_url,
    b.tagline,
    b.updated_at AS branding_updated_at,
    stats.active_members,
    stats.pending_invites,
    subs.seats,
    subs.mrr_cents
  FROM companies c
  LEFT JOIN company_branding_settings b ON b.company_id = c.id
  LEFT JOIN (
    SELECT company_id,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_members,
      SUM(CASE WHEN status = 'invited' THEN 1 ELSE 0 END) AS pending_invites
    FROM company_members
    GROUP BY company_id
  ) AS stats ON stats.company_id = c.id
  LEFT JOIN (
    SELECT company_id,
      COALESCE(MAX(seats), 0) AS seats,
      COALESCE(MAX(mrr_cents), 0) AS mrr_cents
    FROM company_subscriptions
    GROUP BY company_id
  ) AS subs ON subs.company_id = c.id
`;

const COMPANY_SUMMARY_SQL = `${COMPANY_SELECT} ORDER BY c.created_at ASC;`;

async function queryAll(db: D1Database, sql: string, bindings: unknown[] = []): Promise<DbRow[]> {
  const statement = db.prepare(sql).bind(...bindings);
  const result = await statement.all();
  return result.results ?? [];
}

async function queryFirst(db: D1Database, sql: string, bindings: unknown[] = []): Promise<DbRow | null> {
  const statement = db.prepare(sql).bind(...bindings);
  const result = await statement.first();
  return (result as DbRow | null) ?? null;
}

const DB_ERROR_TTL_MS = 60_000;
let lastDbErrorAt: number | null = null;
let lastDbLogAt: number | null = null;

function logDbError(context: string, error: unknown): void {
  const now = Date.now();
  lastDbErrorAt = now;
  if (!lastDbLogAt || now - lastDbLogAt > 5_000) {
    console.warn(`[D1] ${context} failed`, error);
    lastDbLogAt = now;
  }
}

function hasRecentDbError(): boolean {
  return lastDbErrorAt !== null && Date.now() - lastDbErrorAt < DB_ERROR_TTL_MS;
}

function numberFrom(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(num) ? num : fallback;
}

function stringFrom(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function mapDbCompany(row: DbRow): AccountRecord {
  const stats = {
    activeMembers: numberFrom(row.active_members),
    pendingInvites: numberFrom(row.pending_invites),
    mrr: Number((numberFrom(row.mrr_cents) / 100).toFixed(2)),
    seats: numberFrom(row.seats)
  } satisfies AccountRecord['stats'];

  const brand: AccountBranding = {
    primaryColor: stringFrom(row.primary_color, '#0f172a'),
    secondaryColor: stringFrom(row.secondary_color, '#38bdf8'),
    accentColor: row.accent_color ? String(row.accent_color) : undefined,
    logoUrl: row.logo_url ? String(row.logo_url) : undefined,
    tagline: row.tagline ? String(row.tagline) : undefined,
    updatedAt: stringFrom(row.branding_updated_at, new Date().toISOString())
  };

  return {
    id: stringFrom(row.id),
    slug: stringFrom(row.slug),
    name: stringFrom(row.name),
    plan: stringFrom(row.plan, 'Launch'),
    industry: row.industry ? String(row.industry) : 'General',
    createdAt: stringFrom(row.created_at, new Date().toISOString()),
    billingEmail: row.billing_email ? String(row.billing_email) : undefined,
    brand,
    stats
  } satisfies AccountRecord;
}

async function fetchCompaniesFromDb(env: Env): Promise<AccountRecord[] | null> {
  if (!env.DB) {
    logDbError('fetchCompaniesFromDb', 'D1 binding is not configured');
    return null;
  }
  try {
    const rows = await queryAll(env.DB, COMPANY_SUMMARY_SQL);
    return rows.map((row) => mapDbCompany(row));
  } catch (error) {
    logDbError('fetchCompaniesFromDb', error);
    return null;
  }
}

async function fetchCompanyBySlugFromDb(env: Env, slug: string): Promise<AccountRecord | null> {
  if (!env.DB) {
    logDbError('fetchCompanyBySlugFromDb', 'D1 binding is not configured');
    return null;
  }
  try {
    const rows = await queryAll(env.DB, `${COMPANY_SELECT} WHERE c.slug = ? LIMIT 1`, [slug]);
    if (rows.length === 0) {
      return null;
    }
    return mapDbCompany(rows[0]);
  } catch (error) {
    logDbError('fetchCompanyBySlugFromDb', error);
    return null;
  }
}

async function fetchMembersFromDb(env: Env, companyId: string): Promise<AccountMemberRecord[] | null> {
  if (!env.DB) {
    logDbError('fetchMembersFromDb', 'D1 binding is not configured');
    return null;
  }
  try {
    const rows = await queryAll(
      env.DB,
      `SELECT id, company_id, display_name, email, role, status, invited_at, accepted_at, last_active_at
       FROM company_members
       WHERE company_id = ?
       ORDER BY created_at ASC`,
      [companyId]
    );

    return rows.map((row) => ({
      id: stringFrom(row.id),
      accountId: stringFrom(row.company_id),
      name: stringFrom(row.display_name, stringFrom(row.email)),
      email: stringFrom(row.email),
      role: (stringFrom(row.role, 'viewer').charAt(0).toUpperCase() + stringFrom(row.role, 'viewer').slice(1)) as AccountMemberRecord['role'],
      status: (stringFrom(row.status, 'active')) as AccountMemberRecord['status'],
      joinedAt: stringFrom(row.accepted_at ?? row.invited_at ?? row.last_active_at ?? new Date().toISOString()),
      lastActiveAt: row.last_active_at ? String(row.last_active_at) : null
    }));
  } catch (error) {
    logDbError('fetchMembersFromDb', error);
    return null;
  }
}

async function fetchBrandingFromDb(env: Env, companyId: string): Promise<AccountBranding | null> {
  if (!env.DB) {
    logDbError('fetchBrandingFromDb', 'D1 binding is not configured');
    return null;
  }
  try {
    const row = await queryFirst(
      env.DB,
      `SELECT primary_color, secondary_color, accent_color, logo_url, tagline, updated_at
       FROM company_branding_settings WHERE company_id = ?`,
      [companyId]
    );
    if (!row) {
      return null;
    }
    return {
      primaryColor: stringFrom(row.primary_color, '#0f172a'),
      secondaryColor: stringFrom(row.secondary_color, '#38bdf8'),
      accentColor: row.accent_color ? String(row.accent_color) : undefined,
      logoUrl: row.logo_url ? String(row.logo_url) : undefined,
      tagline: row.tagline ? String(row.tagline) : undefined,
      updatedAt: stringFrom(row.updated_at, new Date().toISOString())
    };
  } catch (error) {
    logDbError('fetchBrandingFromDb', error);
    return null;
  }
}

async function fetchUsagePointsFromDb(env: Env, companyId: string, days = 7): Promise<Array<{ bucket: string; requests: number; storageGb: number }> | null> {
  if (!env.DB) {
    logDbError('fetchUsagePointsFromDb', 'D1 binding is not configured');
    return null;
  }
  let rows: DbRow[] = [];
  try {
    rows = await queryAll(
      env.DB,
      `SELECT usage_date, metric, value FROM company_usage_daily
       WHERE company_id = ?
       ORDER BY usage_date DESC
       LIMIT ?`,
      [companyId, days * 2]
    );
  } catch (error) {
    logDbError('fetchUsagePointsFromDb', error);
    return null;
  }
  const map = new Map<string, { requests: number; storageGb: number }>();
  for (const row of rows) {
    const bucket = stringFrom(row.usage_date, new Date().toISOString().slice(0, 10));
    const metric = stringFrom(row.metric);
    const value = numberFrom(row.value);
    const entry = map.get(bucket) ?? { requests: 0, storageGb: 0 };
    if (metric === 'requests') {
      entry.requests = value;
    } else if (metric === 'storage_mb') {
      entry.storageGb = Number((value / 1024).toFixed(2));
    }
    map.set(bucket, entry);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, values]) => ({ bucket, ...values }));
}

async function fetchSubscriptionSummaryFromDb(env: Env, companyId: string): Promise<SubscriptionSummary | null> {
  if (!env.DB) {
    logDbError('fetchSubscriptionSummaryFromDb', 'D1 binding is not configured');
    return null;
  }
  try {
    const row = await queryFirst(
      env.DB,
      `SELECT plan_name, status, seats, current_period_end, mrr_cents
       FROM company_subscriptions
       WHERE company_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [companyId]
    );
    if (!row) {
      return null;
    }
    return {
      active: stringFrom(row.status, 'active') === 'active',
      plan: row.plan_name ? String(row.plan_name) : null,
      renewsOn: row.current_period_end ? String(row.current_period_end) : null,
      seats: numberFrom(row.seats)
    };
  } catch (error) {
    logDbError('fetchSubscriptionSummaryFromDb', error);
    return null;
  }
}

async function fetchAssetsFromDb(env: Env, companyId: string): Promise<AssetObject[] | null> {
  if (!env.DB) {
    logDbError('fetchAssetsFromDb', 'D1 binding is not configured');
    return null;
  }
  try {
    const rows = await queryAll(
      env.DB,
      `SELECT storage_key, size_bytes, uploaded_at
       FROM company_assets
       WHERE company_id = ?
       ORDER BY uploaded_at DESC
       LIMIT 100`,
      [companyId]
    );
    return rows.map((row) => ({
      key: stringFrom(row.storage_key),
      size: numberFrom(row.size_bytes),
      uploaded: row.uploaded_at ? String(row.uploaded_at) : null
    }));
  } catch (error) {
    logDbError('fetchAssetsFromDb', error);
    return null;
  }
}

async function fetchInvitesFromDb(env: Env, companyId: string): Promise<AccountInviteRecord[] | null> {
  if (!env.DB) {
    logDbError('fetchInvitesFromDb', 'D1 binding is not configured');
    return null;
  }
  try {
    const rows = await queryAll(
      env.DB,
      `SELECT id, email, role, status, expires_at, created_at
       FROM member_invites WHERE company_id = ? ORDER BY created_at DESC`,
      [companyId]
    );
    return rows.map((row) => ({
      id: stringFrom(row.id),
      companyId,
      email: stringFrom(row.email),
      role: normaliseInviteRole(row.role as string | undefined) ?? 'Viewer',
      status: normaliseInviteStatus(row.status),
      createdAt: stringFrom(row.created_at, new Date().toISOString()),
      expiresAt: stringFrom(row.expires_at, new Date(Date.now() + FALLBACK_INVITE_EXPIRY_MS).toISOString()),
      name: undefined,
    }));
  } catch (error) {
    logDbError('fetchInvitesFromDb', error);
    return null;
  }
}

async function createInviteInDb(env: Env, companyId: string, email: string, role: InviteRole): Promise<void> {
  if (!env.DB) {
    return;
  }
  const id = `inv-${generateSessionId()}`;
  const token = `${generateSessionId()}-${generateSessionId()}`;
  try {
    await env.DB.prepare(
      `INSERT INTO member_invites (id, company_id, email, role, token, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now', '+7 days'))`
    )
      .bind(id, companyId, email, role.toLowerCase(), token)
      .run();
  } catch (error) {
    logDbError('createInviteInDb', error);
    throw error;
  }
}

async function linkAuditLogWithCompany(env: Env, auditId: string, companyId: string | null): Promise<void> {
  if (!env.DB || !companyId) {
    return;
  }
  await env.DB.prepare(
    `INSERT INTO audit_log_company_links (audit_log_id, company_id)
     VALUES (?1, ?2)
     ON CONFLICT(audit_log_id) DO UPDATE SET company_id=excluded.company_id`
  )
    .bind(auditId, companyId)
    .run();
}

function fallbackCompanies(): AccountRecord[] {
  return ACCOUNT_DATA.map((account) => ({
    ...account,
    stats: { ...account.stats },
    brand: { ...account.brand },
  }));
}

function fallbackMembers(companyId: string): AccountMemberRecord[] {
  return ACCOUNT_MEMBERS.filter((member) => member.accountId === companyId).map((member) => ({ ...member }));
}

function fallbackInvites(accountId: string): AccountInviteRecord[] {
  const list = ensureFallbackInviteStore(accountId);
  return list.map((invite) => ({ ...invite }));
}

function ensureFallbackInviteStore(accountId: string): AccountInviteRecord[] {
  if (!ACCOUNT_INVITE_STORE.has(accountId)) {
    ACCOUNT_INVITE_STORE.set(accountId, []);
  }
  return ACCOUNT_INVITE_STORE.get(accountId)!;
}

function appendFallbackInvite(accountId: string, invite: AccountInviteRecord): void {
  const existing = ensureFallbackInviteStore(accountId);
  ACCOUNT_INVITE_STORE.set(accountId, [invite, ...existing]);
}

function createFallbackInviteRecord(
  accountId: string,
  email: string,
  role: InviteRole,
  name?: string
): AccountInviteRecord {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + FALLBACK_INVITE_EXPIRY_MS);
  return {
    id: `inv-${generateSessionId()}`,
    companyId: accountId,
    email,
    role,
    status: 'pending',
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    name,
  };
}

function normaliseInviteRole(value?: string | null): InviteRole | null {
  if (!value) {
    return null;
  }
  const lower = value.toLowerCase();
  return INVITE_ROLE_ORDER.find((role) => role.toLowerCase() === lower) ?? null;
}

function normaliseInviteStatus(value?: unknown): InviteStatus {
  if (typeof value !== 'string') {
    return 'pending';
  }
  const lower = value.toLowerCase();
  if (lower === 'accepted' || lower === 'expired') {
    return lower;
  }
  return 'pending';
}

const LOCAL_PLACEHOLDER_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function shouldAllowPlaceholderData(request: Request, env: Env): boolean {
  if (env.ALLOW_PLACEHOLDER_DATA) {
    return env.ALLOW_PLACEHOLDER_DATA.toLowerCase() === 'true';
  }
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (LOCAL_PLACEHOLDER_HOSTS.has(hostname)) {
    return true;
  }
  if (hostname.endsWith('.workers.dev') || hostname.endsWith('.pages.dev')) {
    return true;
  }
  const projectHost = extractHostname(env.PROJECT_DOMAIN);
  if (projectHost && hostname === projectHost) {
    return false;
  }
  return false;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  json: "application/json; charset=UTF-8",
  txt: "text/plain; charset=UTF-8",
  html: "text/html; charset=UTF-8",
  css: "text/css; charset=UTF-8",
  js: "application/javascript; charset=UTF-8",
  mjs: "application/javascript; charset=UTF-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  pdf: "application/pdf",
};

const textEncoder = new TextEncoder();

const STATIC_ASSET_PREFIXES = ["/_expo/", "/assets/"];
const STATIC_ASSET_PATHS = new Set(["/favicon.ico", "/index.html", "/manifest.json"]);
const SPA_EXTRA_ROUTES = ["/callback", "/app", "/logout"];
const PRERENDER_ROUTES: Record<string, string> = {
  '/': 'index.html',
  '/pricing': 'pricing.html',
  '/contact': 'contact.html'
};
const MARKETING_ROUTE_PREFIX = "/marketing/";

type RuntimeEnvPayload = {
  workerOrigin: string | null;
  workerOriginLocal: string | null;
  loginOrigin: string | null;
};

function isStaticAssetPath(pathname: string): boolean {
  if (STATIC_ASSET_PATHS.has(pathname)) {
    return true;
  }
  for (const prefix of STATIC_ASSET_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function normaliseAppBasePath(raw: string | undefined): string {
  if (!raw) {
    return "/app";
  }

  let candidate = raw.trim();
  if (!candidate) {
    return "/app";
  }

  if (!candidate.startsWith("/")) {
    try {
      const parsed = new URL(candidate);
      candidate = parsed.pathname || "/app";
    } catch {
      candidate = `/${candidate}`;
    }
  }

  if (!candidate.startsWith("/")) {
    candidate = `/${candidate}`;
  }

  if (candidate.length > 1) {
    candidate = candidate.replace(/\/+$/, "");
  }

  return candidate || "/app";
}

function shouldServeAppShell(pathname: string, env: Env): boolean {
  const base = normaliseAppBasePath(env.APP_BASE_URL);
  if (pathname === base) {
    return true;
  }
  if (base !== "/" && pathname.startsWith(`${base}/`)) {
    return true;
  }

  for (const route of SPA_EXTRA_ROUTES) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      return true;
    }
  }

  return false;
}

async function serveStaticAsset(request: Request, env: Env): Promise<Response | null> {
  if (!env.ASSETS) {
    return htmlResponse(await landingPageHtml(env));
  }

  try {
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      return null;
    }
    return response;
  } catch (error) {
    console.warn("Asset fetch failed", error);
    return null;
  }
}

function isBot(userAgent: string | null): boolean {
  if (!userAgent) {
    return false;
  }
  const patterns = [
    /bot/i,
    /crawl/i,
    /spider/i,
    /slurp/i,
    /bing/i,
    /yahoo/i,
    /duckduckgo/i,
    /baidu/i,
    /yandex/i,
    /facebot/i,
    /facebookexternalhit/i,
    /linkedinbot/i,
    /twitterbot/i,
    /embedly/i,
    /quora link preview/i,
    /pinterest/i,
    /redditbot/i,
    /slackbot/i,
    /discordbot/i,
    /telegrambot/i
  ];
  return patterns.some((regex) => regex.test(userAgent));
}

async function servePrerenderedHtml(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (!env.ASSETS) {
    return htmlResponse(await landingPageHtml(env));
  }
  const assetSuffix = PRERENDER_ROUTES[pathname];
  if (assetSuffix === undefined) {
    return null;
  }

  const assetPath = `/prerendered/${assetSuffix}`;
  const assetUrl = new URL(assetPath, request.url).toString();
  const prerenderResponse = await env.ASSETS.fetch(assetUrl);
  if (!prerenderResponse || !prerenderResponse.ok) {
    console.warn('Prerender asset missing', {
      pathname,
      assetPath,
      status: prerenderResponse?.status
    });
    return htmlResponse(await landingPageHtml(env));
  }

  let html = await prerenderResponse.text();
  html = injectRuntimeEnv(html, resolveRuntimeEnvPayload(env, request));

  const userAgent = request.headers.get('user-agent');
  const cacheHeader = isBot(userAgent)
    ? 'public, max-age=3600, stale-while-revalidate=86400'
    : 'no-cache';

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheHeader,
      'Vary': 'User-Agent',
      'X-Prerender-Route': pathname,
      'X-Prerender-Asset': assetPath,
    }
  });
}

async function serveAppShell(request: Request, env: Env): Promise<Response | null> {
  if (!env.ASSETS) {
    return null;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const url = new URL(request.url);
  const baseOrigin = `${url.protocol}//${url.host}`;
  const indexUrl = new URL("/index.html", baseOrigin);
  const assetRequest = new Request(indexUrl.toString(), {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: request.headers,
  });

  try {
    const response = await env.ASSETS.fetch(assetRequest);
    if (response.status >= 400) {
      return htmlResponse(await landingPageHtml(env));
    }

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "text/html; charset=UTF-8");
    if (!headers.has("Cache-Control")) {
      headers.set("Cache-Control", "no-store, max-age=0");
    }

    try {
      const html = await response.text();
      const payload = resolveRuntimeEnvPayload(env, request);
      const injected = injectRuntimeEnv(html, payload);

      return new Response(injected, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn("Failed to inject runtime env", error);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  } catch (error) {
    console.warn("Failed to serve app shell", error);
    return htmlResponse(await landingPageHtml(env));
  }
}

function resolveRuntimeEnvPayload(env: Env, request: Request): RuntimeEnvPayload {
  const { origin: requestOrigin } = new URL(request.url);
  return {
    workerOrigin: resolveWorkerOrigin(env, requestOrigin),
    workerOriginLocal: null,
    loginOrigin: env.LOGIN_ORIGIN,
  };
}

function resolveWorkerOrigin(env: Env, requestOrigin?: string): string | null {
  const configured = env.EXPO_PUBLIC_WORKER_ORIGIN;
  if (requestOrigin) {
    const host = new URL(requestOrigin).hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return requestOrigin;
    }
  }

  if (configured) {
    return configured;
  }

  if (requestOrigin) {
    return requestOrigin;
  }

  const landing = env.PROJECT_DOMAIN ? extractOriginFromUrl(env.PROJECT_DOMAIN) : null;
  return landing ?? null;
}

function extractOriginFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function injectRuntimeEnv(html: string, payload: RuntimeEnvPayload): string {
  const scriptContent = `(() => {
    const env = ${JSON.stringify(payload)};
    window.__JUSTEVERY_ENV__ = env;
    try {
      if (typeof window.dispatchEvent === 'function') {
        const detail = {
          workerOrigin: env.workerOrigin,
          workerOriginLocal: env.workerOriginLocal,
          loginOrigin: env.loginOrigin,
        };
        const event = typeof CustomEvent === 'function'
          ? new CustomEvent('justevery:env-ready', { detail })
          : new Event('justevery:env-ready');
        if ('detail' in event && event.detail && typeof event.detail === 'object') {
          Object.assign(event.detail, detail);
        }
        window.dispatchEvent(event);
      }
    } catch (eventError) {
      console.warn('Failed to dispatch env-ready event', eventError);
    }
  })();`;

  const script = `<script>${scriptContent}</script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}</head>`);
  }
  if (html.includes("<body")) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${script}`);
  }
  return `${script}${html}`;
}

const Worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = normalisePath(url.pathname);

    // Basic CORS for API endpoints
    if (request.method === "OPTIONS") {
      if (pathname.startsWith("/api/")) {
        return cors(new Response(null, { status: 204 }));
      }
    }

    if (isStaticAssetPath(pathname)) {
      const assetResponse = await serveStaticAsset(request, env);
      if (assetResponse) {
        return assetResponse;
      }
    }

    if (pathname === "/marketing" || pathname.startsWith(MARKETING_ROUTE_PREFIX)) {
      return handleMarketingAsset(request, env, pathname);
    }

    const prerenderResponse = await servePrerenderedHtml(request, env, pathname);
    if (prerenderResponse) {
      return prerenderResponse;
    }

    if (pathname === "/api/accounts" || pathname.startsWith("/api/accounts/")) {
      return handleAccountsRoute(request, env, pathname);
    }

    switch (pathname) {
      case "/checkout":
        return jsonResponse({
          ok: true,
          message: 'Checkout placeholder',
          hint: 'Configure Stripe Checkout and redirect here',
        });
      case "/app/shell":
        return htmlResponse(workerShellHtml(env));
      case "/api/session":
        return handleSessionApi(request, env);
      case "/api/session/bootstrap":
        return handleSessionBootstrap(request, env);
      case "/api/me":
        return handleMe(request, env);
      case "/api/assets/list":
        return handleAssetsList(request, env);
      case "/api/assets/get":
        return handleAssetsGet(request, env);
      case "/api/assets/put":
        return handleAssetsPut(request, env);
      case "/api/assets/delete":
        return handleAssetsDelete(request, env);
      case "/api/stripe/products":
        return handleStripeProducts(env);
      case "/api/status":
        return handleStatus(request, env);
      case "/api/subscription":
        return handleSubscription(request, env);
      case "/api/runtime-env":
        return jsonResponse(resolveRuntimeEnvPayload(env, request));
      case "/webhook/stripe":
        return handleStripeWebhook(request, env);
      default:
        break;
    }

    if (shouldServeAppShell(pathname, env)) {
      const appShellResponse = await serveAppShell(request, env);
      if (appShellResponse) {
        return appShellResponse;
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

export default Worker;

function normalisePath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

async function buildAccountSummaries(env: Env, allowFallback: boolean): Promise<AccountRecord[] | null> {
  const fromDb = await fetchCompaniesFromDb(env);
  if (fromDb !== null && fromDb.length > 0) {
    return fromDb;
  }

  const shouldFallback = allowFallback || !env.DB || hasRecentDbError() || fromDb === null;
  if (shouldFallback) {
    return fallbackCompanies();
  }

  return fromDb;
}

async function resolveAccountBySlug(env: Env, slug: string, allowFallback: boolean): Promise<AccountRecord | undefined> {
  const fromDb = await fetchCompanyBySlugFromDb(env, slug);
  if (fromDb) {
    return fromDb;
  }

  const shouldFallback = allowFallback || !env.DB || hasRecentDbError();
  if (shouldFallback) {
    return fallbackCompanies().find((account) => account.slug === slug);
  }

  return undefined;
}

function mapAccountResponse(account: AccountRecord): Record<string, unknown> {
  return {
    id: account.id,
    slug: account.slug,
    name: account.name,
    plan: account.plan,
    industry: account.industry,
    createdAt: account.createdAt,
    billingEmail: account.billingEmail,
    stats: {
      ...account.stats,
      pendingInvites: resolvePendingInvitesCount(account),
    },
    branding: resolveBranding(account)
  };
}

function resolveBranding(account: AccountRecord): AccountBranding {
  const override = ACCOUNT_BRANDING_OVERRIDES.get(account.id);
  if (!override) {
    return account.brand;
  }
  return {
    primaryColor: override.primaryColor ?? account.brand.primaryColor,
    secondaryColor: override.secondaryColor ?? account.brand.secondaryColor,
    accentColor: override.accentColor ?? account.brand.accentColor,
    logoUrl: override.logoUrl ?? account.brand.logoUrl,
    tagline: override.tagline ?? account.brand.tagline,
    updatedAt: override.updatedAt
  };
}

function resolvePendingInvitesCount(account: AccountRecord): number {
  if (SAMPLE_ACCOUNT_IDS.has(account.id) && ACCOUNT_INVITE_STORE.has(account.id)) {
    return ACCOUNT_INVITE_STORE.get(account.id)!.length;
  }
  return account.stats.pendingInvites;
}

function fallbackUsage(companyId: string): Array<{ bucket: string; requests: number; storageGb: number }> {
  const base = [
    { bucket: '2025-11-01', requests: 12000, storageGb: 1.2 },
    { bucket: '2025-11-02', requests: 13000, storageGb: 1.28 },
    { bucket: '2025-11-03', requests: 14000, storageGb: 1.35 },
    { bucket: '2025-11-04', requests: 15000, storageGb: 1.42 },
    { bucket: '2025-11-05', requests: 16000, storageGb: 1.5 }
  ];
  return base.map((point, idx) => ({
    ...point,
    bucket: new Date(Date.now() - idx * 86400000).toISOString().slice(0, 10)
  }));
}

function fallbackSubscription(companyId: string): SubscriptionSummary {
  const account = ACCOUNT_DATA.find((acct) => acct.id === companyId);
  return {
    active: true,
    plan: account?.plan ?? 'Launch',
    renewsOn: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    seats: account?.stats.seats ?? 5
  };
}

function fallbackAssetsList(): AssetObject[] {
  return [
    { key: 'uploads/branding/logo.png', size: 182034, uploaded: '2025-11-05T16:12:00.000Z' },
    { key: 'uploads/invoices/2024-09.pdf', size: 58234, uploaded: '2024-09-30T08:00:00.000Z' }
  ];
}

function extractHostname(value?: string): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normaliseHexColor(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const normalised = prefixed.length === 4
    ? `#${prefixed[1]}${prefixed[1]}${prefixed[2]}${prefixed[2]}${prefixed[3]}${prefixed[3]}`
    : prefixed;
  if (!/^#[0-9a-fA-F]{6}$/.test(normalised)) {
    return null;
  }
  return normalised.toLowerCase();
}

function buildSessionCookie(token: string, env: Env, expiresAt?: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const parts = [
    `better-auth.session_token=${encodeURIComponent(trimmed)}`,
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=None',
  ];

  const domain = env.SESSION_COOKIE_DOMAIN?.trim();
  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  if (expiresAt) {
    const expires = new Date(expiresAt);
    if (!Number.isNaN(expires.getTime())) {
      parts.push(`Expires=${expires.toUTCString()}`);
    }
  }

  return parts.join('; ');
}

function normalisePublicUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

async function handleSessionApi(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return sessionFailureResponse(auth);
  }

  return sessionSuccessResponse(auth.session);
}

type SessionSnapshot = {
  session?: {
    expiresAt?: string;
    token?: string;
    [key: string]: unknown;
  };
  user?: Record<string, unknown> | null;
  [key: string]: unknown;
};

async function handleSessionBootstrap(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const token = typeof payload === 'object' && payload && 'token' in payload
    ? String((payload as { token?: string }).token ?? '').trim()
    : '';

  if (!token) {
    return jsonResponse({ error: 'invalid_token' }, 400);
  }

  const snapshot = typeof payload === 'object' && payload && 'session' in payload
    ? (payload as { session?: SessionSnapshot }).session
    : undefined;

  let expiresAt: string | undefined;
  if (isSessionSnapshot(snapshot)) {
    expiresAt = snapshot.session?.expiresAt;
  } else {
    const probeRequest = new Request(request.url, {
      headers: {
        cookie: `better-auth.session_token=${encodeURIComponent(token)}`,
      },
    });

    const authResult = await authenticateRequest(probeRequest, env);
    if (!authResult.ok) {
      return authFailureResponse(authResult);
    }
    expiresAt = authResult.session.expiresAt;
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  const sessionCookie = buildSessionCookie(token, env, expiresAt);
  if (sessionCookie) {
    headers.append('Set-Cookie', sessionCookie);
  }

  return new Response(JSON.stringify({ ok: true, cached: Boolean(snapshot) }), {
    status: 200,
    headers,
  });
}

function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const session = (value as SessionSnapshot).session;
  return Boolean(session && typeof session === 'object');
}

async function handleMarketingAsset(request: Request, env: Env, pathname: string): Promise<Response> {
  if (!env.STORAGE) {
    return jsonResponse({ error: "storage_not_configured", hint: 'Bind CLOUDFLARE_R2_BUCKET or run `pnpm bootstrap:env` to provision starter-assets.' }, 503);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const suffix = pathname.length > MARKETING_ROUTE_PREFIX.length
    ? pathname.slice(MARKETING_ROUTE_PREFIX.length)
    : "";
  const key = parseMarketingKey(suffix);
  if (!key) {
    return jsonResponse({ error: "Not Found" }, 404);
  }

  try {
    const metadata = request.method === "HEAD"
      ? await env.STORAGE.head(key)
      : await env.STORAGE.get(key);

    if (!metadata) {
      return jsonResponse({ error: "Not Found" }, 404);
    }

    const headers = new Headers();
    const extension = key.split(".").pop()?.toLowerCase() ?? "";
    const contentType = metadata.httpMetadata?.contentType ?? CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
    headers.set("Content-Type", contentType);
    headers.set(
      "Cache-Control",
      metadata.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable",
    );
    headers.set("Access-Control-Allow-Origin", "*");
    if (typeof metadata.size === "number") {
      headers.set("Content-Length", metadata.size.toString());
    }

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }

    const objectBody = (metadata as { body?: ReadableStream | null }).body;
    if (!objectBody) {
      return jsonResponse({ error: "Not Found" }, 404);
    }

    return new Response(objectBody, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Failed to serve marketing asset", error);
    return jsonResponse({ error: "Internal Server Error" }, 500);
  }
}

function extractProviderError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const { error, error_description: errorDescription } = payload as {
    error?: unknown;
    error_description?: unknown;
  };

  const errorText = typeof error === 'string' ? error : null;
  const descriptionText = typeof errorDescription === 'string' ? errorDescription : null;

  if (errorText && descriptionText) {
    return `${errorText}: ${descriptionText}`;
  }
  return descriptionText ?? errorText;
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const session = auth.session;

  return jsonResponse({
    authenticated: true,
    session: {
      email_address: session.emailAddress ?? null,
      session_id: session.sessionId,
      expires_at: session.expiresAt,
    },
  });
}

async function handleAccountsRoute(request: Request, env: Env, pathname: string): Promise<Response> {
  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }

  const allowFallback = shouldAllowPlaceholderData(request, env);

  if (pathname === "/api/accounts") {
    const accounts = await buildAccountSummaries(env, allowFallback);
    if (!accounts) {
      return dataUnavailableResponse(env);
    }
    return jsonResponse({
      accounts: accounts.map((account) => mapAccountResponse(account)),
      currentAccountId: accounts[0]?.id ?? null,
    });
  }

  const segments = pathname.split('/').filter(Boolean);
  const slug = segments[2];
  const action = segments[3];

  const account = await resolveAccountBySlug(env, slug, allowFallback);
  if (!account) {
    if (!allowFallback && (!env.DB || hasRecentDbError())) {
      return dataUnavailableResponse(env);
    }
    return jsonResponse({ error: 'Account not found' }, 404);
  }

  switch (action) {
    case 'members':
      return handleAccountMembers(account, auth.session, env, allowFallback);
    case 'branding':
      return handleAccountBranding(request, account, env);
    case 'usage':
      return handleAccountUsage(request, env, account, allowFallback);
    case 'assets':
      return handleAccountAssets(request, env, account, allowFallback);
    case 'subscription':
      return handleAccountSubscription(env, account, allowFallback);
    case 'invites':
      return handleAccountInvites(request, env, account, allowFallback);
    default:
      return jsonResponse({
        account: mapAccountResponse(account)
      });
  }
}

async function handleAccountMembers(
  account: AccountRecord,
  session: AuthenticatedSession,
  env: Env,
  allowFallback: boolean
): Promise<Response> {
  const membersFromDb = await fetchMembersFromDb(env, account.id);
  const shouldFallback = allowFallback || !env.DB || hasRecentDbError();
  if (!membersFromDb && !shouldFallback) {
    return dataUnavailableResponse(env);
  }
  const members = membersFromDb ?? fallbackMembers(account.id);

  return jsonResponse({
    accountId: account.id,
    members,
    viewer: {
      userId: session.userId,
      email: session.emailAddress ?? null
    }
  });
}

async function handleAccountBranding(
  request: Request,
  account: AccountRecord,
  env: Env
): Promise<Response> {
  if (request.method !== 'PATCH' && request.method !== 'PUT') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const updates: BrandingOverride = {
    updatedAt: new Date().toISOString()
  };

  if (typeof payload.primaryColor === 'string') {
    const normalised = normaliseHexColor(payload.primaryColor);
    if (!normalised) {
      return jsonResponse({ error: 'primaryColor must be a valid hex color' }, 400);
    }
    updates.primaryColor = normalised;
  }

  if (typeof payload.secondaryColor === 'string') {
    const normalised = normaliseHexColor(payload.secondaryColor);
    if (!normalised) {
      return jsonResponse({ error: 'secondaryColor must be a valid hex color' }, 400);
    }
    updates.secondaryColor = normalised;
  }

  if (typeof payload.accentColor === 'string') {
    const normalised = normaliseHexColor(payload.accentColor);
    if (!normalised) {
      return jsonResponse({ error: 'accentColor must be a valid hex color' }, 400);
    }
    updates.accentColor = normalised;
  }

  if (typeof payload.logoUrl === 'string') {
    const normalised = normalisePublicUrl(payload.logoUrl);
    if (!normalised) {
      return jsonResponse({ error: 'logoUrl must be an absolute http(s) URL' }, 400);
    }
    updates.logoUrl = normalised;
  }

  if (typeof payload.tagline === 'string') {
    updates.tagline = payload.tagline.trim().slice(0, 120);
  }

  if (env.DB) {
    try {
      await env.DB.prepare(
        `UPDATE company_branding_settings
         SET primary_color = COALESCE(?1, primary_color),
             secondary_color = COALESCE(?2, secondary_color),
             accent_color = COALESCE(?3, accent_color),
             logo_url = COALESCE(?4, logo_url),
             tagline = COALESCE(?5, tagline),
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?6`
      )
        .bind(
          updates.primaryColor ?? null,
          updates.secondaryColor ?? null,
          updates.accentColor ?? null,
          updates.logoUrl ?? null,
          updates.tagline ?? null,
          account.id
        )
        .run();

      const refreshedBranding = await fetchBrandingFromDb(env, account.id);
      if (refreshedBranding) {
        ACCOUNT_BRANDING_OVERRIDES.delete(account.id);
        return jsonResponse({ ok: true, branding: refreshedBranding });
      }
    } catch (error) {
      logDbError('handleAccountBranding', error);
    }
  }

  const existing = ACCOUNT_BRANDING_OVERRIDES.get(account.id) ?? {};
  ACCOUNT_BRANDING_OVERRIDES.set(account.id, {
    ...existing,
    ...updates
  });

  return jsonResponse({
    ok: true,
    branding: resolveBranding(account)
  });
}

async function handleAssetsList(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!env.STORAGE) {
    return jsonResponse({ error: "Storage binding not configured" }, 503);
  }

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }

  const url = new URL(request.url);
  const prefix = parseKey(url.searchParams.get("prefix"), { allowEmpty: true });
  if (prefix === null) {
    return jsonResponse({ error: "Invalid prefix" }, 400);
  }

  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limitValue = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  const limit =
    limitValue && Number.isFinite(limitValue)
      ? Math.min(Math.max(limitValue, 1), 1000)
      : undefined;

  const list = await env.STORAGE.list({
    prefix: prefix === "" ? undefined : prefix,
    cursor,
    limit,
  });

  const nextCursor = 'cursor' in list ? (list as { cursor?: string }).cursor : undefined;

  return jsonResponse({
    prefix,
    objects: list.objects.map((object) => ({
      key: object.key,
      size: object.size,
      etag: object.etag,
      uploaded: object.uploaded ? object.uploaded.toISOString() : null,
    })),
    cursor: nextCursor ?? null,
    truncated: list.truncated,
  });
}

async function handleAssetsGet(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!env.STORAGE) {
    return jsonResponse({ error: "Storage binding not configured" }, 503);
  }

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }

  const url = new URL(request.url);
  const key = parseKey(url.searchParams.get("key"));
  if (!key) {
    return jsonResponse({ error: "Missing or invalid key" }, 400);
  }

  const object = await env.STORAGE.get(key);
  if (!object) {
    return jsonResponse({ error: "Not Found" }, 404);
  }

  const etag = object.httpEtag ?? object.etag ?? undefined;
  const ifNoneMatch = request.headers.get("if-none-match");
  const cacheControl = object.httpMetadata?.cacheControl ?? "private, max-age=60";
  const lastModified = object.uploaded ? object.uploaded.toUTCString() : undefined;
  if (etag && ifNoneMatch === etag) {
    const headers = new Headers({ ETag: etag, "Cache-Control": cacheControl });
    if (lastModified) headers.set("Last-Modified", lastModified);
    return cors(new Response(null, { status: 304, headers }));
  }

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  const extension = key.split(".").pop()?.toLowerCase();
  if (!headers.has("Content-Type")) {
    headers.set(
      "Content-Type",
      extension
        ? CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream"
        : "application/octet-stream",
    );
  }
  headers.set("Cache-Control", cacheControl);
  if (lastModified) headers.set("Last-Modified", lastModified);
  if (etag) headers.set("ETag", etag);
  if (typeof object.size === "number") {
    headers.set("Content-Length", object.size.toString());
  }

  return cors(
    new Response(object.body, {
      status: 200,
      headers,
    }),
  );
}

async function handleAssetsPut(request: Request, env: Env): Promise<Response> {
  if (request.method !== "PUT") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!env.STORAGE) {
    return jsonResponse({ error: "Storage binding not configured" }, 503);
  }

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }

  const url = new URL(request.url);
  const key = parseKey(url.searchParams.get("key"));
  if (!key) {
    return jsonResponse({ error: "Missing or invalid key" }, 400);
  }

  const body = await request.arrayBuffer();
  const contentType = request.headers.get("content-type") ?? undefined;

  await env.STORAGE.put(key, body, {
    httpMetadata: contentType ? { contentType } : undefined,
  });

  const companyId = url.searchParams.get('companyId');
  if (companyId && env.DB) {
    await env.DB.prepare(
      `INSERT INTO company_assets (id, company_id, storage_key, scope, content_type, size_bytes)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET storage_key = excluded.storage_key, size_bytes = excluded.size_bytes, updated_at = CURRENT_TIMESTAMP`
    )
      .bind(
        `asset-${generateSessionId()}`,
        companyId,
        key,
        'uploads',
        contentType ?? null,
        body.byteLength
      )
      .run();
  }

  return jsonResponse({ ok: true, key });
}

async function handleAssetsDelete(request: Request, env: Env): Promise<Response> {
  if (request.method !== "DELETE") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!env.STORAGE) {
    return jsonResponse({ error: "Storage binding not configured" }, 503);
  }

  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }

  const url = new URL(request.url);
  const key = parseKey(url.searchParams.get("key"));
  if (!key) {
    return jsonResponse({ error: "Missing or invalid key" }, 400);
  }

  await env.STORAGE.delete(key);

  return jsonResponse({ ok: true, deleted: key });
}

async function handleAccountUsage(
  request: Request,
  env: Env,
  account: AccountRecord,
  allowFallback: boolean
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }
  const url = new URL(request.url);
  const daysParam = url.searchParams.get('days');
  const days = daysParam ? Math.min(Math.max(Number.parseInt(daysParam, 10) || 7, 1), 31) : 7;
  const pointsFromDb = await fetchUsagePointsFromDb(env, account.id, days);
  const shouldFallback = allowFallback || !env.DB || hasRecentDbError();
  if (!pointsFromDb) {
    if (!shouldFallback) {
      return dataUnavailableResponse(env);
    }
    return jsonResponse({ points: fallbackUsage(account.id) });
  }
  return jsonResponse({ points: pointsFromDb });
}

async function handleAccountAssets(
  request: Request,
  env: Env,
  account: AccountRecord,
  allowFallback: boolean
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }
  const rows = await fetchAssetsFromDb(env, account.id);
  const shouldFallback = allowFallback || !env.DB || hasRecentDbError();
  if (!rows) {
    if (!shouldFallback) {
      return dataUnavailableResponse(env);
    }
    return jsonResponse({ assets: fallbackAssetsList() });
  }
  return jsonResponse({ assets: rows });
}

async function handleAccountSubscription(env: Env, account: AccountRecord, allowFallback: boolean): Promise<Response> {
  const summary = await fetchSubscriptionSummaryFromDb(env, account.id);
  const shouldFallback = allowFallback || !env.DB || hasRecentDbError();
  if (!summary) {
    if (!shouldFallback) {
      return dataUnavailableResponse(env);
    }
    return jsonResponse({ subscription: fallbackSubscription(account.id) });
  }
  return jsonResponse({ subscription: summary });
}

async function handleAccountInvites(
  request: Request,
  env: Env,
  account: AccountRecord,
  allowFallback: boolean
): Promise<Response> {
  const canUseFallback = allowFallback || !env.DB || hasRecentDbError();

  if (request.method === 'GET') {
    const invites = await fetchInvitesFromDb(env, account.id);
    if (invites) {
      return jsonResponse({ invites });
    }
    if (!canUseFallback) {
      return dataUnavailableResponse(env);
    }
    return jsonResponse({ invites: fallbackInvites(account.id) });
  }

  if (request.method === 'POST') {
    let payload: { email?: string; role?: string; name?: string };
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    const email = payload.email?.trim().toLowerCase();
    if (!email) {
      return jsonResponse({ error: 'Email is required' }, 400);
    }

    const role = normaliseInviteRole(payload.role ?? 'Viewer') ?? 'Viewer';

    try {
      await createInviteInDb(env, account.id, email, role);
      const invites = await fetchInvitesFromDb(env, account.id);
      if (invites) {
        return jsonResponse({ ok: true, invites }, 201);
      }
    } catch (error) {
      console.warn('Falling back to in-memory invite storage', error);
    }

    if (!canUseFallback) {
      return dataUnavailableResponse(env);
    }

    const displayName = payload.name?.trim();
    const inviteRecord = createFallbackInviteRecord(account.id, email, role, displayName && displayName.length > 0 ? displayName : undefined);
    appendFallbackInvite(account.id, inviteRecord);
    return jsonResponse({ ok: true, invites: fallbackInvites(account.id) }, 201);
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}

async function handleStripeProducts(env: Env): Promise<Response> {
  try {
    const products = parseStripeProducts(env.STRIPE_PRODUCTS);
    return jsonResponse({ products });
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

async function handleStatus(request: Request, env: Env): Promise<Response> {
  const timestamp = new Date().toISOString();
  const region = (request as Request & { cf?: { colo?: string } }).cf?.colo ?? null;
  return jsonResponse({ status: 'ok', timestamp, region, workerOrigin: env.EXPO_PUBLIC_WORKER_ORIGIN ?? env.PROJECT_DOMAIN ?? null });
}

async function handleSubscription(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuthenticatedSession(request, env);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const allowFallback = shouldAllowPlaceholderData(request, env);
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  let account: AccountRecord | undefined;
  if (slug) {
    account = await resolveAccountBySlug(env, slug, allowFallback);
  } else {
    const accounts = await buildAccountSummaries(env, allowFallback);
    account = accounts?.[0];
  }
  if (!account) {
    if (!allowFallback && (!env.DB || hasRecentDbError())) {
      return dataUnavailableResponse(env);
    }
    return jsonResponse({ error: 'Account not found' }, 404);
  }
  return handleAccountSubscription(env, account, allowFallback);
}

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const rawBody = await request.text();
  const isVerified = await verifyStripeSignature(request, rawBody, env);
  if (!isVerified) {
    return jsonResponse({ error: "Invalid or missing Stripe signature" }, 400);
  }

  try {
    const event = JSON.parse(rawBody);
    const auditId =
      typeof event?.id === "string" && event.id.trim() !== ""
        ? event.id
        : `stripe-${generateSessionId()}`;
    const auditAction =
      typeof event?.type === "string" && event.type.trim() !== ""
        ? event.type
        : "stripe.unknown";

    try {
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO audit_log (id, user_id, action, metadata) VALUES (?1, ?2, ?3, ?4)`,
      )
        .bind(auditId, null, auditAction, rawBody)
        .run();
    }
    } catch (dbError) {
      console.error("Failed to persist Stripe webhook event", dbError);
    }

    let linkedCompanyId: string | null = null;
    const stripeCustomerId = typeof event?.data?.object?.customer === 'string' ? event.data.object.customer : null;
    if (stripeCustomerId && env.DB) {
      const customerRow = await queryFirst(env.DB, `SELECT company_id FROM stripe_customers WHERE stripe_customer_id = ? LIMIT 1`, [stripeCustomerId]);
      linkedCompanyId = customerRow?.company_id ? String(customerRow.company_id) : null;
    }
    if (linkedCompanyId) {
      await linkAuditLogWithCompany(env, auditId, linkedCompanyId);
    }

    console.log("Stripe event received", event.type ?? "unknown", event.id ?? "");
  } catch (error) {
    console.warn("Stripe webhook JSON parse failed", error);
  }

  return jsonResponse({ ok: true }, 200);
}


function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
}

function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=UTF-8" });
  if (extraHeaders) {
    if (extraHeaders instanceof Headers) {
      extraHeaders.forEach((value, key) => headers.set(key, value));
    } else if (Array.isArray(extraHeaders)) {
      for (const [key, value] of extraHeaders) {
        headers.set(key, value);
      }
    } else if (typeof extraHeaders === 'object') {
      for (const [key, value] of Object.entries(extraHeaders)) {
        if (value !== undefined) {
          headers.set(key, value as string);
        }
      }
    }
  }

  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers,
    }),
  );
}

function dataUnavailableResponse(env: Env): Response {
  return jsonResponse(
    {
      error: 'data_unavailable',
      hint: 'Cloudflare D1 data is unavailable. Run `pnpm bootstrap:env` to provision or configure the DB binding.',
      project: env.PROJECT_DOMAIN ?? null,
    },
    503,
  );
}

function generateSessionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function resolveExpoBundlePath(env: Env): Promise<string | null> {
  if (!env.ASSETS) {
    return null;
  }

  try {
    const indexResponse = await env.ASSETS.fetch(new Request('https://placeholder/index.html'));
    if (!indexResponse.ok) {
      return null;
    }

    const html = await indexResponse.text();
    const scriptMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*>/);
    if (scriptMatch && scriptMatch[1]) {
      return scriptMatch[1];
    }
  } catch (error) {
    console.warn('Failed to resolve Expo bundle path', error);
  }

  return null;
}

async function landingPageHtml(env: Env): Promise<string> {
  const appUrl = env.APP_BASE_URL ?? "/app";
  const loginUrl = appUrl;
  const landingUrl = env.PROJECT_DOMAIN ?? "https://example.com";
  const bundlePath = await resolveExpoBundlePath(env);

  const runtimeShim = `<script id="justevery-runtime-shim">(function(){
      if (typeof globalThis === 'undefined') { return; }
      var target = globalThis;
      if (typeof target.nativePerformanceNow !== 'function') {
        var perf = target.performance && target.performance.now ? target.performance : { now: function () { return Date.now(); } };
        var nativeNow = perf.now.bind(perf);
        target.nativePerformanceNow = nativeNow;
        if (typeof window !== 'undefined' && !window.nativePerformanceNow) {
          window.nativePerformanceNow = nativeNow;
        }
      }
      if (!target.__JUSTEVERY_IMPORT_META_ENV__) {
        target.__JUSTEVERY_IMPORT_META_ENV__ = { MODE: 'production' };
      }
      if (typeof window !== 'undefined' && !window.__JUSTEVERY_IMPORT_META_ENV__) {
        window.__JUSTEVERY_IMPORT_META_ENV__ = target.__JUSTEVERY_IMPORT_META_ENV__;
      }
    })();</script>`;

  const bundleScript = bundlePath
    ? `<script src="${bundlePath}" defer></script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>justevery • Launch faster</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 20% 20%, #dbeafe, #111827); color: #0f172a; }
    main { padding: 2rem; border-radius: 1.5rem; backdrop-filter: blur(12px); background: rgba(255,255,255,0.82); max-width: 32rem; text-align: center; box-shadow: 0 30px 60px rgba(15,23,42,0.25); }
    h1 { font-size: clamp(2.6rem, 4vw, 3.2rem); margin-bottom: 1rem; }
    p { color: rgba(15,23,42,0.75); line-height: 1.5; margin-bottom: 2rem; }
    a.button { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.85rem 1.6rem; border-radius: 999px; background: #1d4ed8; color: white; text-decoration: none; font-weight: 600; letter-spacing: 0.02em; box-shadow: 0 20px 35px rgba(29,78,216,0.35); transition: transform 160ms ease, box-shadow 160ms ease; }
    a.button:hover { transform: translateY(-2px); box-shadow: 0 24px 45px rgba(29,78,216,0.4); }
    footer { margin-top: 1.5rem; font-size: 0.85rem; color: rgba(15,23,42,0.6); }
  </style>
  ${runtimeShim}
</head>
<body>
<main>
  <h1>Launch your product with confidence</h1>
  <p>justevery ships a turnkey stack powered by Cloudflare, Better Auth, and Stripe so you can focus on features, not plumbing. Sign in from the web client to obtain a session, then let the Worker validate every request.</p>
  <a class="button" href="${loginUrl}">Open the app →</a>
  <footer>Need the dashboard? Jump to <a href="${appUrl}">${appUrl}</a> or visit <a href="${landingUrl}">${landingUrl}</a>.</footer>
</main>
${bundleScript}
</body>
</html>`;
}

function workerShellHtml(env: Env): string {
  const origin = env.EXPO_PUBLIC_WORKER_ORIGIN ?? env.PROJECT_DOMAIN ?? '';
  const appUrl = env.APP_BASE_URL ?? '/app';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Worker Shell</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
      main { max-width: 640px; margin: 0 auto; padding: 48px 24px; display: grid; gap: 16px; }
      pre { background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: 12px; overflow: auto; }
      a { color: #38bdf8; }
    </style>
  </head>
  <body>
    <main>
      <h1>Cloudflare Worker Shell</h1>
      <p>This helper lives inside the deployed Worker so you can verify runtime configuration and open the dashboard from the same origin.</p>
      <ul>
        <li>Worker origin: <code>${origin || 'not configured'}</code></li>
        <li>App URL: <code>${appUrl}</code></li>
      </ul>
      <p><a href="${origin.replace(/\/+$/, '')}${appUrl}" target="_blank" rel="noopener">Open /app in new tab</a></p>
      <pre>${JSON.stringify({
        loginOrigin: env.LOGIN_ORIGIN || null,
        workerOrigin: origin || null,
      }, null, 2)}</pre>
    </main>
  </body>
</html>`;
}


function parseKey(
  raw: string | null,
  options: { allowEmpty?: boolean } = {},
): string | null {
  if (raw === null || raw === undefined) {
    return options.allowEmpty ? "" : null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return options.allowEmpty ? "" : null;
  }

  const normalised = trimmed.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!normalised) {
    return options.allowEmpty ? "" : null;
  }

  if (normalised.includes("..") || normalised.includes("\\") || normalised.includes("\0")) {
    return null;
  }

  return normalised;
}

function parseMarketingKey(raw: string): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  const candidate = parseKey(raw, {});
  if (!candidate) {
    return null;
  }

  if (candidate.endsWith('/')) {
    return null;
  }

  const fullKey = candidate.startsWith('marketing/') ? candidate : `marketing/${candidate}`;
  if (!fullKey.startsWith('marketing/') || fullKey === 'marketing/') {
    return null;
  }

  return fullKey;
}

function parseStripeProducts(raw: string | undefined): unknown[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.log("STRIPE_PRODUCTS not JSON, attempting to parse shorthand", error);
  }

  const shorthand = raw.split(";").map((segment) => segment.trim()).filter(Boolean);
  return shorthand.map((segment) => {
    const [namePart, rest] = segment.split(":");
    const [amount = "0", currency = "usd", interval = "month"] = (rest ?? "").split(",").map((piece) => piece.trim());
    return {
      name: namePart ?? "",
      amount: Number.parseInt(amount, 10) || 0,
      currency,
      interval,
    };
  });
}

async function safeJson(response: Response): Promise<unknown | null> {
  try {
    return await response.clone().json();
  } catch (error) {
    console.warn("Unable to parse JSON", error);
    return null;
  }
}

async function verifyStripeSignature(
  request: Request,
  payload: string,
  env: Env,
): Promise<boolean> {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("STRIPE_WEBHOOK_SECRET is not configured; rejecting webhook");
    return false;
  }

  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return false;
  }

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") {
      const parsed = Number.parseInt(value ?? "", 10);
      if (Number.isFinite(parsed)) {
        timestamp = parsed;
      }
    } else if (key === "v1" && value) {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, textEncoder.encode(signedPayload)),
    );
    const expectedHex = bufferToHex(digest);

    for (const signature of signatures) {
      if (timingSafeEqualHex(expectedHex, signature)) {
        return true;
      }
    }
  } catch (error) {
    console.error("Failed to verify Stripe signature", error);
    return false;
  }

  return false;
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(expected: string, candidate: string): boolean {
  if (expected.length !== candidate.length) {
    return false;
  }

  const expectedBytes = hexToUint8Array(expected);
  const candidateBytes = hexToUint8Array(candidate);
  if (expectedBytes.length !== candidateBytes.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expectedBytes.length; i += 1) {
    mismatch |= expectedBytes[i] ^ candidateBytes[i];
  }
  return mismatch === 0;
}

function hexToUint8Array(hex: string): Uint8Array {
  const normalised = hex.trim().toLowerCase();
  if (normalised.length % 2 !== 0) {
    return new Uint8Array();
  }

  const result = new Uint8Array(normalised.length / 2);
  for (let i = 0; i < normalised.length; i += 2) {
    const byte = Number.parseInt(normalised.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      return new Uint8Array();
    }
    result[i / 2] = byte;
  }
  return result;
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-session-token",
  );
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
