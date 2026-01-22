-- Migration number: 0006
-- Migration name: organizations
PRAGMA foreign_keys = OFF;

ALTER TABLE companies RENAME TO organizations;
ALTER TABLE company_members RENAME TO organization_members;
ALTER TABLE member_invites RENAME TO organization_member_invites;
ALTER TABLE company_assets RENAME TO organization_assets;
ALTER TABLE company_usage_daily RENAME TO organization_usage_daily;
ALTER TABLE stripe_customers RENAME TO organization_stripe_customers;
ALTER TABLE company_subscriptions RENAME TO organization_subscriptions;
ALTER TABLE audit_log_company_links RENAME TO audit_log_organization_links;

DROP TABLE IF EXISTS company_branding_settings;

PRAGMA foreign_keys = ON;

