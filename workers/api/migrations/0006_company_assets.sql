PRAGMA foreign_keys = ON;

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
