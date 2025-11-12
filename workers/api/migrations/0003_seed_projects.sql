-- Migration number: 0003
-- Migration name: seed_projects
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO projects (id, slug, domain, app_url)
VALUES ('starter', 'starter', 'starter.justevery.com', 'https://starter.justevery.com/app');

UPDATE companies
SET project_id = 'starter'
WHERE id = 'acct-justevery'
  AND (project_id IS NULL OR project_id = '' OR project_id = 'starter');
