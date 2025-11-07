PRAGMA foreign_keys = ON;

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
