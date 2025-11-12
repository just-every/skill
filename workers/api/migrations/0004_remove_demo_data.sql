-- Migration number: 0004
-- Migration name: remove_demo_data
PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- Remove usage and asset rows tied to demo accounts
DELETE FROM company_usage_daily WHERE company_id IN ('acct-justevery', 'acct-aerion-labs');
DELETE FROM company_assets WHERE company_id IN ('acct-justevery', 'acct-aerion-labs');

-- Remove billing artifacts and memberships
DELETE FROM company_members WHERE company_id IN ('acct-justevery', 'acct-aerion-labs');
DELETE FROM company_subscriptions WHERE company_id IN ('acct-justevery', 'acct-aerion-labs');
DELETE FROM company_branding_settings WHERE company_id IN ('acct-justevery', 'acct-aerion-labs');
DELETE FROM stripe_customers WHERE company_id IN ('acct-justevery', 'acct-aerion-labs');

-- Remove the companies themselves
DELETE FROM companies WHERE id IN ('acct-justevery', 'acct-aerion-labs');

-- Remove demo users that only existed for sample accounts
DELETE FROM users WHERE id IN ('usr-ava', 'usr-james', 'usr-eloise', 'usr-liam', 'usr-tara');

COMMIT;
