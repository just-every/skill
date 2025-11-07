PRAGMA foreign_keys = ON;

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
