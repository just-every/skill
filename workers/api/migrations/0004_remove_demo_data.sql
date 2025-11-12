-- Migration number: 0004
-- Migration name: remove_demo_data
-- The original version of this migration deleted seeded demo companies
-- (acct-justevery, acct-aerion-labs) after production cleanup on 2025-11-12.
-- It has been converted to a no-op so future environments simply skip it.
PRAGMA foreign_keys = ON;
-- no-op
