-- Migration number: 0002
-- Migration name: seed_demo_data
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users (id, email)
VALUES
  ('usr-ava', 'ava@justevery.com'),
  ('usr-james', 'james@justevery.com'),
  ('usr-eloise', 'eloise@justevery.com'),
  ('usr-liam', 'liam@aerionlabs.com'),
  ('usr-tara', 'tara@aerionlabs.com');

INSERT INTO companies (id, slug, name, status, industry, plan, billing_email, default_currency)
SELECT 'acct-justevery', 'justevery', 'justevery, inc.', 'active', 'Developer Tools', 'Scale', 'billing@justevery.com', 'usd'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE id = 'acct-justevery');

INSERT INTO companies (id, slug, name, status, industry, plan, billing_email, default_currency)
SELECT 'acct-aerion-labs', 'aerion-labs', 'Aerion Labs', 'active', 'Climate', 'Launch', 'finance@aerionlabs.com', 'usd'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE id = 'acct-aerion-labs');

INSERT INTO company_branding_settings (company_id, primary_color, secondary_color, accent_color, logo_url, tagline)
VALUES
  ('acct-justevery', '#0f172a', '#38bdf8', '#facc15', 'https://dummyimage.com/200x48/0f172a/ffffff&text=justevery', 'Launch on day one'),
  ('acct-aerion-labs', '#052e16', '#d9f99d', '#34d399', 'https://dummyimage.com/200x48/052e16/d9f99d&text=Aerion', 'Instrumenting the built world')
