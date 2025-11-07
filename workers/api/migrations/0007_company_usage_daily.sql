PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS company_usage_daily (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, usage_date, metric)
);

CREATE INDEX IF NOT EXISTS idx_company_usage_metric ON company_usage_daily(metric, usage_date);
