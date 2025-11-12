-- Migration number: 0001
-- Migration name: initial
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stytch_session_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT,
  app_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_project ON subscriptions(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  industry TEXT,
  plan TEXT,
  billing_email TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  default_currency TEXT NOT NULL DEFAULT 'usd',
  country TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_project ON companies(project_id);

CREATE TABLE IF NOT EXISTS company_members (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','billing','viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  invited_at TEXT,
  accepted_at TEXT,
  last_active_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, email),
  UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_role ON company_members(company_id, role);

CREATE TABLE IF NOT EXISTS member_invites (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','billing','viewer')),
  token TEXT NOT NULL UNIQUE,
  inviter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  accepted_member_id TEXT REFERENCES company_members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, email, status)
);

CREATE INDEX IF NOT EXISTS idx_member_invites_company ON member_invites(company_id, status);

CREATE TABLE IF NOT EXISTS company_branding_settings (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  primary_color TEXT,
  secondary_color TEXT,
  accent_color TEXT,
  logo_url TEXT,
  tagline TEXT,
  support_email TEXT,
  marketing_site_url TEXT,
  timezone TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_assets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'uploads',
  content_type TEXT,
  size_bytes INTEGER,
  checksum TEXT,
  uploaded_by TEXT REFERENCES company_members(id) ON DELETE SET NULL,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TEXT,
  UNIQUE(company_id, storage_key)
);

CREATE INDEX IF NOT EXISTS idx_company_assets_company ON company_assets(company_id, scope);

CREATE TABLE IF NOT EXISTS company_usage_daily (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, usage_date, metric)
);

CREATE INDEX IF NOT EXISTS idx_company_usage_metric ON company_usage_daily(metric, usage_date);

CREATE TABLE IF NOT EXISTS stripe_customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  billing_email TEXT,
  default_payment_method TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_subscriptions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  plan_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid')),
  seats INTEGER NOT NULL DEFAULT 0,
  mrr_cents INTEGER NOT NULL DEFAULT 0,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company ON company_subscriptions(company_id);

CREATE TABLE IF NOT EXISTS audit_log_company_links (
  audit_log_id TEXT PRIMARY KEY REFERENCES audit_log(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO company_branding_settings (company_id)
SELECT id FROM companies;
