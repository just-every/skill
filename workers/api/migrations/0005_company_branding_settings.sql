PRAGMA foreign_keys = ON;

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

INSERT OR IGNORE INTO company_branding_settings (company_id)
SELECT id FROM companies;