ON CONFLICT(company_id) DO UPDATE SET
  primary_color=excluded.primary_color,
  secondary_color=excluded.secondary_color,
  accent_color=excluded.accent_color,
  logo_url=excluded.logo_url,
  tagline=excluded.tagline,
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO company_members (id, company_id, user_id, email, display_name, role, status, invited_at, accepted_at, last_active_at)
VALUES
  ('mbr-ava', 'acct-justevery', 'usr-ava', 'ava@justevery.com', 'Ava Patel', 'owner', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mbr-james', 'acct-justevery', 'usr-james', 'james@justevery.com', 'James Peter', 'admin', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mbr-eloise', 'acct-justevery', 'usr-eloise', 'eloise@justevery.com', 'Eloise Cho', 'billing', 'invited', CURRENT_TIMESTAMP, NULL, NULL),
  ('mbr-liam', 'acct-aerion-labs', 'usr-liam', 'liam@aerionlabs.com', 'Liam Vega', 'owner', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mbr-tara', 'acct-aerion-labs', 'usr-tara', 'tara@aerionlabs.com', 'Tara Malik', 'viewer', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  role=excluded.role,
  status=excluded.status,
  last_active_at=excluded.last_active_at;

INSERT INTO company_subscriptions (id, company_id, stripe_subscription_id, plan_name, status, seats, mrr_cents, current_period_start, current_period_end)
VALUES
  ('sub-justevery', 'acct-justevery', 'sub_justevery_demo', 'Scale', 'active', 12, 540000, DATE('now','-15 days'), DATE('now','+15 days')),
  ('sub-aerion', 'acct-aerion-labs', 'sub_aerion_demo', 'Launch', 'active', 8, 210000, DATE('now','-10 days'), DATE('now','+20 days'))
ON CONFLICT(id) DO UPDATE SET
  plan_name=excluded.plan_name,
  status=excluded.status,
  seats=excluded.seats,
  mrr_cents=excluded.mrr_cents,
  current_period_start=excluded.current_period_start,
  current_period_end=excluded.current_period_end;

INSERT INTO stripe_customers (id, company_id, stripe_customer_id, billing_email)
VALUES
  ('cus-justevery', 'acct-justevery', 'cus_justevery_demo', 'billing@justevery.com'),
  ('cus-aerion', 'acct-aerion-labs', 'cus_aerion_demo', 'finance@aerionlabs.com')
ON CONFLICT(id) DO UPDATE SET billing_email=excluded.billing_email;

INSERT INTO company_usage_daily (company_id, usage_date, metric, value)
VALUES
  ('acct-justevery', DATE('now','-0 days'), 'requests', 10000),
  ('acct-justevery', DATE('now','-1 days'), 'requests', 10750),
  ('acct-justevery', DATE('now','-2 days'), 'requests', 11500),
  ('acct-justevery', DATE('now','-3 days'), 'requests', 12250),
  ('acct-justevery', DATE('now','-4 days'), 'requests', 13000),
  ('acct-justevery', DATE('now','-5 days'), 'requests', 13750),
  ('acct-justevery', DATE('now','-6 days'), 'requests', 14500)
ON CONFLICT(company_id, usage_date, metric) DO UPDATE SET value=excluded.value;

INSERT INTO company_usage_daily (company_id, usage_date, metric, value)
VALUES
  ('acct-justevery', DATE('now','-0 days'), 'storage_mb', 1200),
  ('acct-justevery', DATE('now','-1 days'), 'storage_mb', 1245),
  ('acct-justevery', DATE('now','-2 days'), 'storage_mb', 1290),
  ('acct-justevery', DATE('now','-3 days'), 'storage_mb', 1335),
  ('acct-justevery', DATE('now','-4 days'), 'storage_mb', 1380),
  ('acct-justevery', DATE('now','-5 days'), 'storage_mb', 1425),
  ('acct-justevery', DATE('now','-6 days'), 'storage_mb', 1470)
ON CONFLICT(company_id, usage_date, metric) DO UPDATE SET value=excluded.value;

INSERT INTO company_usage_daily (company_id, usage_date, metric, value)
VALUES
  ('acct-aerion-labs', DATE('now','-0 days'), 'requests', 4200),
  ('acct-aerion-labs', DATE('now','-1 days'), 'requests', 4520),
  ('acct-aerion-labs', DATE('now','-2 days'), 'requests', 4840),
  ('acct-aerion-labs', DATE('now','-3 days'), 'requests', 5160),
  ('acct-aerion-labs', DATE('now','-4 days'), 'requests', 5480),
  ('acct-aerion-labs', DATE('now','-5 days'), 'requests', 5800),
  ('acct-aerion-labs', DATE('now','-6 days'), 'requests', 6120)
ON CONFLICT(company_id, usage_date, metric) DO UPDATE SET value=excluded.value;

INSERT INTO company_usage_daily (company_id, usage_date, metric, value)
VALUES
  ('acct-aerion-labs', DATE('now','-0 days'), 'storage_mb', 640),
  ('acct-aerion-labs', DATE('now','-1 days'), 'storage_mb', 670),
  ('acct-aerion-labs', DATE('now','-2 days'), 'storage_mb', 700),
  ('acct-aerion-labs', DATE('now','-3 days'), 'storage_mb', 730),
  ('acct-aerion-labs', DATE('now','-4 days'), 'storage_mb', 760),
  ('acct-aerion-labs', DATE('now','-5 days'), 'storage_mb', 790),
  ('acct-aerion-labs', DATE('now','-6 days'), 'storage_mb', 820)
ON CONFLICT(company_id, usage_date, metric) DO UPDATE SET value=excluded.value;

INSERT INTO company_assets (id, company_id, storage_key, scope, content_type, size_bytes, checksum)
VALUES
  ('asset-logo-justevery', 'acct-justevery', 'companies/acct-justevery/uploads/branding/logo.png', 'branding', 'image/png', 182034, 'demo-checksum-1'),
  ('asset-invoice-justevery', 'acct-justevery', 'companies/acct-justevery/uploads/invoices/2024-09.pdf', 'invoices', 'application/pdf', 58234, 'demo-checksum-2')
ON CONFLICT(id) DO UPDATE SET storage_key=excluded.storage_key;
